export type MessageRole = 'user' | 'ai';

export type MessageFeedback = 'helpful' | 'not-helpful' | null;

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  renderedHtml?: string;
  citations?: string[];
  hasUploadHint?: boolean;
  isError?: boolean;
  feedback?: MessageFeedback;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  pinned: boolean;
  messages: Message[];
}

export interface IndexedDocument {
  id: string;
  displayName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface StarterPrompt {
  id: string;
  category: string;
  title: string;
  prompt: string;
}
