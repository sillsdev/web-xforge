import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { DiagnosticOverlayComponent } from '../app/shared/diagnostic-overlay/diagnostic-overlay.component';
import { I18nService } from './i18n.service';
import { LocalSettingsService } from './local-settings.service';

const diagnosticOverlayOpenKey = 'DIAGNOSTIC_OVERLAY_OPEN';

@Injectable({ providedIn: 'root' })
export class DiagnosticOverlayService {
  constructor(
    private readonly i18n: I18nService,
    private readonly overlay: Overlay,
    private readonly localSettings: LocalSettingsService
  ) {
    if (this.localSettings.get<boolean>(diagnosticOverlayOpenKey) === true) {
      setTimeout(() => this.open(), 0);
    }
  }

  overlayRef: OverlayRef | undefined;

  open(): void {
    if (this.overlayRef != null) return;

    this.overlayRef = this.overlay.create({
      positionStrategy: this.overlay.position().global().end('0').top('56px'),
      direction: this.i18n.direction,
      panelClass: 'diagnostic-overlay-panel'
    });
    const portal = new ComponentPortal(DiagnosticOverlayComponent);
    this.overlayRef.attach(portal);
    this.localSettings.set(diagnosticOverlayOpenKey, true);
  }

  close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
    this.localSettings.remove(diagnosticOverlayOpenKey);
  }
}
