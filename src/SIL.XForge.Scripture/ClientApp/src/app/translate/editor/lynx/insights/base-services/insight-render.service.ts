import { Injectable } from '@angular/core';
import { LynxableEditor, LynxRangeConverter } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';

@Injectable()
export abstract class InsightRenderService {
  abstract render(insights: LynxInsight[], editor: LynxableEditor, rangeConverter: LynxRangeConverter): void;
  abstract removeAllInsightFormatting(editor: LynxableEditor): void;
  abstract renderActionOverlay(insights: LynxInsight[], editor: LynxableEditor, actionOverlayActive: boolean): void;
  abstract renderCursorActiveState(insightIds: string[], editor: LynxableEditor): void;
}
