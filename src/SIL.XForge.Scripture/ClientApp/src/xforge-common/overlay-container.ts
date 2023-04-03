import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Platform } from '@angular/cdk/platform';

@Injectable({ providedIn: 'root' })
export class InAppRootOverlayContainer extends OverlayContainer {
  constructor(@Inject(DOCUMENT) document: any, platform: Platform) {
    super(document, platform);
  }

  protected _createContainer(): void {
    super._createContainer();
    this.appendToRootComponent();
  }

  /**
   * Places the material overlay contents as a child of the <app-root> element
   * This allows for elements like the menu drawer to open on top of any overlays i.e. bottom sheet
   */
  private appendToRootComponent(): void {
    const rootElement: Element | null = this._document.querySelector('app-root');

    if (this._containerElement == null || rootElement == null) {
      return;
    }

    const parent: Element = rootElement || this._document.body;
    parent.appendChild(this._containerElement);
  }
}
