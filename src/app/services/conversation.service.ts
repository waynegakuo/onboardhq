import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  Conversation,
  IndexedDocument,
  Message,
  MessageFeedback,
} from '../models/message';
import { MarkdownUtils } from '../utils/markdown-utils';
import { ChatMessage, ChatService } from './chat.service';

const CONVERSATIONS_STORAGE_KEY = 'obhq_conversations_v1';
const DOCUMENTS_STORAGE_KEY = 'obhq_indexed_docs_v1';

interface SerializedMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  citations?: string[];
  hasUploadHint?: boolean;
  isError?: boolean;
  feedback?: MessageFeedback;
}

interface SerializedConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  messages: SerializedMessage[];
}

interface SerializedDocument {
  id: string;
  displayName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConversationService {
  private readonly chatService = inject(ChatService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly initialThread = this.buildEmptyConversation('initial');

  readonly conversations = signal<Conversation[]>([this.initialThread]);
  readonly activeConversationId = signal<string>(this.initialThread.id);
  readonly isGenerating = signal(false);
  readonly liveAnnouncement = signal('');
  readonly uploadedDocuments = signal<IndexedDocument[]>([]);

  readonly activeConversation = computed<Conversation>(() => {
    const list = this.conversations();
    const activeId = this.activeConversationId();
    return list.find((c) => c.id === activeId) ?? list[0] ?? this.initialThread;
  });

  readonly activeMessages = computed<Message[]>(() => this.activeConversation().messages);

  /** Unique citations referenced across all turns in the active conversation. */
  readonly activeCitations = computed<string[]>(() => {
    const unique = new Set<string>();
    for (const msg of this.activeMessages()) {
      for (const cite of msg.citations ?? []) {
        unique.add(cite);
      }
    }
    return Array.from(unique);
  });

  /** Count of user/assistant turns in the active conversation. */
  readonly activeTurnCount = computed(() =>
    Math.ceil(this.activeMessages().filter((m) => m.role === 'user').length),
  );

  constructor() {
    afterNextRender(() => {
      this.hydrateFromStorage();
    });
  }

  startNewConversation(): string {
    const current = this.activeConversation();
    if (current && current.messages.length === 0) {
      return current.id;
    }

    const existingEmpty = this.conversations().find((c) => c.messages.length === 0);
    if (existingEmpty) {
      this.activeConversationId.set(existingEmpty.id);
      return existingEmpty.id;
    }

    const fresh = this.buildEmptyConversation();
    this.conversations.update((list) => [fresh, ...list]);
    this.activeConversationId.set(fresh.id);
    this.persistConversations();
    this.announce('Started a new conversation');
    return fresh.id;
  }

  selectConversation(id: string): void {
    if (this.conversations().some((c) => c.id === id)) {
      this.activeConversationId.set(id);
    }
  }

  renameConversation(id: string, rawTitle: string): void {
    const trimmed = rawTitle.trim();
    if (!trimmed) return;

    this.conversations.update((list) =>
      list.map((conv) =>
        conv.id === id
          ? { ...conv, title: trimmed.slice(0, 80), updatedAt: new Date() }
          : conv,
      ),
    );
    this.persistConversations();
  }

  togglePinConversation(id: string): void {
    this.conversations.update((list) =>
      list.map((conv) => (conv.id === id ? { ...conv, pinned: !conv.pinned } : conv)),
    );
    this.persistConversations();
  }

  deleteConversation(id: string): void {
    const remaining = this.conversations().filter((conv) => conv.id !== id);
    if (remaining.length === 0) {
      const fresh = this.buildEmptyConversation();
      this.conversations.set([fresh]);
      this.activeConversationId.set(fresh.id);
    } else {
      this.conversations.set(remaining);
      if (this.activeConversationId() === id) {
        this.activeConversationId.set(remaining[0].id);
      }
    }
    this.persistConversations();
    this.announce('Conversation deleted');
  }

  setMessageFeedback(messageId: string, feedback: MessageFeedback): void {
    const targetId = this.activeConversation().id;
    this.conversations.update((list) =>
      list.map((conv) => {
        if (conv.id !== targetId) return conv;
        return {
          ...conv,
          messages: conv.messages.map((msg) =>
            msg.id === messageId
              ? { ...msg, feedback: msg.feedback === feedback ? null : feedback }
              : msg,
          ),
        };
      }),
    );
    this.persistConversations();
  }

  async sendMessage(rawQuestion: string): Promise<void> {
    const question = rawQuestion.trim();
    if (!question || this.isGenerating()) return;

    const conv = this.activeConversation();
    const priorMessages = conv.messages;

    const userMessage: Message = {
      id: this.generateId('msg'),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    const nextTitle =
      priorMessages.length === 0 && conv.title === 'New conversation'
        ? this.deriveTitle(question)
        : conv.title;

    this.updateConversationMessages(conv.id, [...priorMessages, userMessage], nextTitle);
    await this.requestAssistantTurn(conv.id, question, priorMessages);
  }

  async editAndResubmit(messageId: string, updatedQuestion: string): Promise<void> {
    const question = updatedQuestion.trim();
    if (!question || this.isGenerating()) return;

    const conv = this.activeConversation();
    const index = conv.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;

    const priorMessages = conv.messages.slice(0, index);
    const editedUserMessage: Message = {
      id: this.generateId('msg'),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    const nextTitle = index === 0 ? this.deriveTitle(question) : conv.title;
    this.updateConversationMessages(conv.id, [...priorMessages, editedUserMessage], nextTitle);
    await this.requestAssistantTurn(conv.id, question, priorMessages);
  }

  async regenerateLastResponse(): Promise<void> {
    if (this.isGenerating()) return;

    const conv = this.activeConversation();
    const messages = conv.messages;
    if (messages.length < 2) return;

    const lastMsg = messages[messages.length - 1];
    const precedingUserMsg = messages[messages.length - 2];
    if (lastMsg.role !== 'ai' || precedingUserMsg.role !== 'user') return;

    const historyBeforeTurn = messages.slice(0, -2);
    this.updateConversationMessages(conv.id, messages.slice(0, -1), conv.title);
    await this.requestAssistantTurn(conv.id, precedingUserMsg.content, historyBeforeTurn);
  }

  recordUploadedDocument(doc: Omit<IndexedDocument, 'id' | 'uploadedAt'>): void {
    const record: IndexedDocument = {
      ...doc,
      id: this.generateId('doc'),
      uploadedAt: new Date(),
    };
    this.uploadedDocuments.update((docs) => [record, ...docs]);
    this.persistDocuments();
  }

  announce(message: string): void {
    this.liveAnnouncement.set('');
    setTimeout(() => {
      this.liveAnnouncement.set(message);
    }, 30);
  }

  private async requestAssistantTurn(
    conversationId: string,
    question: string,
    priorMessages: Message[],
  ): Promise<void> {
    this.isGenerating.set(true);

    try {
      // Only include clean prior turns (skip client-side transport error messages)
      const history: ChatMessage[] = priorMessages
        .filter((m) => !m.isError)
        .map((m) => ({
          role: m.role === 'ai' ? 'model' : 'user',
          content: m.content,
        }));

      const responseText = await this.chatService.sendMessage({
        question,
        history,
      });

      const aiMessage: Message = this.hydrateMessage({
        id: this.generateId('msg'),
        role: 'ai',
        content: responseText,
        timestamp: new Date(),
      });

      this.appendMessageToConversation(conversationId, aiMessage);
      this.announce('Assistant response received');
    } catch (error: unknown) {
      console.error('Failed to get AI response:', error);
      const errorText = this.describeError(error);
      const errorMessage: Message = this.hydrateMessage({
        id: this.generateId('msg'),
        role: 'ai',
        content: errorText,
        timestamp: new Date(),
        isError: true,
      });

      this.appendMessageToConversation(conversationId, errorMessage);
      this.announce('Unable to complete request');
    } finally {
      this.isGenerating.set(false);
    }
  }

  private hydrateMessage(base: Message): Message {
    if (base.role !== 'ai') return base;
    return {
      ...base,
      renderedHtml: MarkdownUtils.formatMarkdown(base.content),
      citations: base.citations ?? MarkdownUtils.extractCitations(base.content),
      hasUploadHint: base.hasUploadHint ?? MarkdownUtils.hasUploadActionHint(base.content),
    };
  }

  private updateConversationMessages(
    conversationId: string,
    messages: Message[],
    title: string,
  ): void {
    const now = new Date();
    this.conversations.update((list) =>
      list.map((conv) =>
        conv.id === conversationId ? { ...conv, title, messages, updatedAt: now } : conv,
      ),
    );
    this.persistConversations();
  }

  private appendMessageToConversation(conversationId: string, message: Message): void {
    const now = new Date();
    this.conversations.update((list) =>
      list.map((conv) =>
        conv.id === conversationId
          ? { ...conv, messages: [...conv.messages, message], updatedAt: now }
          : conv,
      ),
    );
    this.persistConversations();
  }

  private deriveTitle(firstQuestion: string): string {
    const cleaned = firstQuestion.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 46) return cleaned;
    return `${cleaned.slice(0, 44).trimEnd()}…`;
  }

  private buildEmptyConversation(idOverride?: string): Conversation {
    const now = new Date();
    return {
      id: idOverride ?? this.generateId('conv'),
      title: 'New conversation',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      messages: [],
    };
  }

  private generateId(prefix: string): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${rand}`;
  }

  private describeError(error: unknown): string {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';

    switch (code) {
      case 'functions/unauthenticated':
      case 'functions/permission-denied':
        return "It looks like you've been signed out.\n\n**What you can do:** refresh the page and sign in again, then ask your question one more time.";
      case 'functions/unavailable':
        return "I couldn't connect just now.\n\n**What you can do:** check that you're still online, then try again in a moment.";
      case 'functions/deadline-exceeded':
        return 'That one took longer than I had to answer it.\n\n**What you can do:** try again — asking about one thing at a time usually gets a quicker answer.';
      case 'functions/resource-exhausted':
        return "I'm handling a lot of questions at the moment and can't take another one right away.\n\n**What you can do:** give it a few minutes and try again.";
      case 'functions/not-found':
        return "I'm not available right now — something on our side needs attention before I can answer.\n\n**What you can do:** let your HR or IT team know that the Onboard HQ assistant isn't responding.";
      default:
        return 'Something went wrong on my end — nothing to do with the way you asked.\n\n**What you can do:** try again in a moment. If I keep failing, let your HR or IT team know so someone can take a look.';
    }
  }

  private hydrateFromStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const rawConvs = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
      if (rawConvs) {
        const parsed = JSON.parse(rawConvs) as SerializedConversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored: Conversation[] = parsed.map((conv) => ({
            id: conv.id,
            title: conv.title,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            pinned: Boolean(conv.pinned),
            messages: (conv.messages ?? []).map((m) =>
              this.hydrateMessage({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.timestamp),
                citations: m.citations,
                hasUploadHint: m.hasUploadHint,
                isError: m.isError,
                feedback: m.feedback ?? null,
              }),
            ),
          }));

          this.conversations.set(restored);
          this.activeConversationId.set(restored[0].id);
        }
      }

      const rawDocs = localStorage.getItem(DOCUMENTS_STORAGE_KEY);
      if (rawDocs) {
        const parsedDocs = JSON.parse(rawDocs) as SerializedDocument[];
        if (Array.isArray(parsedDocs)) {
          this.uploadedDocuments.set(
            parsedDocs.map((d) => ({
              ...d,
              uploadedAt: new Date(d.uploadedAt),
            })),
          );
        }
      }
    } catch {
      // Fall back to fresh in-memory state if storage payload is malformed
    }
  }

  private persistConversations(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const payload: SerializedConversation[] = this.conversations().map((conv) => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
        pinned: conv.pinned,
        messages: conv.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          citations: m.citations,
          hasUploadHint: m.hasUploadHint,
          isError: m.isError,
          feedback: m.feedback ?? null,
        })),
      }));
      localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota or storage restriction errors
    }
  }

  private persistDocuments(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const payload: SerializedDocument[] = this.uploadedDocuments().map((d) => ({
        ...d,
        uploadedAt: d.uploadedAt.toISOString(),
      }));
      localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage restriction errors
    }
  }
}
