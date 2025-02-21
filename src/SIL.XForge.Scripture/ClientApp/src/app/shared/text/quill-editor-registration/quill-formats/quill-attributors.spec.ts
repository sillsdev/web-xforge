import { Parchment } from 'quill';
import {
  CheckingQuestionCountAttribute,
  CheckingQuestionSegmentClass,
  ClassAttributor,
  CommenterSelectedSegmentClass,
  DeleteSegmentClass,
  DraftClass,
  HighlightParaClass,
  HighlightSegmentClass,
  InsertSegmentClass,
  InvalidBlockClass,
  InvalidInlineClass,
  isAttributor,
  NoteThreadHighlightClass,
  NoteThreadSegmentClass,
  ParaStyleDescriptionAttribute
} from './quill-attributors';

describe('Quill Attributors', () => {
  describe('ClassAttributor', () => {
    let attributor: ClassAttributor;
    let node: HTMLElement;

    beforeEach(() => {
      attributor = new ClassAttributor('test-attr', 'test-class', {
        scope: Parchment.Scope.INLINE_ATTRIBUTE
      });
      node = document.createElement('div');
    });

    it('should add class when value is true', () => {
      const result = attributor.add(node, true);

      expect(result).toBe(true);
      expect(node.classList.contains('test-class')).toBe(true);
    });

    it('should add value using parent when value is not true', () => {
      const result = attributor.add(node, 'custom-value');

      expect(result).toBe(true);
      expect(node.getAttribute('class')).toBe('test-class-custom-value');
    });

    it('should remove class', () => {
      node.classList.add('test-class');

      attributor.remove(node);

      expect(node.classList.contains('test-class')).toBe(false);
    });

    it('should return true when class exists', () => {
      node.classList.add('test-class');

      const result = attributor.value(node);

      expect(result).toBe(true);
    });

    it('should return parent value when class does not exist', () => {
      node.setAttribute('class', 'test-class-custom');

      const result = attributor.value(node);

      expect(result).toBe('custom');
    });
  });

  describe('Attributor instances', () => {
    it('should create InsertSegmentClass with correct scope', () => {
      expect(InsertSegmentClass.attrName).toBe('insert-segment');
      expect(InsertSegmentClass.keyName).toBe('insert-segment');
      expect(InsertSegmentClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create DeleteSegmentClass with correct scope', () => {
      expect(DeleteSegmentClass.attrName).toBe('delete-segment');
      expect(DeleteSegmentClass.keyName).toBe('delete-segment');
      expect(DeleteSegmentClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create HighlightSegmentClass with correct scope', () => {
      expect(HighlightSegmentClass.attrName).toBe('highlight-segment');
      expect(HighlightSegmentClass.keyName).toBe('highlight-segment');
      expect(HighlightSegmentClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create HighlightParaClass with correct scope', () => {
      expect(HighlightParaClass.attrName).toBe('highlight-para');
      expect(HighlightParaClass.keyName).toBe('highlight-para');
      expect(HighlightParaClass.scope).toBe(Parchment.Scope.BLOCK_ATTRIBUTE);
    });

    it('should create CheckingQuestionSegmentClass with correct scope', () => {
      expect(CheckingQuestionSegmentClass.attrName).toBe('question-segment');
      expect(CheckingQuestionSegmentClass.keyName).toBe('question-segment');
      expect(CheckingQuestionSegmentClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create NoteThreadSegmentClass with correct scope', () => {
      expect(NoteThreadSegmentClass.attrName).toBe('note-thread-segment');
      expect(NoteThreadSegmentClass.keyName).toBe('note-thread-segment');
      expect(NoteThreadSegmentClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create NoteThreadHighlightClass with correct scope', () => {
      expect(NoteThreadHighlightClass.attrName).toBe('note-thread-highlight');
      expect(NoteThreadHighlightClass.keyName).toBe('note-thread-highlight');
      expect(NoteThreadHighlightClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create CommenterSelectedSegmentClass with correct scope', () => {
      expect(CommenterSelectedSegmentClass.attrName).toBe('commenter-selection');
      expect(CommenterSelectedSegmentClass.keyName).toBe('commenter-selection');
      expect(CommenterSelectedSegmentClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create InvalidBlockClass with correct scope', () => {
      expect(InvalidBlockClass.attrName).toBe('invalid-block');
      expect(InvalidBlockClass.keyName).toBe('invalid-block');
      expect(InvalidBlockClass.scope).toBe(Parchment.Scope.BLOCK_ATTRIBUTE);
    });

    it('should create InvalidInlineClass with correct scope', () => {
      expect(InvalidInlineClass.attrName).toBe('invalid-inline');
      expect(InvalidInlineClass.keyName).toBe('invalid-inline');
      expect(InvalidInlineClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create DraftClass with correct scope', () => {
      expect(DraftClass.attrName).toBe('draft');
      expect(DraftClass.keyName).toBe('draft');
      expect(DraftClass.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create CheckingQuestionCountAttribute with correct scope', () => {
      expect(CheckingQuestionCountAttribute.attrName).toBe('question-count');
      expect(CheckingQuestionCountAttribute.keyName).toBe('data-question-count');
      expect(CheckingQuestionCountAttribute.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });

    it('should create ParaStyleDescriptionAttribute with correct scope', () => {
      expect(ParaStyleDescriptionAttribute.attrName).toBe('style-description');
      expect(ParaStyleDescriptionAttribute.keyName).toBe('data-style-description');
      expect(ParaStyleDescriptionAttribute.scope).toBe(Parchment.Scope.INLINE_ATTRIBUTE);
    });
  });

  describe('isAttributor', () => {
    it('should return true for Attributor instances', () => {
      expect(isAttributor(InsertSegmentClass)).toBe(true);
      expect(isAttributor(CheckingQuestionCountAttribute)).toBe(true);
    });

    it('should return false for non-Attributor values', () => {
      expect(isAttributor(null)).toBe(false);
      expect(isAttributor({})).toBe(false);
      expect(isAttributor('not an attributor')).toBe(false);
    });
  });
});
