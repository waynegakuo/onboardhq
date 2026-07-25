/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
import {defineSecret} from 'firebase-functions/params';
import {enableFirebaseTelemetry} from '@genkit-ai/firebase';
import {googleAI} from '@genkit-ai/google-genai';
import {genkit, z} from 'genkit';
import {onCallGenkit} from 'firebase-functions/https';
import {GoogleGenAI} from '@google/genai';
import * as admin from 'firebase-admin';
import {FieldValue} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions/v2';
import {CHAT_WITH_FILE_SEARCH_SYSTEM_PROMPT, KNOWLEDGE_BASE_FALLBACK} from './system-prompt';

admin.initializeApp();
const db = admin.firestore();

/** Firestore-side identifier of the knowledge base File Search store. */
const FILE_SEARCH_STORE_NAME = 'obhqknowledge';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Detect if the function is running in the Firebase Emulator Suite.
const isEmulated = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development';

enableFirebaseTelemetry();

// Configure Genkit
const ai = genkit({
  plugins: [googleAI({apiKey: process.env.GEMINI_API_KEY})],
  model: googleAI.model('gemini-3.1-flash-lite', {contextCache: true}),
});

const GENKIT_FUNCTION_CONFIG = {
  secrets: [GEMINI_API_KEY],
  region: 'africa-south1',
  cors: isEmulated
    ? true
    : [
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      'http://localhost:5001',
      /^https:\/\/onboarding-hq(--[a-z0-9-]+)?\.web\.app$/,
    ],
};

// Schema for a single conversation message passed from the client
const conversationMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/** Converts client-side history into Genkit MessageData parts. */
function toGenkitMessages(history: ConversationMessage[]) {
  return history.map((msg) => ({
    role: msg.role as 'user' | 'model',
    content: [{text: msg.content}],
  }));
}

/** Outcome of looking up the knowledge base store before answering a question. */
type StoreLookup =
  | {status: 'ok'; googleFileSearchStoreName: string}
  | {status: 'not_initialized' | 'misconfigured' | 'empty'};

/**
 * Resolves the Google File Search store backing the knowledge base, and reports
 * *why* it is unusable when it is, so the caller can explain it to the user.
 */
async function resolveFileSearchStore(storeName: string): Promise<StoreLookup> {
  const storeRef = db.collection('obhqFileSearchStores').doc(storeName);
  const storeSnap = await storeRef.get();

  if (!storeSnap.exists) {
    return {status: 'not_initialized'};
  }

  const googleFileSearchStoreName = storeSnap.data()?.googleFileSearchStoreName;
  if (!googleFileSearchStoreName) {
    return {status: 'misconfigured'};
  }

  // A registered store with no indexed documents answers nothing useful, so
  // treat it as its own failure mode rather than letting the model guess.
  const files = await storeRef.collection('files').limit(1).get();
  if (files.empty) {
    return {status: 'empty'};
  }

  return {status: 'ok', googleFileSearchStoreName};
}

/**
 * True when an error from `ai.generate` indicates the File Search store itself is
 * gone or inaccessible, rather than a transient failure of the search service.
 */
function isMissingStoreError(error: unknown, googleFileSearchStoreName: string): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const mentionsStore =
    message.includes('filesearchstore') ||
    message.includes('file search store') ||
    message.includes(googleFileSearchStoreName.toLowerCase());
  const notFound =
    message.includes('not_found') ||
    message.includes('not found') ||
    message.includes('permission_denied') ||
    message.includes('permission denied') ||
    message.includes('404') ||
    message.includes('403');

  return mentionsStore && notFound;
}

