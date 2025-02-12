import { Injectable } from '@angular/core';
import { Diagnostic, DiagnosticSeverity } from '@sillsdev/lynx';
import { Op } from 'quill';
import { from, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { LynxEditor } from './lynx-editor';
import { LynxInsight } from './lynx-insight';
import { LynxWorkspaceService } from './lynx-workspace.service';

export interface LynxInsightAction {
  id: string;
  insight: LynxInsight;
  label: string;
  description?: string;
  isPrimary?: boolean;
  ops: Op[];
}

@Injectable({
  providedIn: 'root'
})
export class LynxInsightActionService {
  constructor(private readonly lynxService: LynxWorkspaceService) {}

  getActions(insight: LynxInsight): Observable<LynxInsightAction[]> {
    return from(this.getActionsFromWorkspace(insight));
  }

  performAction(action: LynxInsightAction, editor: LynxEditor): void {
    console.log('Performing action', action);
    editor.updateContents(action.ops);
  }

  private async getActionsFromWorkspace(insight: LynxInsight): Promise<LynxInsightAction[]> {
    const doc = await this.lynxService.documentManager.get(insight.textDocId.toString());
    if (doc == null) {
      return [];
    }
    let severity = DiagnosticSeverity.Information;
    switch (insight.type) {
      case 'info':
        severity = DiagnosticSeverity.Information;
        break;
      case 'warning':
        severity = DiagnosticSeverity.Warning;
        break;
      case 'error':
        severity = DiagnosticSeverity.Error;
        break;
    }
    const diagnostic: Diagnostic = {
      code: insight.code,
      source: insight.source,
      range: {
        start: doc.positionAt(insight.range.index),
        end: doc.positionAt(insight.range.index + insight.range.length)
      },
      message: insight.description,
      severity,
      data: insight.data
    };
    const fixes = await this.lynxService.workspace.getDiagnosticFixes(insight.textDocId.toString(), diagnostic);
    return fixes.map(fix => ({
      id: uuidv4(),
      insight,
      label: fix.title,
      isPrimary: fix.isPreferred,
      ops: fix.edits
    }));
  }
}
