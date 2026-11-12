import { CommonModule, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Conversation } from '../../../models/message';
import { ConversationService } from '../../../services/conversation.service';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, NgOptimizedImage, ReactiveFormsModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly conversationService = inject(ConversationService);
  readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly idPrefix = input('desktop');
  readonly showCollapseButton = input(true);
  readonly collapseSidebar = output<void>();
  readonly navigateDone = output<void>();

  readonly searchInputId = computed(() => `${this.idPrefix()}-thread-search`);
  readonly deleteDialogTitleId = computed(() => `${this.idPrefix()}-delete-dialog-title`);

  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchQuery = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  readonly editingId = signal<string | null>(null);
  readonly renameControl = new FormControl('', { nonNullable: true });
  readonly pendingDeleteConversation = signal<Conversation | null>(null);

  private lastCompositionEndAt: number | null = null;
  private pressedOutsideDialog = false;

  private readonly deleteDialogRef = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');

  readonly filteredConversations = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.conversationService.conversations();
    if (!q) return all;
    return all.filter(
      (conv) =>
        conv.title.toLowerCase().includes(q) ||
        conv.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  });

  readonly pinnedConversations = computed(() =>
    this.filteredConversations().filter((c) => c.pinned),
  );

  readonly recentConversations = computed(() =>
    this.filteredConversations().filter((c) => !c.pinned),
  );

  constructor() {
    afterNextRender(() => {
      this.setupDialogLightDismissFallback();
    });
  }

  onNewChat(): void {
    this.conversationService.startNewConversation();
    void this.router.navigateByUrl('/');
    this.navigateDone.emit();
  }

  onSelectConversation(conv: Conversation): void {
    if (this.editingId() === conv.id) return;
    this.conversationService.selectConversation(conv.id);
    void this.router.navigateByUrl('/');
    this.navigateDone.emit();
  }

  onTogglePin(event: MouseEvent, conv: Conversation): void {
    event.stopPropagation();
    this.conversationService.togglePinConversation(conv.id);
  }

  onStartRename(event: MouseEvent, conv: Conversation): void {
    event.stopPropagation();
    this.editingId.set(conv.id);
    this.renameControl.setValue(conv.title);
  }

  onSaveRename(convId: string): void {
    const next = this.renameControl.value.trim();
    if (next) {
      this.conversationService.renameConversation(convId, next);
    }
    this.editingId.set(null);
  }

  onCancelRename(): void {
    this.editingId.set(null);
  }

  onCompositionEnd(event: CompositionEvent): void {
    this.lastCompositionEndAt = event.timeStamp;
  }

  onRenameKeydown(event: KeyboardEvent, convId: string): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancelRename();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) return;
      if (
        this.lastCompositionEndAt !== null &&
        Math.abs(event.timeStamp - this.lastCompositionEndAt) < 50
      ) {
        return;
      }
      this.onSaveRename(convId);
    }
  }

  onRequestDelete(event: MouseEvent, conv: Conversation): void {
    event.stopPropagation();
    this.pendingDeleteConversation.set(conv);
    const dialog = this.deleteDialogRef()?.nativeElement;
    if (dialog && !dialog.open) {
      dialog.returnValue = '';
      dialog.showModal();
    }
  }

  onDeleteDialogClose(): void {
    const dialog = this.deleteDialogRef()?.nativeElement;
    const target = this.pendingDeleteConversation();
    if (dialog) {
      const choice = dialog.returnValue;
      dialog.returnValue = '';
      if (choice === 'delete' && target) {
        this.conversationService.deleteConversation(target.id);
      }
    }
    this.pendingDeleteConversation.set(null);
  }

  onNavLinkClick(): void {
    this.navigateDone.emit();
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  private setupDialogLightDismissFallback(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof HTMLDialogElement === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    const dialog = this.deleteDialogRef()?.nativeElement;
    if (!dialog) return;

    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    dialog.addEventListener('pointerdown', (e) => {
      this.pressedOutsideDialog = isOutside(e);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (this.pressedOutsideDialog && isOutside(e)) {
        dialog.close();
      }
    });
  }
}
