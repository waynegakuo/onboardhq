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
import {CHAT_WITH_FILE_SEARCH_SYSTEM_PROMPT} from './system-prompt';

admin.initializeApp();
const db = admin.firestore();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Detect if the function is running in the Firebase Emulator Suite.
const isEmulated = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development';

enableFirebaseTelemetry();

// Configure Genkit
const ai = genkit({
  plugins: [googleAI({apiKey: process.env.GEMINI_API_KEY})],
  model: googleAI.model('gemini-2.5-flash'),
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
    const fileSearchStoreName = 'obhqknowledge';
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
    const fileSearchStoreName = 'obhqknowledge';

    // 1. Get the actual Google File Search store name from Firestore
    const storeSnap = await db.collection('obhqFileSearchStores').doc(fileSearchStoreName).get();
    const googleFileSearchStoreName = storeSnap.data()?.googleFileSearchStoreName;

    if (!googleFileSearchStoreName) {
      throw new Error(`FILE_SEARCH_STORE_NOT_FOUND: File search store ${fileSearchStoreName} not found or not initialized.`);
    }

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
  }
);

export const chatWithFileSearch = onCallGenkit(
  GENKIT_FUNCTION_CONFIG,
  _chatWithFileSearchLogic
);
