import { Overlay, OverlayConfig, OverlayRef, PositionStrategy, ScrollStrategy } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { asyncScheduler, observeOn, Subject, take, takeUntil } from 'rxjs';
import { LynxEditor, LynxTextModelConverter } from './lynx-editor';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

/**
 * Custom scroll strategy that listens to a specific scroll container and repositions the overlay.
 * This replaces the need for CdkScrollable registration with ScrollDispatcher.
 */
class OverlayScrollStrategy implements ScrollStrategy {
  private _scrollContainer: Element;
  private _overlayRef?: OverlayRef;
  private _scrollListener?: () => void;

  constructor(scrollContainer: Element) {
    this._scrollContainer = scrollContainer;
  }

  attach(overlayRef: OverlayRef): void {
    this._overlayRef = overlayRef;
    this._scrollListener = () => {
      // Check if overlay is still attached before updating position
      if (this._overlayRef != null && this._overlayRef.hasAttached()) {
        this._overlayRef.updatePosition();
      }
    };
    this._scrollContainer.addEventListener('scroll', this._scrollListener);
  }

  enable(): void {
    // Already enabled when attached
  }

  disable(): void {
    if (this._scrollListener != null) {
      this._scrollContainer.removeEventListener('scroll', this._scrollListener);
      this._scrollListener = undefined;
    }
  }

  detach(): void {
    this.disable();
    this._overlayRef = undefined;
  }
}

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
  private overlayScrollStrategy?: OverlayScrollStrategy;

  constructor(private overlay: Overlay) {}

  get isOpen(): boolean {
    return this.openRef != null;
  }

  open(
    origin: HTMLElement,
    insights: LynxInsight[],
    editor: LynxEditor,
    textModelConverter: LynxTextModelConverter
  ): LynxInsightOverlayRef | undefined {
    if (insights.length === 0) {
      return undefined;
    }

    // Close any existing overlay
    this.close();

    const scrollContainer = editor.getScrollingContainer() as HTMLElement;
    const overlayRef: LynxInsightOverlayRef = this.createOverlayRef(origin, scrollContainer);
    const componentRef = overlayRef.ref.attach(new ComponentPortal(LynxInsightOverlayComponent));

    componentRef.instance.insights = insights;
    componentRef.instance.editor = editor;
    componentRef.instance.textModelConverter = textModelConverter;
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

    // Overlay does not have a backdrop to allow for clicking through items in the problems panel
    // (clicking an insight in the problems panel should change the opened insight overlay).
    // So, close the overlay when the user clicks outside of it if overlay action menu is not open.
    overlayRef.ref
      .outsidePointerEvents()
      .pipe(takeUntil(overlayRef.closed$))
      .subscribe(e => {
        const target = e.target as HTMLElement;

        // Ignore clicks on the action prompt (it will toggle overlay, itself)
        const isTargetActionPrompt: boolean = target.closest('app-lynx-insight-action-prompt') != null;
        if (isTargetActionPrompt) {
          return;
        }

        const isActionMenuOpen: boolean =
          target.matches('.cdk-overlay-backdrop') || target.closest('.lynx-insight-action-menu') != null;

        // If the click is outside the overlay and not on the action menu, close the overlay
        if (!isActionMenuOpen) {
          this.close();
        }
      });

    this.openRef = overlayRef;

    // When initially displayed, scroll editor if necessary to ensure overlay is displayed within editor bounds
    setTimeout(() => this.ensureOverlayWithinEditorBounds(scrollContainer));

    return overlayRef;
  }

  close(): void {
    if (this.openRef != null) {
      this.openRef.ref.dispose();
      this.openRef.closed$.next();
      this.openRef?.closed$.complete(); // Need null safe operator in case 'closed$.next()' triggers a 'close()' call
      this.openRef = undefined;

      if (this.overlayScrollStrategy != null) {
        this.overlayScrollStrategy.detach();
        this.overlayScrollStrategy = undefined;
      }
    }
  }

  /**
   * Create an overlay ref with configuration and lifecycle subjects.
   */
  private createOverlayRef(origin: HTMLElement, scrollContainer: HTMLElement): LynxInsightOverlayRef {
    return {
      ref: this.overlay.create(this.getConfig(origin, scrollContainer)),
      closed$: new Subject<void>(),
      hoverMultiInsight$: new Subject<LynxInsight | null>()
    };
  }

  private getConfig(origin: HTMLElement, scrollContainer: HTMLElement): OverlayConfig {
    this.overlayScrollStrategy = new OverlayScrollStrategy(scrollContainer);

    return {
      positionStrategy: this.getPositionStrategy(origin),
      panelClass: 'lynx-insight-overlay-panel',
      scrollStrategy: this.overlayScrollStrategy
    };
  }

  private getPositionStrategy(origin: HTMLElement): PositionStrategy {
    return this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' }
      ])
      .withGrowAfterOpen(true);
  }

  /**
   * Ensures the overlay is fully within the editor bounds by scrolling if necessary.
   * Called after overlay is attached and positioned to prevent content from being cut off.
   */
  private ensureOverlayWithinEditorBounds(scrollContainer: Element): void {
    const overlayRef: OverlayRef | undefined = this.openRef?.ref;

    if (overlayRef?.overlayElement == null) {
      return;
    }

    const SCROLL_CUSHION = 10; // Extra cushion from container edge
    const overlayElement = overlayRef.overlayElement;

    // Get element positions
    const containerRect = scrollContainer.getBoundingClientRect();
    const overlayRect = overlayElement.getBoundingClientRect();

    // Check if overlay is not fully above bottom of editor bounds (top case is unnecessary)
    if (overlayRect.bottom > containerRect.bottom) {
      const additionalScroll = overlayRect.bottom - containerRect.bottom + SCROLL_CUSHION;
      scrollContainer.scrollTop += additionalScroll;
    }
  }
}