export const _uploadToFileSearchStoreLogic = ai.defineFlow(
  {
    name: 'uploadToFileSearchStore',
    inputSchema: z.object({
      fileData: z.string(), // Base64 encoded file data
      mimeType: z.string(),
      displayName: z.string().optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      operationName: z.string(),
    }),
  },
  async ({fileData, mimeType, displayName}) => {
    const fileSearchStoreName = FILE_SEARCH_STORE_NAME;
    const genAI = new GoogleGenAI({});

    // 1. Get or create File Search Store from Firestore
    const storeRef = db.collection('obhqFileSearchStores').doc(fileSearchStoreName);
    const storeSnap = await storeRef.get();

    let googleFileSearchStoreName: string;

    if (!storeSnap.exists) {
      const fileSearchStore = await genAI.fileSearchStores.create({
        config: { displayName: fileSearchStoreName }
      });
      googleFileSearchStoreName = fileSearchStore.name!;

      await storeRef.set({
        googleFileSearchStoreName: googleFileSearchStoreName,
        displayName: fileSearchStoreName,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      googleFileSearchStoreName = storeSnap.data()?.googleFileSearchStoreName;
      if (!googleFileSearchStoreName) {
        throw new Error('Store exists in Firestore but missing googleFileSearchStoreName');
      }
    }

    // Create a Blob from the base64 data
    const blob = new Blob([Buffer.from(fileData, 'base64')], { type: mimeType });

    // Normalize MIME type for DOCX if it's the long official one that sometimes causes issues
    // with the Google GenAI FileSearchStore API. Setting it to undefined allows the API
    // to infer the type correctly from the content/extension.
    const uploadMimeType =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? undefined
        : mimeType;

    let operation = await genAI.fileSearchStores.uploadToFileSearchStore({
      file: blob,
      fileSearchStoreName: googleFileSearchStoreName,
      config: {
        displayName: displayName || 'uploaded-file',
        mimeType: uploadMimeType,
      }
    });

    // Wait for the operation to complete
    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const operationResult = await genAI.operations.get({
        operation: operation
      });
      operation = operationResult as any;
    }

    if (operation.error) {
      throw new Error(`UPLOAD_FAILED: ${JSON.stringify(operation.error)}`);
    }

    // 2. Save file metadata to subcollection
    const fileRef = storeRef.collection('files').doc();
    await fileRef.set({
      displayName: displayName || 'uploaded-file',
      mimeType: mimeType,
      operationName: operation.name || '',
      uploadedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      operationName: operation.name || ''
    };
  }
);

export const uploadToFileSearchStore = onCallGenkit(
  GENKIT_FUNCTION_CONFIG,
  _uploadToFileSearchStoreLogic
);


export const _chatWithFileSearchLogic = ai.defineFlow(
  {
    name: 'chatWithFileSearch',
    inputSchema: z.object({
      question: z.string(),
      history: z.array(conversationMessageSchema).optional(),
    }),
    outputSchema: z.string(),
  },
  async({question, history}) => {
    const fileSearchStoreName = FILE_SEARCH_STORE_NAME;

    // 1. Resolve the Google File Search store. When it is unusable we answer with
    // an explanation instead of throwing: onCallGenkit strips error details before
    // they reach the browser, so a throw would surface as a generic failure.
    const store = await resolveFileSearchStore(fileSearchStoreName);

    if (store.status !== 'ok') {
      logger.warn('Knowledge base unavailable for chat request', {
        fileSearchStoreName,
        reason: store.status,
      });

      switch (store.status) {
      case 'not_initialized':
        return KNOWLEDGE_BASE_FALLBACK.notInitialized(fileSearchStoreName);
      case 'misconfigured':
        return KNOWLEDGE_BASE_FALLBACK.misconfigured(fileSearchStoreName);
      case 'empty':
        return KNOWLEDGE_BASE_FALLBACK.empty();
      }
    }

    const {googleFileSearchStoreName} = store;

    try {
      const response = await ai.generate({
        system: CHAT_WITH_FILE_SEARCH_SYSTEM_PROMPT,
        messages: [
          ...toGenkitMessages(history ?? []),
          {role: 'user', content: [{text: question}]},
        ],
        config: {
          tools: [
            {
              fileSearch: {
                fileSearchStoreNames: [googleFileSearchStoreName]
              }
            }
          ]
        }
      });

      return response.text;
    } catch (error) {
      // Firestore can point at a store Google no longer has (deleted, expired, or
      // a credentials/project mismatch). Tell the user that rather than failing.
      if (isMissingStoreError(error, googleFileSearchStoreName)) {
        logger.error('File Search store missing upstream', {
          fileSearchStoreName,
          googleFileSearchStoreName,
          error,
        });
        return KNOWLEDGE_BASE_FALLBACK.missingUpstream();
      }

      logger.error('File Search lookup failed', {
        fileSearchStoreName,
        googleFileSearchStoreName,
        error,
      });
      return KNOWLEDGE_BASE_FALLBACK.searchUnavailable();
    }
  }
);

export const chatWithFileSearch = onCallGenkit(
  GENKIT_FUNCTION_CONFIG,
  _chatWithFileSearchLogic
);
