import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightOverlayService {
  private openRefs = new Map<string, OverlayRef>();

  constructor(private overlay: Overlay) {}

  open(origin: HTMLElement, insight: LynxInsight): void {
    const overlayRef: OverlayRef | null = this.overlay.create(this.getConfig(origin));
    const componentRef = overlayRef.attach(new ComponentPortal(LynxInsightOverlayComponent));
    componentRef.instance.insight = insight;
    this.openRefs.set(insight.id, overlayRef);
  }

  close(insightId: string): void {
    this.openRefs.get(insightId)?.dispose();
    this.openRefs.delete(insightId);
  }

  private getConfig(origin: HTMLElement): OverlayConfig {
    return {
      positionStrategy: this.getPositionStrategy(origin),
      hasBackdrop: false,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'lynx-insight-overlay-panel'
    };
  }

  private getPositionStrategy(origin: HTMLElement): any {
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' }
      ]);

    return positionStrategy;
  }
}
