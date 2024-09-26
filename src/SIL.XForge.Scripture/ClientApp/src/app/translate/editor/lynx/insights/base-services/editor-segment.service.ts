import { Injectable } from '@angular/core';
import { Delta } from 'rich-text';
import { LynxInsightRange } from '../lynx-insight';

@Injectable()
export abstract class EditorSegmentService {
  // TODO: generic (non-quill) delta?
  abstract parseSegments(delta: Delta): Map<string, LynxInsightRange>;
}
