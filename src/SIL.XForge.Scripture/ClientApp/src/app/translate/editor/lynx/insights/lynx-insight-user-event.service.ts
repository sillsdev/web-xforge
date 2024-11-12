import { Injectable } from '@angular/core';
import { LynxInsightDisplayState } from './lynx-insight';
import { LynxInsightStateService } from './lynx-insight-state.service';
import { LynxInsightBlot } from './quill-services/blots/lynx-insight-blot';

type EventType = 'click' | 'mouseover' | 'mouseout';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightUserEventService {
  readonly insightSelector = `.${LynxInsightBlot.superClassName}`;
  readonly overlaySelector = '.lynx-insight-overlay-panel';

  private readonly dataIdProp = LynxInsightBlot.idAttributeName;

  constructor(private readonly insightState: LynxInsightStateService) {
    console.log('LynxInsightUserEventService initialized');
    this.addEventListeners();
  }

  private addEventListeners(): void {
    this.addEventListener('click');
  }

  private addEventListener(eventType: EventType): void {
    document.addEventListener(eventType, this.handleEvent.bind(this, eventType));
  }

  private handleEvent(eventType: EventType, event: MouseEvent): void {
    const target = event.target as HTMLElement;

    switch (eventType) {
      case 'click':
        this.handleClick(target, event);
        break;
    }
  }

  private handleClick(target: HTMLElement, event: MouseEvent): void {
    console.log('Click', target, event);
    const ids: string[] = this.getInsightIds(target);

    if (ids.length === 0) {
      // Non-insight clicks that are not in action overlay panel should clear display state
      if (target?.closest(this.overlaySelector) == null) {
        this.insightState.clearDisplayState();
      }
      return;
    }

    let displayStateChanges: Partial<LynxInsightDisplayState> = {
      activeInsightIds: ids,
      promptActive: true,
      actionOverlayActive: false
    };

    this.insightState.updateDisplayState(displayStateChanges);
  }

  /**
   * Get all insight ids from the element and its parents that match the lynx insight selector.
   */
  private getInsightIds(el: HTMLElement): string[] {
    const ids: string[] = [];

    if (el.matches(this.insightSelector)) {
      let currentEl: HTMLElement | null | undefined = el;

      while (currentEl != null) {
        const id = currentEl.dataset[this.dataIdProp];

        if (id != null) {
          ids.push(id);
        }

        currentEl = currentEl.parentElement?.closest(this.insightSelector);
      }
    }

    return ids;
  }
}
