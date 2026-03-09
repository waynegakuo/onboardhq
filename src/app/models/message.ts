import {SafeHtml} from '@angular/platform-browser';

export type MessageRole = 'user' | 'ai';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  formattedText?: SafeHtml;
}
