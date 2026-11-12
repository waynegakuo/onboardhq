import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export type ColorSchemeOverride = 'light' | 'dark' | null;

const STORAGE_KEY = 'color-scheme';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly systemPrefersDark = signal(false);
  readonly overrideScheme = signal<ColorSchemeOverride>(null);

  /** Currently rendered color scheme, accounting for explicit override or OS preference. */
  readonly resolvedScheme = computed<'light' | 'dark'>(() => {
    const override = this.overrideScheme();
    if (override) return override;
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  readonly isDark = computed(() => this.resolvedScheme() === 'dark');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initBrowserThemeSync();
    }
  }

  /**
   * Two-state comfort toggle backed by tri-state storage (`light dark` | `light` | `dark`):
   * switches to the opposite of what is currently rendered, and removes the stored override
   * whenever the target matches the OS preference so system auto-switching stays intact.
   */
  toggleScheme(): void {
    const target: 'light' | 'dark' = this.resolvedScheme() === 'dark' ? 'light' : 'dark';
    const currentSystem: 'light' | 'dark' = this.systemPrefersDark() ? 'dark' : 'light';

    if (target === currentSystem) {
      this.applyOverride(null);
    } else {
      this.applyOverride(target);
    }
  }

  resetToSystem(): void {
    this.applyOverride(null);
  }

  private applyOverride(override: ColorSchemeOverride): void {
    this.overrideScheme.set(override);

    if (!isPlatformBrowser(this.platformId)) return;

    try {
      if (override) {
        localStorage.setItem(STORAGE_KEY, override);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors when site data is blocked; still apply to <meta> below.
    }

    this.syncMetaContent(override);
  }

  private syncMetaContent(override: ColorSchemeOverride): void {
    const meta = this.document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) {
      meta.content = override ?? 'light dark';
    }
  }

  private initBrowserThemeSync(): void {
    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    if (mediaQuery) {
      this.systemPrefersDark.set(mediaQuery.matches);
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        this.overrideScheme.set(stored);
        this.syncMetaContent(stored);
      }
    } catch {
      // Proceed with system default if storage is unavailable.
    }

    // Do NOT clear stored override when OS changes to match it (preserves time-of-day pinning)
    const onMediaChange = (event: MediaQueryListEvent) => {
      this.systemPrefersDark.set(event.matches);
    };

    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next =
        event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
      this.overrideScheme.set(next);
      this.syncMetaContent(next);
    };

    mediaQuery?.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorageChange);

    this.destroyRef.onDestroy(() => {
      mediaQuery?.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorageChange);
    });
  }
}
