import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-chat-composer',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComposerComponent {
  readonly disabled = input(false);
  readonly turnCount = input(0);

  readonly sendPrompt = output<string>();
  readonly newTopic = output<void>();

  readonly promptControl = new FormControl('', { nonNullable: true });
  private readonly rawValue = toSignal(this.promptControl.valueChanges, { initialValue: '' });
  readonly hasText = computed(() => this.rawValue().trim().length > 0);

  private readonly formRef = viewChild<ElementRef<HTMLFormElement>>('composerForm');
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('promptTextarea');

  private lastCompositionEndAt: number | null = null;

  focusInput(): void {
    this.textareaRef()?.nativeElement.focus();
  }

  onCompositionEnd(event: CompositionEvent): void {
    this.lastCompositionEndAt = event.timeStamp;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      // Prevent premature submission while an Input Method Editor (IME) is composing
      if (event.isComposing || event.keyCode === 229) {
        return;
      }

      if (
        this.lastCompositionEndAt !== null &&
        Math.abs(event.timeStamp - this.lastCompositionEndAt) < 50
      ) {
        return;
      }

      this.formRef()?.nativeElement.requestSubmit();
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const text = this.promptControl.value.trim();
    if (!text || this.disabled()) return;

    this.promptControl.setValue('');
    this.sendPrompt.emit(text);
  }
}
