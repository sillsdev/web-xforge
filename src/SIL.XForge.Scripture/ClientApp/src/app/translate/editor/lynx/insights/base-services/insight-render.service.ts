import { Injectable } from '@angular/core';
import { LynxableEditor } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';

@Injectable()
export abstract class InsightRenderService {
  abstract render(insights: LynxInsight[], editor: LynxableEditor): void;
  abstract removeAllInsightFormatting(editor: LynxableEditor): void;
  abstract renderActionOverlay(insights: LynxInsight[], editor: LynxableEditor, actionOverlayActive: boolean): void;
  abstract renderCursorActiveState(insightIds: string[], editor: LynxableEditor): void;
}
