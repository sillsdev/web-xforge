import { Injectable } from '@angular/core';

export interface LynxInsightAction {
  id: string;
  label: string;
  description?: string;
  isPrimary?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LynxInsightActionService {
  constructor() {}

  // TODO: send locale to server along with insightId
  getActions(insightId: string, localeCode: string): LynxInsightAction[] {
    return [
      {
        id: '0',
        label: 'Update quotation mark',
        isPrimary: true
      },
      {
        id: '1',
        label: 'Update',
        description: 'Quotation mark to " style'
      },
      {
        id: '2',
        label: 'Update all 48',
        description: 'Quotation mark inconsistencies to " style'
      },
      {
        id: '3',
        label: 'Reject',
        description: 'Suggestion not relevant'
      }
    ];
  }

  performAction(action: LynxInsightAction): void {
    console.log('Performing action', action);
  }
}
