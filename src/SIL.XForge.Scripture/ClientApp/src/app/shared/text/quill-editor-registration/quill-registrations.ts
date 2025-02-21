import { Attributor, Formattable } from 'parchment';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import QuillInlineBlot from 'quill/blots/inline';
import QuillScrollBlot from 'quill/blots/scroll';
import { DragAndDrop } from '../drag-and-drop';
import { DisableHtmlClipboard } from './quill-clipboard';
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
  isAttributor,
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
  SegmentInline,
  TextAnchorInline,
  UnmatchedEmbed,
  VerseEmbed
} from './quill-formats/quill-blots';
import { FixSelectionHistory } from './quill-history';

interface FormattableBlotClass {
  new (...args: any[]): Formattable;
  blotName: string;
}

export function registerScripture(): string[] {
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

  const formatNames = formats.map(format => {
    const isAttr = isAttributor(format);
    const prefix = isAttr ? 'formats' : 'blots';
    const name = isAttr ? format.attrName : format.blotName;
    Quill.register(`${prefix}/${name}`, format);
    return name;
  });

  Quill.register('blots/text', NotNormalizedText, true);
  Quill.register('modules/clipboard', DisableHtmlClipboard, true);
  Quill.register('modules/cursors', QuillCursors);
  Quill.register('modules/history', FixSelectionHistory, true);
  Quill.register('modules/dragAndDrop', DragAndDrop);

  return formatNames;
}
