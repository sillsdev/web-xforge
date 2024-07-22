import { TestBed } from '@angular/core/testing';
import Quill from 'quill';
import QuillInlineBlot from 'quill/blots/inline';
import QuillScrollBlot from 'quill/blots/scroll';
import { DragAndDrop } from '../drag-and-drop';
import { DisableHtmlClipboard } from './quill-clipboard';
import { QuillFormatRegistryService } from './quill-format-registry.service';
import {
  CheckingQuestionSegmentClass,
  DeleteSegmentClass,
  HighlightParaClass,
  HighlightSegmentClass,
  InsertSegmentClass
} from './quill-formats/quill-attributors';
import { ChapterEmbed, NotNormalizedText, ParaBlock } from './quill-formats/quill-blots';
import { FixSelectionHistory } from './quill-history';
import { registerScriptureFormats } from './quill-registrations';

describe('QuillRegistrations', () => {
  let quillRegisterSpy: jasmine.Spy;
  let originalOrder: string[];
  let originalChildren: any[];
  let formatRegistry: QuillFormatRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QuillFormatRegistryService]
    });
    formatRegistry = TestBed.inject(QuillFormatRegistryService);
    quillRegisterSpy = spyOn(Quill, 'register');
    originalOrder = [...QuillInlineBlot.order];
    originalChildren = [...QuillScrollBlot.allowedChildren];
  });

  afterEach(() => {
    QuillInlineBlot.order = originalOrder;
    QuillScrollBlot.allowedChildren = originalChildren;
  });

  it('should register all formats', () => {
    registerScriptureFormats(formatRegistry);

    // Verify all expected formats are registered
    const registeredFormats = formatRegistry.getRegisteredFormats();
    expect(registeredFormats).toContain('verse');
    expect(registeredFormats).toContain('blank');
    expect(registeredFormats).toContain('empty');
    expect(registeredFormats).toContain('note');
    expect(registeredFormats).toContain('note-thread-embed');
    expect(registeredFormats).toContain('optbreak');
    expect(registeredFormats).toContain('figure');
    expect(registeredFormats).toContain('unmatched');
    expect(registeredFormats).toContain('chapter');
    expect(registeredFormats).toContain('char');
    expect(registeredFormats).toContain('ref');
    expect(registeredFormats).toContain('para-contents');
    expect(registeredFormats).toContain('segment');
    expect(registeredFormats).toContain('text-anchor');
    expect(registeredFormats).toContain('para');
  });

  it('should register attributors', () => {
    registerScriptureFormats(formatRegistry);

    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/insert-segment', InsertSegmentClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/delete-segment', DeleteSegmentClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/highlight-segment', HighlightSegmentClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/highlight-para', HighlightParaClass);
    expect(quillRegisterSpy).toHaveBeenCalledWith('formats/question-segment', CheckingQuestionSegmentClass);
  });

  it('should register core modules', () => {
    registerScriptureFormats(formatRegistry);

    expect(quillRegisterSpy).toHaveBeenCalledWith('blots/text', NotNormalizedText, true);
    expect(quillRegisterSpy).toHaveBeenCalledWith('modules/clipboard', DisableHtmlClipboard, true);
    expect(quillRegisterSpy).toHaveBeenCalledWith('modules/history', FixSelectionHistory, true);
    expect(quillRegisterSpy).toHaveBeenCalledWith('modules/dragAndDrop', DragAndDrop);
  });

  it('should update QuillInlineBlot order', () => {
    registerScriptureFormats(formatRegistry);

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
    registerScriptureFormats(formatRegistry);

    expect(QuillScrollBlot.allowedChildren).toContain(ParaBlock);
    expect(QuillScrollBlot.allowedChildren).toContain(ChapterEmbed);
  });
});
