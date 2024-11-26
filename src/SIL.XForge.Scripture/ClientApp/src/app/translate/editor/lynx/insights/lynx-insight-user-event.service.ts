import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { LynxInsightDisplayState } from './lynx-insight';
import { LynxInsightStateService } from './lynx-insight-state.service';
import { LynxInsightBlot } from './quill-services/blots/lynx-insight-blot';

type EventType = 'click' | 'mouseover';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightUserEventService {
  readonly insightSelector = `.${LynxInsightBlot.superClassName}`;
  readonly overlaySelector = '.lynx-insight-overlay-panel';

  private readonly dataIdProp = LynxInsightBlot.idDatasetPropName;

  constructor(
    private readonly insightState: LynxInsightStateService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    console.log('LynxInsightUserEventService initialized');
    this.addEventListeners();
  }

  private addEventListeners(): void {
    this.addEventListener('click');
    this.addEventListener('mouseover');
  }

  private addEventListener(eventType: EventType): void {
    this.document.addEventListener(eventType, this.handleEvent.bind(this, eventType));
  }

  private handleEvent(eventType: EventType, event: MouseEvent): void {
    const target = event.target as HTMLElement;

    switch (eventType) {
      case 'click':
        this.handleClick(target);
        break;
      case 'mouseover':
        this.handleMouseOver(target);
        break;
    }
  }

  private handleClick(target: HTMLElement): void {
    console.log('Click', target);
    const ids: string[] = this.getInsightIds(target);

    if (ids.length === 0) {
      // Non- 'insights panel' clicks that are not in action overlay should clear display state
      // unless action 'fixes' menu is open (indicated by '.cdk-overlay-backdrop').
      if (target?.closest(`${this.overlaySelector}, .cdk-overlay-backdrop`) == null) {
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

  private handleMouseOver(target: HTMLElement): void {
    // Clear any 'hover-insight' classes if the target is not an insight element
    if (!target.matches('.' + LynxInsightBlot.superClassName)) {
      this.insightState.updateDisplayState({ cursorActiveInsightIds: [] });
      return;
    }

    console.log('MouseOver', target);
    const ids: string[] = this.getInsightIds(target);

    // Set 'hover-insight' class on the affected insight elements (clear others)
    this.insightState.updateDisplayState({ cursorActiveInsightIds: ids });
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
