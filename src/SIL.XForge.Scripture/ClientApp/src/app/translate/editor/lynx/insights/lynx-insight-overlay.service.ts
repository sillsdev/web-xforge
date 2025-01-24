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
import { asyncScheduler, observeOn, Subject, take, takeUntil } from 'rxjs';
import { LynxEditor } from './lynx-editor';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

export interface LynxInsightOverlayRef {
  ref: OverlayRef;
  closed$: Subject<void>;
  hoverMultiInsight$: Subject<LynxInsight | null>;
}

@Injectable({
  providedIn: 'root'
})
export class LynxInsightOverlayService {
  private openRef?: LynxInsightOverlayRef;
  private scrollableContainer?: CdkScrollable;

  constructor(
    private overlay: Overlay,
    private scrollDispatcher: ScrollDispatcher,
    private ngZone: NgZone
  ) {}

  open(origin: HTMLElement, insights: LynxInsight[], editor: LynxEditor): LynxInsightOverlayRef | undefined {
    if (insights.length === 0) {
      return undefined;
    }

    // Close any existing overlay
    this.close();

    this.registerScrollable(editor.getScrollingContainer());

    const overlayRef: LynxInsightOverlayRef = this.createOverlayRef(origin);
    const componentRef = overlayRef.ref.attach(new ComponentPortal(LynxInsightOverlayComponent));

    componentRef.instance.insights = insights;
    componentRef.instance.editor = editor;
    componentRef.instance.insightDismiss.pipe(take(1)).subscribe(() => this.close());
    componentRef.instance.insightHover
      .pipe(takeUntil(overlayRef.closed$))
      .subscribe(insight => this.openRef?.hoverMultiInsight$.next(insight));

    // Update overlay position when insight is focused (as in choosing from multi-insight)
    componentRef.instance.insightFocus
      .pipe(
        takeUntil(overlayRef.closed$),
        observeOn(asyncScheduler) // Delay to wait for DOM render (like setTimeout)
      )
      .subscribe(() => overlayRef.ref.updatePosition());

    this.openRef = overlayRef;

    return overlayRef;
  }

  close(): void {
    if (this.openRef != null) {
      this.openRef.ref.dispose();
      this.openRef.closed$.next();
      this.openRef.closed$.complete();
      this.openRef = undefined;
    }
  }

  /**
   * Create an overlay ref with an 'on close' callback.
   */
  private createOverlayRef(origin: HTMLElement): LynxInsightOverlayRef {
    return {
      ref: this.overlay.create(this.getConfig(origin)),
      closed$: new Subject<void>(),
      hoverMultiInsight$: new Subject<LynxInsight | null>()
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
  private registerScrollable(scrollContainer: Element): void {
    if (this.scrollableContainer?.getElementRef().nativeElement === scrollContainer) {
      return;
    }

    if (this.scrollableContainer != null) {
      this.scrollDispatcher.deregister(this.scrollableContainer);
    }

    this.scrollableContainer = new CdkScrollable(
      { nativeElement: scrollContainer as HTMLElement },
      this.scrollDispatcher,
      this.ngZone
    );

    this.scrollDispatcher.register(this.scrollableContainer);
  }
}
