import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  signal,
  viewChild,
  effect,
  inject,
} from '@angular/core';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../models/message';
import { ChatService, ChatMessage } from '../../core/services/chat.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chat-feature-host',
  },
})
export class HomeComponent {
  private chatService = inject(ChatService);
  messages = signal<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: 'Hello! How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  userInput = signal('');
  isTyping = signal(false);

  private readonly scrollContainer =
    viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  constructor() {
    effect(() => {
      // Auto-scroll when messages change
      const messages = this.messages();
      const container = this.scrollContainer();
      if (container && messages.length) {
        setTimeout(() => {
          container.nativeElement.scrollTop = container.nativeElement.scrollHeight;
        }, 0);
      }
    });
  }

  async sendMessage() {
    const text = this.userInput().trim();
    if (!text || this.isTyping()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    this.messages.update((msgs) => [...msgs, userMessage]);
    this.userInput.set('');
    this.isTyping.set(true);

    try {
      // Map current messages to history format expected by the service
      // We skip the last message (the one we just added) for the history array
      // but the backend takes 'question' separately.
      const history: ChatMessage[] = this.messages()
        .slice(0, -1)
        .map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          content: m.content
        }));

      const response = await this.chatService.sendMessage({
        question: text,
        history
      });

      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'ai',
        content: response,
        timestamp: new Date(),
      };

      this.messages.update((msgs) => [...msgs, aiMessage]);
    } catch (error) {
      console.error('Failed to get AI response:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'ai',
        content: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date(),
      };
      this.messages.update((msgs) => [...msgs, errorMessage]);
    } finally {
      this.isTyping.set(false);
    }
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
