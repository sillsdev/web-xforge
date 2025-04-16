import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { TextDocId } from '../../../../core/models/text-doc';
import { LynxInsight } from './lynx-insight';
import { getLeadingInsight, getMostNestedInsight } from './lynx-insight-util';

describe('LynxInsightUtil', () => {
  const textDocId = new TextDocId('project01', 40, 1);

  function createInsight(props: { id: string; index: number; length: number; type?: LynxInsightType }): LynxInsight {
    return {
      id: props.id,
      type: props.type || 'warning',
      textDocId,
      range: { index: props.index, length: props.length },
      code: props.id,
      source: 'test',
      description: `Insight ${props.id}`
    };
  }

  describe('getLeadingInsight', () => {
    it('should return undefined for empty array', () => {
      expect(getLeadingInsight([])).toBeUndefined();
    });

    it('should return the only insight for single-element array', () => {
      const onlyInsight = createInsight({ id: 'only', index: 10, length: 5 });
      expect(getLeadingInsight([onlyInsight])).toBe(onlyInsight);
    });

    it('should find the insight with earliest range start', () => {
      const insights = [
        createInsight({ id: 'middle', index: 10, length: 5 }),
        createInsight({ id: 'earliest', index: 5, length: 10 }),
        createInsight({ id: 'latest', index: 15, length: 3 })
      ];

      const result = getLeadingInsight(insights);

      expect(result?.id).toBe('earliest');
      expect(result?.range.index).toBe(5);
    });

    it('should return first matching insight when multiple have same index', () => {
      const insights = [
        createInsight({ id: 'first-at-10', index: 10, length: 5 }),
        createInsight({ id: 'second-at-10', index: 10, length: 3 }),
        createInsight({ id: 'at-15', index: 15, length: 2 })
      ];

      const result = getLeadingInsight(insights);
      expect(result?.id).toBe('first-at-10');
    });

    it('should not modify the original array', () => {
      const insights = [
        createInsight({ id: 'first', index: 10, length: 5 }),
        createInsight({ id: 'second', index: 5, length: 10 })
      ];

      const originalOrder = [...insights];
      getLeadingInsight(insights);

      expect(insights).toEqual(originalOrder);
    });
  });

  describe('getMostNestedInsight', () => {
    it('should return undefined for empty array', () => {
      expect(getMostNestedInsight([])).toBeUndefined();
    });

    it('should return the only insight for single-element array', () => {
      const onlyInsight = createInsight({ id: 'only', index: 10, length: 5 });
      expect(getMostNestedInsight([onlyInsight])).toBe(onlyInsight);
    });

    it('should find the insight with earliest range end', () => {
      const insights = [
        createInsight({ id: 'middle-end', index: 10, length: 10 }), // ends at 20
        createInsight({ id: 'earliest-end', index: 5, length: 7 }), // ends at 12 - earliest
        createInsight({ id: 'latest-end', index: 8, length: 15 }) // ends at 23
      ];

      const result = getMostNestedInsight(insights);

      expect(result?.id).toBe('earliest-end');
      expect(result!.range.index + result!.range.length).toBe(12);
    });

    it('should prefer inner start position when end positions are equal', () => {
      const insights = [
        createInsight({ id: 'outer', index: 5, length: 10 }), // starts at 5, ends at 15
        createInsight({ id: 'inner', index: 10, length: 5 }) // starts at 10, ends at 15 - more nested
      ];

      const result = getMostNestedInsight(insights);
      expect(result?.id).toBe('inner');
    });

    it('should handle multiple insights with same end position', () => {
      // All insights end at position 20
      const insights = [
        createInsight({ id: 'starts-at-15', index: 15, length: 5 }),
        createInsight({ id: 'starts-at-10', index: 10, length: 10 }),
        createInsight({ id: 'starts-at-5', index: 5, length: 15 }),
        createInsight({ id: 'starts-at-18', index: 18, length: 2 }) // Most inner
      ];

      const result = getMostNestedInsight(insights);
      expect(result?.id).toBe('starts-at-18');
    });

    it('should not modify the original array', () => {
      const insights = [
        createInsight({ id: 'first', index: 5, length: 15 }),
        createInsight({ id: 'second', index: 10, length: 5 })
      ];

      const originalOrder = [...insights];
      getMostNestedInsight(insights);

      expect(insights).toEqual(originalOrder);
    });
  });
});
