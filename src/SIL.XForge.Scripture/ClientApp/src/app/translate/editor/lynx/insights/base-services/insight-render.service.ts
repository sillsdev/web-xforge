import { Injectable } from '@angular/core';
import { LynxInsight } from '../lynx-insight';

@Injectable()
export abstract class InsightRenderService {
  // TODO: use generics?
  abstract render(insights: LynxInsight[], editor: any | undefined): void;
}
