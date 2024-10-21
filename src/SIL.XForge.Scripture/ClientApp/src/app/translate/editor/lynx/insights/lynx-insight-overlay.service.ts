import {
  CdkScrollable,
  Overlay,
  OverlayConfig,
  OverlayRef,
  PositionStrategy,
  ScrollDispatcher
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injectable, NgZone } from '@angular/core';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightOverlayService {
  private openRefs = new Map<string, OverlayRef>();
  private scrollableContainer?: CdkScrollable;

  constructor(
    private overlay: Overlay,
    private scrollDispatcher: ScrollDispatcher,
    private ngZone: NgZone
  ) {}

  open(origin: HTMLElement, insight: LynxInsight, scrollContainerEl: HTMLElement): void {
    this.registerScrollable(scrollContainerEl);

    const overlayRef: OverlayRef = this.overlay.create(this.getConfig(origin));
    const componentRef = overlayRef.attach(new ComponentPortal(LynxInsightOverlayComponent));
    componentRef.instance.insight = insight;
    this.openRefs.set(insight.id, overlayRef);
  }

  close(insightId: string): void {
    if (this.openRefs.size > 0) {
      this.openRefs.get(insightId)?.dispose();
      this.openRefs.delete(insightId);
    }
  }

  closeAll(): void {
    this.openRefs.forEach(overlayRef => {
      overlayRef.dispose();
    });
    this.openRefs.clear();
  }

  private getConfig(origin: HTMLElement): OverlayConfig {
    return {
      positionStrategy: this.getPositionStrategy(origin),
      hasBackdrop: false,
      panelClass: 'lynx-insight-overlay-panel',
      scrollStrategy: this.overlay.scrollStrategies.reposition()
    };
  }

  private getPositionStrategy(origin: HTMLElement): PositionStrategy {
    if (this.scrollableContainer == null) {
      throw new Error('Scrollable container is not registered');
    }

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

  /**
   * Converts the scroll container element into a CdkScrollable and registers it with the ScrollDispatcher.
   * This allows the overlay to reposition itself when the scroll container is scrolled.
   * @param scrollContainer The scrolling element that contains the insight.
   */
  private registerScrollable(scrollContainer: HTMLElement): void {
    if (this.scrollableContainer?.getElementRef().nativeElement === scrollContainer) {
      return;
    }

    if (this.scrollableContainer != null) {
      this.scrollDispatcher.deregister(this.scrollableContainer);
    }

    this.scrollableContainer = new CdkScrollable(
      { nativeElement: scrollContainer },
      this.scrollDispatcher,
      this.ngZone
    );

    this.scrollDispatcher.register(this.scrollableContainer);
  }
}
