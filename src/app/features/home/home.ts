import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  signal,
  viewChild,
  effect,
  inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../models/message';
import { ChatService, ChatMessage } from '../../services/chat.service';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {MarkdownUtils} from '../../utils/markdown-utils';

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
  private sanitizer = inject(DomSanitizer);

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
        formattedText: this.formatMarkdown(response),
        timestamp: new Date(),
      };

      this.messages.update((msgs) => [...msgs, aiMessage]);
    } catch (error: any) {
      console.error('Failed to get AI response:', error);

      const errorMessageText = this.describeError(error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'ai',
        content: errorMessageText,
        formattedText: this.formatMarkdown(errorMessageText),
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

  /**
   * Turns a failed request into something a new hire can act on.
   *
   * Anyone using the chat may see these, so they stay in plain language — no
   * service names, error codes, or internal details. Diagnostics belong in the
   * console log above, not in the chat bubble.
   */
  private describeError(error: any): string {
    const code: string = error?.code ?? '';

    switch (code) {
      case 'functions/unauthenticated':
      case 'functions/permission-denied':
        return 'It looks like you\'ve been signed out.\n\n**What you can do:** refresh the page and sign in again, then ask your question one more time.';
      case 'functions/unavailable':
        return 'I couldn\'t connect just now.\n\n**What you can do:** check that you\'re still online, then try again in a moment.';
      case 'functions/deadline-exceeded':
        return 'That one took longer than I had to answer it.\n\n**What you can do:** try again — asking about one thing at a time usually gets a quicker answer.';
      case 'functions/resource-exhausted':
        return 'I\'m handling a lot of questions at the moment and can\'t take another one right away.\n\n**What you can do:** give it a few minutes and try again.';
      case 'functions/not-found':
        return 'I\'m not available right now — something on our side needs attention before I can answer.\n\n**What you can do:** let your HR or IT team know that the Onboard HQ assistant isn\'t responding.';
      default:
        return 'Something went wrong on my end — nothing to do with the way you asked.\n\n**What you can do:** try again in a moment. If I keep failing, let your HR or IT team know so someone can take a look.';
    }
  }

  private formatMarkdown(text: string): SafeHtml {
    const html = MarkdownUtils.formatMarkdown(text);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
