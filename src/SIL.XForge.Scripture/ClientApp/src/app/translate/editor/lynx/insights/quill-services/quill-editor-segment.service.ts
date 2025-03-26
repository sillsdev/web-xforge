import { Injectable } from '@angular/core';
import { DeltaOperation } from 'rich-text';
import { isString } from '../../../../../../type-utils';
import { EditorSegmentService } from '../base-services/editor-segment.service';
import { LynxInsightRange } from '../lynx-insight';

@Injectable({
  providedIn: 'root'
})
export class QuillEditorSegmentService extends EditorSegmentService {
  /**
   * Parses ops to get a map of segment name -> segment range.
   */
  parseSegments(ops: DeltaOperation[]): Map<string, LynxInsightRange> {
    const segmentMap = new Map<string, LynxInsightRange>();
    let currentIndex = 0;

    for (const op of ops) {
      if (op.insert != null) {
        if (isString(op.insert)) {
          const length: number = op.insert.length;
          const segment: string | undefined = op.attributes?.segment as string | undefined;

          if (isString(segment)) {
            if (segmentMap.has(segment)) {
              const existingRange = segmentMap.get(segment)!;
              existingRange.length += length;
            } else {
              segmentMap.set(segment, { index: currentIndex, length });
            }
          }

          currentIndex += length;
        } else {
          currentIndex++; // Account for embeds
        }
      }
    }

    return segmentMap;
  }

  /**
   * Get all segment references that intersect the given range.
   * @param range The range to check.
   * @param segments A map of segment name -> segment range.
   * @returns An array of the intersecting segment refs.
   */
  getSegmentRefs(range: LynxInsightRange, segments: Map<string, LynxInsightRange>): string[] {
    const segmentRefs: string[] = [];

    if (range != null) {
      const rangeEnd: number = range.index + range.length;

      for (const [ref, segmentRange] of segments) {
        const segEnd: number = segmentRange.index + segmentRange.length;

        if (range.index < segEnd) {
          if (rangeEnd > segmentRange.index) {
            segmentRefs.push(ref);
          }

          if (rangeEnd <= segEnd) {
            break;
          }
        }
      }
    }

    return segmentRefs;
  }
}
