import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ConversationService } from './services/conversation.service';
import { SidebarComponent } from './shared/components/sidebar/sidebar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgOptimizedImage, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly conversationService = inject(ConversationService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly title = signal('Onboard HQ');
  readonly isSidebarCollapsed = signal(false);

  private readonly mobileDrawerRef = viewChild<ElementRef<HTMLDialogElement>>('mobileDrawer');
  private pressedOutsideDrawer = false;

  constructor() {
    afterNextRender(() => {
      this.setupDrawerLightDismissFallback();
    });
  }

  toggleDesktopSidebar(): void {
    this.isSidebarCollapsed.update((collapsed) => !collapsed);
  }

  openMobileDrawer(): void {
    const dialog = this.mobileDrawerRef()?.nativeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  closeMobileDrawer(): void {
    const dialog = this.mobileDrawerRef()?.nativeElement;
    if (dialog?.open) {
      dialog.close();
    }
  }

  startNewChatMobile(): void {
    this.conversationService.startNewConversation();
    void this.router.navigateByUrl('/');
  }

  private setupDrawerLightDismissFallback(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof HTMLDialogElement === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    const dialog = this.mobileDrawerRef()?.nativeElement;
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
      this.pressedOutsideDrawer = isOutside(e);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (this.pressedOutsideDrawer && isOutside(e)) {
        dialog.close();
      }
    });
  }
}
