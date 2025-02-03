import { Inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { DOCUMENT } from 'xforge-common/browser-globals';
import { LocalSettingsService } from './local-settings.service';

export enum Theme {
  Light = 'theme-light',
  Dark = 'theme-dark',
  NotSet = ''
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private _theme: Theme = Theme.NotSet;

  constructor(
    readonly rendererFactory: RendererFactory2,
    private readonly localSettings: LocalSettingsService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.theme = this.localSettings.get<Theme>('theme') ?? Theme.Light;
  }

  get theme(): Theme {
    return this._theme;
  }

  set theme(theme: Theme) {
    if (theme === this._theme) {
      return;
    }

    if (this._theme !== Theme.NotSet) {
      this.renderer.removeClass(this.document.body, this._theme);
    }
    this.renderer.addClass(this.document.body, theme);
    this._theme = theme;
    this.localSettings.set('theme', theme);
  }

  setDarkMode(enabled: boolean): void {
    this.theme = enabled ? Theme.Dark : Theme.Light;
  }
}
