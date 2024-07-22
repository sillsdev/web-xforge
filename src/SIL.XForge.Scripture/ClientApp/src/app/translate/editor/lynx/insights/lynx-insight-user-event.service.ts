import { Injectable } from '@angular/core';
import { LynxInsight, LynxInsightDisplayState } from './lynx-insight';
import { LynxInsightStateService } from './lynx-insight-state.service';

type EventType = 'click' | 'mouseover' | 'mouseout';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightUserEventService {
  readonly insightSelector = '[lynx-insight]';
  readonly overlaySelector = '.lynx-insight-overlay-panel';

  private readonly dataIdsProp = 'insightIds';

  constructor(private readonly editorInsightState: LynxInsightStateService) {
    console.log('LynxInsightUserEventService initialized');
    this.addEventListeners();
  }

  private addEventListeners(): void {
    this.addEventListener('click');
    // this.addEventListener('mouseover');
    // this.addEventListener('mouseout');
  }

  private addEventListener(eventType: EventType): void {
    document.addEventListener(eventType, this.handleEvent.bind(this, eventType));
    // document.addEventListener(eventType, (_, event) => this.handleEvent(eventType, event));
  }

  private handleEvent(eventType: EventType, event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // if (!target?.matches?.(this.insightSelector)) {
    //   return;
    // }

    switch (eventType) {
      case 'click':
        this.handleClick(target, event);
        break;
      // case 'mouseover':
      //   this.handleMouseOver(target, event);
      //   break;
      // case 'mouseout':
      //   this.handleMouseOut(target, event);
      //   break;
    }
  }

  private handleClick(target: HTMLElement, event: MouseEvent): void {
    console.log('Click', target, event);
    const id: string | undefined = this.getInsightIds(target)[0]; // TODO: handle multiple
    let insight: LynxInsight | undefined;

    if (id != null && target?.matches?.(this.insightSelector)) {
      insight = this.editorInsightState.getInsight(id);
    } else if (target?.closest(this.overlaySelector) != null) {
      // Ignore clicks in action overlay panel
      return;
    }

    if (insight == null || id == null) {
      this.editorInsightState.clearDisplayState();
      return;
    }

    let displayStateChanges: Partial<LynxInsightDisplayState> = { promptActive: true, actionMenuActive: false };

    // if (!this.isPointInElement(target, event.clientX, event.clientY)) {
    //   console.log('%% Open insight id', id);
    //   displayStateChanges.actionMenuActive = true;
    //   // displayStateChanges.promptActive = false;
    // } else {
    //   console.log('%% Prompt insight id', id);
    //   displayStateChanges.promptActive = true;
    // }

    this.editorInsightState.updateDisplayState(id, displayStateChanges);
  }

  private handleMouseOver(target: HTMLElement, event: MouseEvent): void {
    if (target.dataset[this.dataIdsProp] == null) {
      return;
    }

    const id: string = this.getInsightIds(target)[0] ?? []; // TODO: handle multiple
    const insight: LynxInsight | undefined = this.editorInsightState.getInsight(id);

    if (insight == null) {
      return;
    }

    console.log('Mouse over', id, target, insight);

    this.editorInsightState.updateDisplayState(id, { promptActive: true });
  }

  private handleMouseOut(target: HTMLElement, event: MouseEvent): void {
    if (target.dataset[this.dataIdsProp] == null) {
      return;
    }

    const id: string = this.getInsightIds(target)[0] ?? []; // TODO: handle multiple
    const insight: LynxInsight | undefined = this.editorInsightState.getInsight(id);

    if (insight == null) {
      return;
    }

    console.log('Mouse out', id, target, insight);

    // Only remove prompt active if action menu is not active
    if (!insight?.displayState?.actionMenuActive) {
      this.editorInsightState.updateDisplayState(id, { promptActive: false });
    }
  }

  private isPointInElement(el: HTMLElement, x: number, y: number): boolean {
    const rect = el.getBoundingClientRect();

    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  private getInsightIds(el: HTMLElement): string[] {
    return el.dataset[this.dataIdsProp]?.split(' ') ?? [];
  }
}
