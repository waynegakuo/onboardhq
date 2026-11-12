import { CommonModule, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { MessageFeedback } from '../../models/message';
import { ConversationService } from '../../services/conversation.service';
import { ChatComposerComponent } from './components/chat-composer/chat-composer';
import { ChatMessageItemComponent } from './components/chat-message-item/chat-message-item';
import { ChatWelcomeComponent } from './components/chat-welcome/chat-welcome';
import { SourcesInspectorComponent } from './components/sources-inspector/sources-inspector';

@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    NgOptimizedImage,
    ChatWelcomeComponent,
    ChatMessageItemComponent,
    ChatComposerComponent,
    SourcesInspectorComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chat-feature-host',
  },
})
export class HomeComponent {
  readonly conversationService = inject(ConversationService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly isInspectorOpen = signal(false);
  readonly selectedCitation = signal<string | null>(null);
  readonly showScrollToBottom = signal(false);

  private readonly scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  private readonly composerRef = viewChild(ChatComposerComponent);

  readonly lastAiMessageId = computed<string | null>(() => {
    const msgs = this.conversationService.activeMessages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'ai') return msgs[i].id;
    }
    return null;
  });

  constructor() {
    effect(() => {
      const msgCount = this.conversationService.activeMessages().length;
      const generating = this.conversationService.isGenerating();
      if ((msgCount > 0 || generating) && isPlatformBrowser(this.platformId)) {
        queueMicrotask(() => {
          this.scrollToBottom();
        });
      }
    });
  }

  async onSendPrompt(prompt: string): Promise<void> {
    await this.conversationService.sendMessage(prompt);
  }

  async onStarterPrompt(prompt: string): Promise<void> {
    await this.conversationService.sendMessage(prompt);
  }

  async onEditMessage(payload: { id: string; content: string }): Promise<void> {
    await this.conversationService.editAndResubmit(payload.id, payload.content);
  }

  async onRegenerate(): Promise<void> {
    await this.conversationService.regenerateLastResponse();
  }

  onFeedback(payload: { id: string; feedback: MessageFeedback }): void {
    this.conversationService.setMessageFeedback(payload.id, payload.feedback);
  }

  onNewTopic(): void {
    this.conversationService.startNewConversation();
    this.composerRef()?.focusInput();
  }

  onInspectCitation(citation: string): void {
    this.selectedCitation.set(citation);
    this.isInspectorOpen.set(true);
  }

  toggleInspector(): void {
    this.isInspectorOpen.update((open) => !open);
  }

  closeInspector(): void {
    this.isInspectorOpen.set(false);
  }

  selectCitationInPanel(citation: string): void {
    this.selectedCitation.update((curr) => (curr === citation ? null : citation));
  }

  onStreamScroll(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.showScrollToBottom.set(distanceFromBottom > 140);
  }

  scrollToBottom(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    this.showScrollToBottom.set(false);
  }
}
