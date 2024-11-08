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
import { Subject, asyncScheduler, observeOn, take, takeUntil } from 'rxjs';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

export interface LynxInsightOverlayRef {
  ref: OverlayRef;
  closed$: Subject<void>;
}

@Injectable({
  providedIn: 'root'
})
export class LynxInsightOverlayService {
  private openRefs = new Map<string, LynxInsightOverlayRef>();
  private scrollableContainer?: CdkScrollable;

  constructor(
    private overlay: Overlay,
    private scrollDispatcher: ScrollDispatcher,
    private ngZone: NgZone
  ) {}

  open(
    origin: HTMLElement,
    insights: LynxInsight[],
    scrollContainerEl: HTMLElement
  ): LynxInsightOverlayRef | undefined {
    if (insights.length === 0) {
      return undefined;
    }

    this.registerScrollable(scrollContainerEl);

    const overlayRef: LynxInsightOverlayRef = this.createOverlayRef(origin);
    const componentRef = overlayRef.ref.attach(new ComponentPortal(LynxInsightOverlayComponent));
    const key = insights[0].id;

    componentRef.instance.insights = insights;
    componentRef.instance.insightDismiss.pipe(take(1)).subscribe(() => this.close(key));

    // Update overlay position when insight is focused (as in choosing from multi-insight)
    componentRef.instance.insightFocus
      .pipe(
        takeUntil(overlayRef.closed$),
        observeOn(asyncScheduler) // Delay to wait for DOM render (like setTimeout)
      )
      .subscribe(() => overlayRef.ref.updatePosition());

    this.openRefs.set(key, overlayRef);

    return overlayRef;
  }

  close(insightId: string): void {
    if (this.openRefs.size > 0) {
      const overlayRef: LynxInsightOverlayRef | undefined = this.openRefs.get(insightId);

      if (overlayRef != null) {
        overlayRef.ref.dispose();
        overlayRef.closed$.next();
        overlayRef.closed$.complete();
        this.openRefs.delete(insightId);
      }
    }
  }

  closeAll(): void {
    for (const insightId of this.openRefs.keys()) {
      this.close(insightId);
    }
  }

  /**
   * Create an overlay ref with an 'on close' callback.
   */
  private createOverlayRef(origin: HTMLElement): LynxInsightOverlayRef {
    return {
      ref: this.overlay.create(this.getConfig(origin)),
      closed$: new Subject<void>()
    };
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
      ])
      .withGrowAfterOpen(true);

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
