import { Inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { DOCUMENT } from 'xforge-common/browser-globals';
import { LocalSettingsService } from './local-settings.service';

/** Type values are defined before the type so they can also be used in Storybook. */
export const appearanceValues = ['device', 'dark', 'light'] as const;

/** Choice of what color styling the application should use. This is an abstract user-facing setting. */
export type Appearance = (typeof appearanceValues)[number];

/** Color styling set that can be applied to the application.  This is a concrete internal specification. */
export enum Theme {
  Default = 'theme-default',
  DefaultDarkMode = 'theme-default-dark',
  NotSet = ''
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private _theme: Theme = Theme.NotSet;
  private mediaQueryList: MediaQueryList | null = null;
  private _appearanceSetting: Appearance;
  /** Default appearance setting to use if there is no user selection */
  private readonly defaultAppearanceSetting: Appearance = 'light';
  private readonly storageKey = 'appearance';

  constructor(
    readonly rendererFactory: RendererFactory2,
    private readonly localSettings: LocalSettingsService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this._appearanceSetting = this.localSettings.get<Appearance>(this.storageKey) ?? this.defaultAppearanceSetting;
    this.apply(this._appearanceSetting);
  }

  set(appearanceSetting: Appearance): void {
    if (this._appearanceSetting === appearanceSetting) return;
    this._appearanceSetting = appearanceSetting;
    this.localSettings.set(this.storageKey, appearanceSetting);
    this.apply(appearanceSetting);
  }

  get appearanceSetting(): Appearance {
    return this._appearanceSetting;
  }

  private get theme(): Theme {
    return this._theme;
  }

  private set theme(theme: Theme) {
    if (theme === this._theme) {
      return;
    }

    if (this._theme !== Theme.NotSet) {
      this.renderer.removeClass(this.document.documentElement, this._theme);
    }
    this.renderer.addClass(this.document.documentElement, theme);
    this._theme = theme;
  }

  private setDarkMode(enabled: boolean): void {
    this.theme = enabled ? Theme.DefaultDarkMode : Theme.Default;
  }

  private apply(appearanceSetting: Appearance): void {
    // Remove any previous media query listener
    if (this.mediaQueryList != null) {
      try {
        this.mediaQueryList.removeEventListener('change', this.handleMediaQueryChange);
      } catch {}
      this.mediaQueryList = null;
    }

    if (appearanceSetting === 'device') {
      // Follow OS preference
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQueryList = mql;
      this.setDarkMode(mql.matches);
      // Use a bound handler so we can remove it later
      mql.addEventListener('change', this.handleMediaQueryChange);
    } else if (appearanceSetting === 'dark') {
      this.setDarkMode(true);
    } else {
      this.setDarkMode(false);
    }
  }

  private handleMediaQueryChange = (e: MediaQueryListEvent): void => {
    this.setDarkMode(e.matches);
  };
}
