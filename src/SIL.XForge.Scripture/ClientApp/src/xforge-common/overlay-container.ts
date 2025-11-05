import { OverlayContainer } from '@angular/cdk/overlay';
import { Platform } from '@angular/cdk/platform';
import { DOCUMENT, Inject, Injectable, InjectionToken } from '@angular/core';

export const APP_ROOT_ELEMENT_SELECTOR = new InjectionToken<string>('APP_ROOT_ELEMENT_SELECTOR', {
  providedIn: 'root',
  factory: () => 'app-root'
});

@Injectable({ providedIn: 'root' })
export class InAppRootOverlayContainer extends OverlayContainer {
  constructor(
    @Inject(DOCUMENT) document: any,
    @Inject(APP_ROOT_ELEMENT_SELECTOR) private appRootSelector: string,
    platform: Platform
  ) {
    super(document, platform);
  }

  protected override _createContainer(): void {
    super._createContainer();
    this.appendToRootComponent();
  }

  /**
   * Places the material overlay contents as a child of the <app-root> element
   * This allows for elements like the menu drawer to open on top of any overlays i.e. bottom sheet
   */
  private appendToRootComponent(): void {
    const rootElement: Element | null = this._document.querySelector(this.appRootSelector);

    if (this._containerElement == null || rootElement == null) {
      return;
    }

    const parent: Element = rootElement || this._document.body;
    parent.appendChild(this._containerElement);
  }
}
