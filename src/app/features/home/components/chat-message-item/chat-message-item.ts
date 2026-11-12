import { CommonModule, DatePipe, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Message, MessageFeedback } from '../../../../models/message';

@Component({
  selector: 'app-chat-message-item',
  imports: [CommonModule, DatePipe, NgOptimizedImage, ReactiveFormsModule, RouterLink],
  templateUrl: './chat-message-item.html',
  styleUrl: './chat-message-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageItemComponent {
  private readonly platformId = inject(PLATFORM_ID);

  readonly message = input.required<Message>();
  readonly isLastAiMessage = input(false);
  readonly isGenerating = input(false);

  readonly regenerate = output<void>();
  readonly editMessage = output<{ id: string; content: string }>();
  readonly rateFeedback = output<{ id: string; feedback: MessageFeedback }>();
  readonly inspectCitation = output<string>();

  readonly isCopied = signal(false);
  readonly isEditing = signal(false);
  readonly editControl = new FormControl('', { nonNullable: true });

  private lastCompositionEndAt: number | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  async copyContent(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(this.message().content);
      this.isCopied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.isCopied.set(false);
      }, 2000);
    } catch {
      // Clipboard write unavailable
    }
  }

  startEdit(): void {
    this.editControl.setValue(this.message().content);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }

  submitEdit(event?: Event): void {
    event?.preventDefault();
    const updated = this.editControl.value.trim();
    if (!updated) return;
    this.isEditing.set(false);
    this.editMessage.emit({ id: this.message().id, content: updated });
  }

  onCompositionEnd(event: CompositionEvent): void {
    this.lastCompositionEndAt = event.timeStamp;
  }

  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) return;
      if (
        this.lastCompositionEndAt !== null &&
        Math.abs(event.timeStamp - this.lastCompositionEndAt) < 50
      ) {
        return;
      }
      this.submitEdit();
    }
  }

  onFeedback(choice: 'helpful' | 'not-helpful'): void {
    this.rateFeedback.emit({ id: this.message().id, feedback: choice });
  }

  onCitationClick(citation: string): void {
    this.inspectCitation.emit(citation);
  }
}
