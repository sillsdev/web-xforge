import { Injectable } from '@angular/core';
import { Observable, of, take } from 'rxjs';
import { LynxEditor } from './lynx-editor';
import { LynxInsight, LynxInsightRange } from './lynx-insight';

export interface LynxInsightAction {
  id: string;
  insight: LynxInsight;
  label: string;
  description?: string;
  isPrimary?: boolean;
}

// TODO: this type will be in Lynx lib
export interface TextEdit {
  range: LynxInsightRange;
  newText: string;
}

@Injectable({
  providedIn: 'root'
})
export class LynxInsightActionService {
  constructor() {}

  // TODO: send locale to server along with insightId
  getActions(insight: LynxInsight, localeCode: string): Observable<LynxInsightAction[]> {
    return of([
      // TODO: confirm that primary action should be an additional action (to have more flexible text)
      {
        id: '0',
        insight,
        label: 'Update quotation mark',
        isPrimary: true
      },
      {
        id: '1',
        insight,
        label: 'Update',
        description: 'Quotation mark to " style'
      },
      {
        id: '2',
        insight,
        label: 'Update all 48',
        description: 'Quotation mark inconsistencies to " style'
      },
      {
        id: '3',
        insight,
        label: 'Reject',
        description: 'Suggestion not relevant'
      }
    ]);
  }

  performAction(action: LynxInsightAction, editor: LynxEditor): void {
    console.log('Performing action', action);

    this.getFix(action.insight)
      .pipe(take(1))
      .subscribe(fix => {
        console.log('Fix', fix);

        editor.deleteText(fix.range.index, fix.range.length);
        editor.insertText(fix.range.index, fix.newText);
      });
  }

  getFix(insight: LynxInsight): Observable<TextEdit> {
    return of({
      range: insight.range,
      newText: 'New text' + insight.id
    });
  }
}
