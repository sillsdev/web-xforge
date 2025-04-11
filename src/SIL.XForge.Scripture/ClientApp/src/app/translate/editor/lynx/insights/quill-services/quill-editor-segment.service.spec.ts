import { TestBed } from '@angular/core/testing';
import { DeltaOperation } from 'rich-text';
import { LynxInsightRange } from '../lynx-insight';
import { QuillEditorSegmentService } from './quill-editor-segment.service';

describe('QuillEditorSegmentService', () => {
  let service: QuillEditorSegmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuillEditorSegmentService);
  });

  describe('parseSegments', () => {
    it('should correctly parse segments from delta operations', () => {
      const ops: DeltaOperation[] = [
        { insert: 'Hello ', attributes: { segment: 'verse-1' } },
        { insert: 'world', attributes: { segment: 'verse-1' } },
        { insert: '!\n', attributes: { segment: 'verse-1' } },
        { insert: 'This is ', attributes: { segment: 'verse-2' } },
        { insert: 'a test', attributes: { segment: 'verse-2' } }
      ];

      const result = service.parseSegments(ops);

      expect(result.size).toBe(2);
      expect(result.get('verse-1')).toEqual({ index: 0, length: 13 });
      expect(result.get('verse-2')).toEqual({ index: 13, length: 14 });
    });

    it('should handle operations without segment attributes', () => {
      const ops: DeltaOperation[] = [
        { insert: 'Hello ' },
        { insert: 'world', attributes: { segment: 'verse-1' } },
        { insert: '!\n' }
      ];

      const result = service.parseSegments(ops);

      expect(result.size).toBe(1);
      expect(result.get('verse-1')).toEqual({ index: 6, length: 5 });
    });

    it('should handle embed operations', () => {
      const ops: DeltaOperation[] = [
        { insert: 'Hello', attributes: { segment: 'verse-1' } },
        { insert: { image: 'test.jpg' } },
        { insert: 'world', attributes: { segment: 'verse-1' } },
        { insert: { image: 'test.jpg' } },
        { insert: 'This is ', attributes: { segment: 'verse-2' } },
        { insert: { image: 'test.jpg' } },
        { insert: 'a test', attributes: { segment: 'verse-2' } }
      ];

      const result = service.parseSegments(ops);

      expect(result.size).toBe(2);
      expect(result.get('verse-1')).toEqual({ index: 0, length: 10 });
      expect(result.get('verse-2')).toEqual({ index: 12, length: 14 });
    });

    it('should handle empty ops array', () => {
      const ops: DeltaOperation[] = [];
      const result = service.parseSegments(ops);
      expect(result.size).toBe(0);
    });
  });

  describe('getSegmentRefs', () => {
    let segmentMap: Map<string, LynxInsightRange>;

    beforeEach(() => {
      segmentMap = new Map<string, LynxInsightRange>();
      segmentMap.set('verse-1', { index: 2, length: 8 });
      segmentMap.set('verse-2', { index: 10, length: 15 });
      segmentMap.set('verse-3', { index: 25, length: 20 });
    });

    it('should find segments that intersect with range', () => {
      let range: LynxInsightRange = { index: 5, length: 2 };
      let result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual(['verse-1']);

      range = { index: 15, length: 5 };
      result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual(['verse-2']);
    });

    it('should handle range spanning multiple segments', () => {
      const range: LynxInsightRange = { index: 8, length: 10 };
      const result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual(['verse-1', 'verse-2']);
    });

    it('should handle range spanning all segments', () => {
      // Range that spans all verses
      const range: LynxInsightRange = { index: 2, length: 43 };
      const result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual(['verse-1', 'verse-2', 'verse-3']);
    });

    it('should handle range before all segments', () => {
      const range: LynxInsightRange = { index: 0, length: 1 };
      const result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual([]);
    });

    it('should handle range after all segments', () => {
      // Range after all segments
      const range: LynxInsightRange = { index: 50, length: 10 };
      const result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual([]);
    });

    it('should handle edge cases of range touching segment boundaries', () => {
      // Range ending exactly at start of verse-1
      let range: LynxInsightRange = { index: 0, length: 2 };
      let result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual([]);

      // Range starting exactly at end of verse-3
      range = { index: 45, length: 5 };
      result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual([]);

      // Range ending exactly at end of verse-1
      range = { index: 5, length: 5 };
      result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual(['verse-1']);

      // Range starting exactly at start of verse-2
      range = { index: 10, length: 5 };
      result = service.getSegmentRefs(range, segmentMap);
      expect(result).toEqual(['verse-2']);
    });

    it('should handle empty segments map', () => {
      const range: LynxInsightRange = { index: 0, length: 10 };
      const result = service.getSegmentRefs(range, new Map());
      expect(result).toEqual([]);
    });

    it('should handle null range', () => {
      const result = service.getSegmentRefs(null as any, segmentMap);
      expect(result).toEqual([]);
    });
  });
});
