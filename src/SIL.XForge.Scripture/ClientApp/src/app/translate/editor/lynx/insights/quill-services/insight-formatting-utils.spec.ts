import Delta from 'quill-delta';
import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import {
  analyzeOverlaps,
  applyNonOverlappingOperations,
  applyOverlappingGroup,
  FormatOperation,
  OverlapAnalysis,
  processFormatOperations,
  WorkerLynxInsight
} from './insight-formatting-utils';

describe('Insight formatting utils', () => {
  function createTestInsight(
    id: string,
    type: LynxInsightType = 'warning',
    index: number,
    length: number
  ): WorkerLynxInsight {
    return {
      id,
      type,
      range: { index, length }
    };
  }

  function createFormatOperation(
    typeKey: string,
    index: number,
    length: number,
    insights: WorkerLynxInsight[]
  ): FormatOperation {
    return {
      typeKey,
      index,
      length,
      formatValue: insights
    };
  }

  describe('analyzeOverlaps', () => {
    it('should return empty arrays for empty input', () => {
      const result: OverlapAnalysis = analyzeOverlaps([]);

      expect(result.nonOverlapping).toEqual([]);
      expect(result.overlappingGroups).toEqual([]);
    });

    it('should identify non-overlapping operations', () => {
      const insight1 = createTestInsight('1', 'warning', 0, 5);
      const insight2 = createTestInsight('2', 'error', 10, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 5, [insight1]),
        createFormatOperation('lynx-insight-error', 10, 5, [insight2])
      ];

      const result: OverlapAnalysis = analyzeOverlaps(ops);

      expect(result.nonOverlapping).toEqual(ops);
      expect(result.overlappingGroups).toEqual([]);
    });

    it('should identify overlapping operations', () => {
      const insight1 = createTestInsight('1', 'warning', 0, 10);
      const insight2 = createTestInsight('2', 'warning', 5, 10);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 10, [insight1]),
        createFormatOperation('lynx-insight-warning', 5, 10, [insight2])
      ];

      const result: OverlapAnalysis = analyzeOverlaps(ops);

      expect(result.nonOverlapping).toEqual([]);
      expect(result.overlappingGroups).toEqual([ops]);
    });

    it('should handle mixed overlapping and non-overlapping operations', () => {
      const insight1 = createTestInsight('1', 'warning', 0, 5);
      const insight2 = createTestInsight('2', 'warning', 3, 5);
      const insight3 = createTestInsight('3', 'error', 20, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 5, [insight1]),
        createFormatOperation('lynx-insight-warning', 3, 5, [insight2]),
        createFormatOperation('lynx-insight-error', 20, 5, [insight3])
      ];

      const result: OverlapAnalysis = analyzeOverlaps(ops);

      expect(result.nonOverlapping).toEqual([ops[2]]);
      expect(result.overlappingGroups).toEqual([[ops[0], ops[1]]]);
    });

    it('should handle multiple overlapping groups', () => {
      const insight1 = createTestInsight('1', 'warning', 0, 5);
      const insight2 = createTestInsight('2', 'warning', 3, 5);
      const insight3 = createTestInsight('3', 'error', 20, 5);
      const insight4 = createTestInsight('4', 'error', 22, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 5, [insight1]),
        createFormatOperation('lynx-insight-warning', 3, 5, [insight2]),
        createFormatOperation('lynx-insight-error', 20, 5, [insight3]),
        createFormatOperation('lynx-insight-error', 22, 5, [insight4])
      ];

      const result: OverlapAnalysis = analyzeOverlaps(ops);

      expect(result.nonOverlapping).toEqual([]);
      expect(result.overlappingGroups).toEqual([
        [ops[0], ops[1]],
        [ops[2], ops[3]]
      ]);
    });

    it('should handle adjacent operations as non-overlapping', () => {
      const insight1 = createTestInsight('1', 'info', 0, 5);
      const insight2 = createTestInsight('2', 'warning', 5, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-info', 0, 5, [insight1]),
        createFormatOperation('lynx-insight-warning', 5, 5, [insight2])
      ];

      const result: OverlapAnalysis = analyzeOverlaps(ops);

      expect(result.nonOverlapping).toEqual(ops);
      expect(result.overlappingGroups).toEqual([]);
    });
  });

  describe('applyNonOverlappingOperations', () => {
    it('should return base delta for empty operations', () => {
      const baseDelta = new Delta().retain(10, { bold: null });
      const result = applyNonOverlappingOperations(baseDelta, []);

      expect(result).toBe(baseDelta);
    });

    it('should apply single operation correctly', () => {
      const baseDelta = new Delta().retain(10, { bold: null });
      const insight = createTestInsight('1', 'warning', 0, 5);
      const ops: FormatOperation[] = [createFormatOperation('lynx-insight-warning', 0, 5, [insight])];

      const result = applyNonOverlappingOperations(baseDelta, ops);

      const expected = new Delta([
        { retain: 5, attributes: { bold: null, 'lynx-insight-warning': [insight] } },
        { retain: 5, attributes: { bold: null } }
      ]);
      expect(result).toEqual(expected);
    });

    it('should apply multiple non-overlapping operations', () => {
      const baseDelta = new Delta().retain(30, { bold: null });
      const insight1 = createTestInsight('1', 'info', 0, 5);
      const insight2 = createTestInsight('2', 'warning', 10, 5);
      const insight3 = createTestInsight('3', 'error', 20, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-info', 0, 5, [insight1]),
        createFormatOperation('lynx-insight-warning', 10, 5, [insight2]),
        createFormatOperation('lynx-insight-error', 20, 5, [insight3])
      ];

      const result = applyNonOverlappingOperations(baseDelta, ops);

      const expected = new Delta([
        { retain: 5, attributes: { bold: null, 'lynx-insight-info': [insight1] } },
        { retain: 5, attributes: { bold: null } },
        { retain: 5, attributes: { bold: null, 'lynx-insight-warning': [insight2] } },
        { retain: 5, attributes: { bold: null } },
        { retain: 5, attributes: { bold: null, 'lynx-insight-error': [insight3] } },
        { retain: 5, attributes: { bold: null } }
      ]);

      expect(result).toEqual(expected);
    });

    it('should handle operations with gaps correctly', () => {
      const baseDelta = new Delta().retain(25, { bold: null });
      const insight1 = createTestInsight('1', 'warning', 2, 3);
      const insight2 = createTestInsight('2', 'error', 10, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 2, 3, [insight1]),
        createFormatOperation('lynx-insight-error', 10, 5, [insight2])
      ];

      const result = applyNonOverlappingOperations(baseDelta, ops);

      const expected = new Delta([
        { retain: 2, attributes: { bold: null } },
        { retain: 3, attributes: { bold: null, 'lynx-insight-warning': [insight1] } },
        { retain: 5, attributes: { bold: null } },
        { retain: 5, attributes: { bold: null, 'lynx-insight-error': [insight2] } },
        { retain: 10, attributes: { bold: null } }
      ]);
      expect(result).toEqual(expected);
    });
  });

  describe('applyOverlappingGroup', () => {
    it('should return base delta for empty group', () => {
      const baseDelta = new Delta().retain(10, { bold: null });
      const result = applyOverlappingGroup(baseDelta, []);

      expect(result).toBe(baseDelta);
    });

    it('should apply multiple overlapping operations using compose', () => {
      const baseDelta = new Delta().retain(10, { bold: null });
      const insight1 = createTestInsight('1', 'warning', 0, 8);
      const insight2 = createTestInsight('2', 'error', 2, 6);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 8, [insight1]),
        createFormatOperation('lynx-insight-error', 2, 6, [insight2])
      ];

      const result = applyOverlappingGroup(baseDelta, ops);

      const expectedDelta = new Delta([
        { retain: 2, attributes: { bold: null, 'lynx-insight-warning': [insight1] } },
        {
          retain: 6,
          attributes: {
            bold: null,
            'lynx-insight-warning': [insight1],
            'lynx-insight-error': [insight2]
          }
        },
        { retain: 2, attributes: { bold: null } }
      ]);

      expect(result).toEqual(expectedDelta);
    });

    it('should apply overlapping operations of the same type', () => {
      const baseDelta = new Delta().retain(15, { bold: null });
      const insight1 = createTestInsight('1', 'warning', 0, 10);
      const insight2 = createTestInsight('2', 'warning', 5, 8);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 10, [insight1]),
        createFormatOperation('lynx-insight-warning', 5, 8, [insight2])
      ];

      const result = applyOverlappingGroup(baseDelta, ops);

      const expectedDelta = new Delta([
        { retain: 5, attributes: { bold: null, 'lynx-insight-warning': [insight1] } },
        { retain: 5, attributes: { bold: null, 'lynx-insight-warning': [insight1, insight2] } },
        { retain: 3, attributes: { bold: null, 'lynx-insight-warning': [insight2] } },
        { retain: 2, attributes: { bold: null } }
      ]);

      expect(result).toEqual(expectedDelta);
    });
  });

  describe('processFormatOperations', () => {
    it('should handle empty operations array', () => {
      const baseDelta = new Delta().retain(10, { bold: null });
      const result = processFormatOperations(baseDelta, []);

      expect(result).toBe(baseDelta);
    });

    it('should handle mixed overlapping and non-overlapping operations', () => {
      const baseDelta = new Delta().retain(30, { bold: null });
      const insight1 = createTestInsight('1', 'warning', 0, 8);
      const insight2 = createTestInsight('2', 'error', 5, 8);
      const insight3 = createTestInsight('3', 'info', 20, 5);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 8, [insight1]),
        createFormatOperation('lynx-insight-error', 5, 8, [insight2]),
        createFormatOperation('lynx-insight-info', 20, 5, [insight3])
      ];

      const result = processFormatOperations(baseDelta, ops);

      const expectedDelta = new Delta([
        { retain: 5, attributes: { bold: null, 'lynx-insight-warning': [insight1] } },
        {
          retain: 3,
          attributes: {
            bold: null,
            'lynx-insight-warning': [insight1],
            'lynx-insight-error': [insight2]
          }
        },
        { retain: 5, attributes: { bold: null, 'lynx-insight-error': [insight2] } },
        { retain: 7, attributes: { bold: null } },
        { retain: 5, attributes: { bold: null, 'lynx-insight-info': [insight3] } },
        { retain: 5, attributes: { bold: null } }
      ]);

      expect(result).toEqual(expectedDelta);
    });

    it('should handle multiple overlapping and non-overlapping groups', () => {
      const baseDelta = new Delta().retain(40, { bold: null });
      const insight1 = createTestInsight('1', 'warning', 0, 10);
      const insight2 = createTestInsight('2', 'error', 5, 10); // Overlaps with insight1
      const insight3 = createTestInsight('3', 'info', 25, 5); // Non-overlapping
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 10, [insight1]),
        createFormatOperation('lynx-insight-error', 5, 10, [insight2]),
        createFormatOperation('lynx-insight-info', 25, 5, [insight3])
      ];

      const result = processFormatOperations(baseDelta, ops);

      const expected = new Delta([
        { retain: 5, attributes: { bold: null, 'lynx-insight-warning': [insight1] } },
        {
          retain: 5,
          attributes: {
            bold: null,
            'lynx-insight-warning': [insight1],
            'lynx-insight-error': [insight2]
          }
        },
        { retain: 5, attributes: { bold: null, 'lynx-insight-error': [insight2] } },
        { retain: 10, attributes: { bold: null } },
        { retain: 5, attributes: { bold: null, 'lynx-insight-info': [insight3] } },
        { retain: 10, attributes: { bold: null } }
      ]);
      expect(result).toEqual(expected);
    });

    it('should handle cross-group overlapping of same insight type', () => {
      const baseDelta = new Delta().retain(30, { bold: null });

      // Create insights that will form two overlapping groups, but with cross-group overlap
      const insight1 = createTestInsight('1', 'warning', 0, 15); // Group 1
      const insight2 = createTestInsight('2', 'warning', 5, 15); // Group 1 (overlaps with insight1)
      const insight3 = createTestInsight('3', 'warning', 10, 15); // Group 2 (overlaps with insight2 from Group 1)
      const insight4 = createTestInsight('4', 'warning', 18, 10); // Group 2 (overlaps with insight3)

      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 0, 15, [insight1]),
        createFormatOperation('lynx-insight-warning', 5, 15, [insight2]),
        createFormatOperation('lynx-insight-warning', 10, 15, [insight3]),
        createFormatOperation('lynx-insight-warning', 18, 10, [insight4])
      ];

      const result = processFormatOperations(baseDelta, ops);

      expect(result.ops).toBeDefined();

      // Find operations that have warning insights
      const warningOps = result.ops!.filter(
        op => op.attributes != null && op.attributes['lynx-insight-warning'] != null
      );

      expect(warningOps.length).toBeGreaterThan(0);

      // In the cross-group overlapping region (10-15), we should have insights from both groups
      // This tests that applyOverlappingGroup results are properly merged across groups
      const crossGroupOverlapOp = warningOps.find(op => {
        const insights = op.attributes!['lynx-insight-warning'] as WorkerLynxInsight[];
        return Array.isArray(insights) && insights.length >= 3; // Should have insights from both groups
      });

      expect(crossGroupOverlapOp).toBeDefined();

      if (crossGroupOverlapOp) {
        const insights = crossGroupOverlapOp.attributes!['lynx-insight-warning'] as WorkerLynxInsight[];
        // The overlapping region should contain insights from multiple groups
        const insightIds = insights.map(insight => insight.id);
        expect(insightIds).toContain('1'); // From Group 1
        expect(insightIds).toContain('2'); // From Group 1
        expect(insightIds).toContain('3'); // From Group 2
      }

      // Verify all insights are preserved somewhere
      const allInsights = warningOps.flatMap(op => op.attributes!['lynx-insight-warning'] as WorkerLynxInsight[]);
      const allInsightIds = allInsights.map(insight => insight.id);
      expect(allInsightIds).toContain('1');
      expect(allInsightIds).toContain('2');
      expect(allInsightIds).toContain('3');
      expect(allInsightIds).toContain('4');
    });

    it('should produce precise delta operations with exact boundaries', () => {
      const baseDelta = new Delta().retain(50, { bold: null });
      const insight1 = createTestInsight('1', 'warning', 10, 8);
      const insight2 = createTestInsight('2', 'error', 14, 8);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 10, 8, [insight1]),
        createFormatOperation('lynx-insight-error', 14, 8, [insight2])
      ];

      const result = processFormatOperations(baseDelta, ops);

      const expectedDelta = new Delta([
        { retain: 10, attributes: { bold: null } },
        { retain: 4, attributes: { bold: null, 'lynx-insight-warning': [insight1] } },
        {
          retain: 4,
          attributes: {
            bold: null,
            'lynx-insight-warning': [insight1],
            'lynx-insight-error': [insight2]
          }
        },
        { retain: 4, attributes: { bold: null, 'lynx-insight-error': [insight2] } },
        { retain: 28, attributes: { bold: null } }
      ]);

      expect(result).toEqual(expectedDelta);
    });

    it('should process non-overlapping operations efficiently', () => {
      const baseDelta = new Delta().retain(100, { italic: true });
      const insight1 = createTestInsight('1', 'info', 5, 10);
      const insight2 = createTestInsight('2', 'warning', 30, 8);
      const insight3 = createTestInsight('3', 'error', 60, 12);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-info', 5, 10, [insight1]),
        createFormatOperation('lynx-insight-warning', 30, 8, [insight2]),
        createFormatOperation('lynx-insight-error', 60, 12, [insight3])
      ];

      const result = processFormatOperations(baseDelta, ops);

      const expectedDelta = new Delta([
        { retain: 5, attributes: { italic: true } },
        { retain: 10, attributes: { italic: true, 'lynx-insight-info': [insight1] } },
        { retain: 15, attributes: { italic: true } },
        { retain: 8, attributes: { italic: true, 'lynx-insight-warning': [insight2] } },
        { retain: 22, attributes: { italic: true } },
        { retain: 12, attributes: { italic: true, 'lynx-insight-error': [insight3] } },
        { retain: 28, attributes: { italic: true } }
      ]);

      expect(result).toEqual(expectedDelta);
    });

    it('should deduplicate insights with same id in overlapping regions', () => {
      const baseDelta = new Delta().retain(30, { bold: null });
      const insight1 = createTestInsight('duplicate', 'warning', 5, 10);
      const insight2 = createTestInsight('duplicate', 'warning', 8, 10); // Same id - should be deduplicated
      const insight3 = createTestInsight('unique', 'warning', 10, 8);
      const ops: FormatOperation[] = [
        createFormatOperation('lynx-insight-warning', 5, 10, [insight1]),
        createFormatOperation('lynx-insight-warning', 8, 10, [insight2]),
        createFormatOperation('lynx-insight-warning', 10, 8, [insight3])
      ];

      const result = processFormatOperations(baseDelta, ops);

      const warningOps = result.ops!.filter(
        op => op.attributes != null && op.attributes['lynx-insight-warning'] != null
      );

      // Each operation should have at most one instance of the duplicate insight
      warningOps.forEach(op => {
        const insights = op.attributes!['lynx-insight-warning'] as WorkerLynxInsight[];
        const duplicateInsights = insights.filter(insight => insight.id === 'duplicate');
        expect(duplicateInsights.length).toBeLessThanOrEqual(1);
      });

      // Verify both unique insights are present
      const allInsights = warningOps.flatMap(op => op.attributes!['lynx-insight-warning'] as WorkerLynxInsight[]);
      const uniqueIds = new Set(allInsights.map(insight => insight.id));
      expect(uniqueIds.has('duplicate')).toBe(true);
      expect(uniqueIds.has('unique')).toBe(true);
      expect(uniqueIds.size).toBe(2);
    });

    it('should maintain original delta structure when no insights are applied', () => {
      const originalOps = [
        { retain: 5, attributes: { bold: true } },
        { retain: 10, attributes: { italic: true } },
        { retain: 15 }
      ];
      const baseDelta = new Delta(originalOps);

      const result = processFormatOperations(baseDelta, []);

      expect(result).toBe(baseDelta); // Should return the exact same instance
      expect(result.ops).toEqual(originalOps);
    });
  });
});
