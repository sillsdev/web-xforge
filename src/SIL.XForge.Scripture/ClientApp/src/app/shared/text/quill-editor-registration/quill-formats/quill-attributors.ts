import { Attributor } from 'parchment';
import { Parchment } from 'quill';

export class ClassAttributor extends Parchment.ClassAttributor {
  add(node: HTMLElement, value: any): boolean {
    if (value === true) {
      this.remove(node);
      node.classList.add(this.keyName);
      return true;
    }
    return super.add(node, value);
  }

  remove(node: HTMLElement): void {
    node.classList.remove(this.keyName);
    super.remove(node);
  }

  value(node: HTMLElement): any {
    if (node.classList.contains(this.keyName)) {
      return true;
    }
    return super.value(node);
  }
}

export const InsertSegmentClass = new ClassAttributor('insert-segment', 'insert-segment', {
  scope: Parchment.Scope.INLINE
});

export const DeleteSegmentClass = new ClassAttributor('delete-segment', 'delete-segment', {
  scope: Parchment.Scope.INLINE
});

export const HighlightSegmentClass = new ClassAttributor('highlight-segment', 'highlight-segment', {
  scope: Parchment.Scope.INLINE
});

export const HighlightParaClass = new ClassAttributor('highlight-para', 'highlight-para', {
  scope: Parchment.Scope.BLOCK
});

export const CheckingQuestionSegmentClass = new ClassAttributor('question-segment', 'question-segment', {
  scope: Parchment.Scope.INLINE
});

export const CheckingQuestionCountAttribute = new Parchment.Attributor('question-count', 'data-question-count', {
  scope: Parchment.Scope.INLINE
});

export const ParaStyleDescriptionAttribute = new Parchment.Attributor('style-description', 'data-style-description', {
  scope: Parchment.Scope.INLINE
});

export const NoteThreadSegmentClass = new ClassAttributor('note-thread-segment', 'note-thread-segment', {
  scope: Parchment.Scope.INLINE
});

export const NoteThreadHighlightClass = new ClassAttributor('note-thread-highlight', 'note-thread-highlight', {
  scope: Parchment.Scope.INLINE
});

export const CommenterSelectedSegmentClass = new ClassAttributor('commenter-selection', 'commenter-selection', {
  scope: Parchment.Scope.INLINE
});

export const InvalidBlockClass = new ClassAttributor('invalid-block', 'invalid-block', {
  scope: Parchment.Scope.BLOCK
});

export const InvalidInlineClass = new ClassAttributor('invalid-inline', 'invalid-inline', {
  scope: Parchment.Scope.INLINE
});

export const DraftClass = new ClassAttributor('draft', 'draft', {
  scope: Parchment.Scope.INLINE
});

export function isAttributor(blot: any): blot is Attributor {
  return blot instanceof Attributor;
}
