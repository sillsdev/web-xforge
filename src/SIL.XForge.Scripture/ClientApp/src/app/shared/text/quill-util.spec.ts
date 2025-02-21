import Quill from 'quill';
import { DeltaOperation } from 'rich-text';
import { instance, mock, when } from 'ts-mockito';
import { getAttributesAtPosition, getRetainCount } from './quill-util';

describe('quill util', () => {
  describe('getAttributesAtPosition', () => {
    let mockQuill: Quill;

    beforeEach(() => {
      mockQuill = mock(Quill);
    });

    it('returns empty map when no formatting exists', () => {
      when(mockQuill.getFormat(0)).thenReturn({});
      when(mockQuill.getFormat(0, 1)).thenReturn({});

      const result = getAttributesAtPosition(instance(mockQuill), 0);
      expect(result).toEqual({});
    });

    it('returns block level formatting from insertion point', () => {
      when(mockQuill.getFormat(5)).thenReturn({ align: 'center', bold: true });
      when(mockQuill.getFormat(5, 1)).thenReturn({});

      const result = getAttributesAtPosition(instance(mockQuill), 5);
      expect(result).toEqual({ align: 'center', bold: true });
    });

    it('combines insertion and character formats when segment exists', () => {
      when(mockQuill.getFormat(10)).thenReturn({ align: 'center' });
      when(mockQuill.getFormat(10, 1)).thenReturn({ segment: 'verse_1_1', italic: true });

      const result = getAttributesAtPosition(instance(mockQuill), 10);
      expect(result).toEqual({
        align: 'center',
        segment: 'verse_1_1',
        italic: true
      });
    });

    it('ignores text-anchor attribute from character format', () => {
      when(mockQuill.getFormat(15)).thenReturn({ align: 'center' });
      when(mockQuill.getFormat(15, 1)).thenReturn({
        segment: 'verse_1_1',
        'text-anchor': 'start'
      });

      const result = getAttributesAtPosition(instance(mockQuill), 15);
      expect(result).toEqual({
        align: 'center',
        segment: 'verse_1_1'
      });
    });

    it('does not copy character formats when segment is missing', () => {
      when(mockQuill.getFormat(20)).thenReturn({ align: 'center' });
      when(mockQuill.getFormat(20, 1)).thenReturn({ bold: true, italic: true });

      const result = getAttributesAtPosition(instance(mockQuill), 20);
      expect(result).toEqual({ align: 'center' });
    });
  });

  describe('getRetainCount', () => {
    it('returns undefined for undefined operation', () => {
      const result = getRetainCount(undefined as unknown as DeltaOperation);
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-retain operation', () => {
      const op: DeltaOperation = { insert: 'text' };
      const result = getRetainCount(op);
      expect(result).toBeUndefined();
    });

    it('returns number for valid retain operation', () => {
      const op: DeltaOperation = { retain: 5 };
      const result = getRetainCount(op);
      expect(result).toBe(5);
    });

    it('throws error for object retain operation', () => {
      const op = { retain: {} } as DeltaOperation;
      expect(() => getRetainCount(op)).toThrowError("Invalid 'retain' operation");
    });

    it('returns undefined for empty operation', () => {
      const op = {} as DeltaOperation;
      const result = getRetainCount(op);
      expect(result).toBeUndefined();
    });
  });
});
