import Quill from 'quill';
import QuillInlineBlot from 'quill/blots/inline';
import QuillScrollBlot from 'quill/blots/scroll';
import { DragAndDrop } from '../drag-and-drop';
import { DisableHtmlClipboard } from './quill-clipboard';
import {
  CheckingQuestionSegmentClass,
  DeleteSegmentClass,
  HighlightParaClass,
  HighlightSegmentClass,
  InsertSegmentClass
} from './quill-formats/quill-attributors';
import { ChapterEmbed, NotNormalizedText, ParaBlock } from './quill-formats/quill-blots';
import { FixSelectionHistory } from './quill-history';
import { registerScripture } from './quill-registrations';

describe('QuillRegistrations', () => {
  let quillRegisterSpy: jasmine.Spy;
  let originalOrder: string[];
  let originalChildren: any[];

  beforeEach(() => {
    quillRegisterSpy = spyOn(Quill, 'register');
    originalOrder = [...QuillInlineBlot.order];
    originalChildren = [...QuillScrollBlot.allowedChildren];
  });

  afterEach(() => {
    QuillInlineBlot.order = originalOrder;
    QuillScrollBlot.allowedChildren = originalChildren;
  });

  it('should register all formats', () => {
    const formatNames = registerScripture();

    // Verify all expected formats are registered
    expect(formatNames).toContain('verse');
    expect(formatNames).toContain('blank');
    expect(formatNames).toContain('empty');
    expect(formatNames).toContain('note');
    expect(formatNames).toContain('note-thread-embed');
    expect(formatNames).toContain('optbreak');
    expect(formatNames).toContain('figure');
    expect(formatNames).toContain('unmatched');
    expect(formatNames).toContain('chapter');
    expect(formatNames).toContain('char');
    expect(formatNames).toContain('ref');
    expect(formatNames).toContain('para-contents');
    expect(formatNames).toContain('segment');
    expect(formatNames).toContain('text-anchor');
    expect(formatNames).toContain('para');
  });

  it('should register attributors', () => {
    registerScripture();

    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/insert-segment', InsertSegmentClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/delete-segment', DeleteSegmentClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/highlight-segment', HighlightSegmentClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/highlight-para', HighlightParaClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/question-segment', CheckingQuestionSegmentClass);
  });

  it('should register core modules', () => {
    registerScripture();

    expect(quillRegisterSpy).toHaveBeenCalledWith('blots/text', NotNormalizedText, true);
    expect(quillRegisterSpy).toHaveBeenCalledWith('modules/clipboard', DisableHtmlClipboard, true);
    expect(quillRegisterSpy).toHaveBeenCalledWith('modules/history', FixSelectionHistory, true);
    expect(quillRegisterSpy).toHaveBeenCalledWith('modules/dragAndDrop', DragAndDrop);
  });

  it('should update QuillInlineBlot order', () => {
    registerScripture();

    const orderItems = ['text-anchor', 'char', 'segment', 'para-contents'];

    // Check items exist
    orderItems.forEach(item => {
      expect(QuillInlineBlot.order).toContain(item);
    });

    // Get relative positions
    const textAnchorIndex = QuillInlineBlot.order.indexOf('text-anchor');
    const charIndex = QuillInlineBlot.order.indexOf('char');
    const segmentIndex = QuillInlineBlot.order.indexOf('segment');
    const paraContentsIndex = QuillInlineBlot.order.indexOf('para-contents');

    // Verify order: text-anchor -> char -> segment -> para-contents
    expect(textAnchorIndex).toBeLessThan(charIndex);
    expect(charIndex).toBeLessThan(segmentIndex);
    expect(segmentIndex).toBeLessThan(paraContentsIndex);
  });

  it('should update QuillScrollBlot allowed children', () => {
    registerScripture();

    expect(QuillScrollBlot.allowedChildren).toContain(ParaBlock);
    expect(QuillScrollBlot.allowedChildren).toContain(ChapterEmbed);
  });
});
