import { Injectable } from '@angular/core';
import { Delta } from 'quill';
import { isString } from '../../../../../../type-utils';
import { EditorSegmentService } from '../base-services/editor-segment.service';
import { LynxInsightRange } from '../lynx-insight';

@Injectable({
  providedIn: 'root'
})
export class QuillEditorSegmentService extends EditorSegmentService {
  constructor() {
    super();
  }

  parseSegments(delta: Delta): Map<string, LynxInsightRange> {
    const segmentMap = new Map<string, LynxInsightRange>();
    let currentIndex = 0;

    if (delta.ops == null) {
      return segmentMap;
    }

    for (const op of delta.ops) {
      if (isString(op.insert)) {
        const length = op.insert.length;
        const segment = op.attributes?.segment;

        if (segment) {
          if (segmentMap.has(segment)) {
            const existingRange = segmentMap.get(segment)!;
            existingRange.length += length;
          } else {
            segmentMap.set(segment, { index: currentIndex, length });
          }
        }

        currentIndex += length;
      }
    }

    return segmentMap;
  }
}
