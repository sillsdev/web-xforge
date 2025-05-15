import { Injectable } from '@angular/core';
import { DeltaOperation } from 'rich-text';
import { LynxInsightRange } from '../lynx-insight';

@Injectable()
export abstract class EditorSegmentService {
  abstract parseSegments(ops: DeltaOperation[]): Map<string, LynxInsightRange>;
  abstract getSegmentRefs(range: LynxInsightRange, segments: Map<string, LynxInsightRange>): string[];
}
