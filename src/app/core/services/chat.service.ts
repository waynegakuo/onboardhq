import { inject, Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatInput {
  question: string;
  history?: ChatMessage[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private functions = inject(Functions);

  async sendMessage(data: ChatInput): Promise<string> {
    const chatFn = httpsCallable<ChatInput, string>(
      this.functions,
      'chatWithFileSearch'
    );
    const result = await chatFn(data);
    return result.data;
  }
}
