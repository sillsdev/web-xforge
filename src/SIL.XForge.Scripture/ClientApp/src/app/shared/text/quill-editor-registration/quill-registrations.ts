import { Attributor } from 'parchment';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import QuillInlineBlot from 'quill/blots/inline';
import QuillScrollBlot from 'quill/blots/scroll';
import { DragAndDrop } from '../drag-and-drop';
import { DisableHtmlClipboard } from './quill-clipboard';
import { FormattableBlotClass, QuillFormatRegistryService } from './quill-format-registry.service';
import {
  CheckingQuestionCountAttribute,
  CheckingQuestionSegmentClass,
  CommenterSelectedSegmentClass,
  DeleteSegmentClass,
  DraftClass,
  HighlightParaClass,
  HighlightSegmentClass,
  InsertSegmentClass,
  InvalidBlockClass,
  InvalidInlineClass,
  NoteThreadHighlightClass,
  NoteThreadSegmentClass,
  ParaStyleDescriptionAttribute
} from './quill-formats/quill-attributors';
import {
  BlankEmbed,
  ChapterEmbed,
  CharInline,
  EmptyEmbed,
  FigureEmbed,
  NoteEmbed,
  NoteThreadEmbed,
  NotNormalizedText,
  OptBreakEmbed,
  ParaBlock,
  ParaInline,
  RefInline,
  ScrollBlot,
  SegmentInline,
  TextAnchorInline,
  UnknownBlot,
  UnmatchedEmbed,
  VerseEmbed
} from './quill-formats/quill-blots';
import { FixSelectionHistory } from './quill-history';

export function registerScriptureFormats(formatRegistry: QuillFormatRegistryService): void {
  const formats: (FormattableBlotClass | Attributor)[] = [
    // Embed Blots
    VerseEmbed,
    BlankEmbed,
    EmptyEmbed,
    NoteEmbed,
    NoteThreadEmbed,
    OptBreakEmbed,
    FigureEmbed,
    UnmatchedEmbed,
    ChapterEmbed,
    UnknownBlot,

    // Inline Blots
    CharInline,
    RefInline,
    ParaInline,
    SegmentInline,
    TextAnchorInline,

    // Block Blots
    ParaBlock,

    // Class Attributors
    InsertSegmentClass,
    DeleteSegmentClass,
    HighlightSegmentClass,
    HighlightParaClass,
    CheckingQuestionSegmentClass,
    NoteThreadSegmentClass,
    NoteThreadHighlightClass,
    CommenterSelectedSegmentClass,
    InvalidBlockClass,
    InvalidInlineClass,
    DraftClass,

    // Other Attributors
    CheckingQuestionCountAttribute,
    ParaStyleDescriptionAttribute
  ];

  // Lower index means deeper in the DOM tree i.e. text-anchor will be nested inside of char.
  // If char doesn't exist then it will nest inside the next available element higher up the DOM.
  QuillInlineBlot.order.push(...['text-anchor', 'char', 'segment', 'para-contents']);

  QuillScrollBlot.allowedChildren.push(...[ParaBlock, ChapterEmbed]);

  // Register formats through the registry service
  formatRegistry.registerFormats(formats);

  Quill.register('blots/scroll', ScrollBlot, true);
  Quill.register('blots/text', NotNormalizedText, true);
  Quill.register('modules/clipboard', DisableHtmlClipboard, true);
  Quill.register('modules/cursors', QuillCursors);
  Quill.register('modules/history', FixSelectionHistory, true);
  Quill.register('modules/dragAndDrop', DragAndDrop);
}
