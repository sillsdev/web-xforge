import { Injectable } from '@angular/core';
import { LynxInsight } from '../lynx-insight';

@Injectable()
export abstract class InsightRenderService {
  // TODO: use generics?
  abstract render(insights: LynxInsight[], editor: any | undefined): void;
  abstract renderActionOverlay(insights: LynxInsight[], editor: any | undefined, actionOverlayActive: boolean): void;
  abstract removeAllInsightFormatting(editor: any | undefined): void;
}
