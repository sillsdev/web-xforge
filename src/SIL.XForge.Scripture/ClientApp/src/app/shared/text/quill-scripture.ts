import cloneDeep from 'lodash-es/cloneDeep';
import Parchment from 'parchment';
import Quill, { Clipboard, DeltaOperation, DeltaStatic, History, HistoryStackType, StringMap } from 'quill';
import QuillCursors from 'quill-cursors';
import { DragAndDrop } from './drag-and-drop';

const Delta: new () => DeltaStatic = Quill.import('delta');

export function getAttributesAtPosition(editor: Quill, editorPosition: number): StringMap {
  // The format of the insertion point may only contain the block level formatting,
  // the format classes and other information we get from the character following the insertion point
  const insertionFormat: StringMap = editor.getFormat(editorPosition);
  const characterFormat: StringMap = editor.getFormat(editorPosition, 1);
  if (characterFormat['segment'] != null) {
    for (const key of Object.keys(characterFormat)) {
      // we ignore text anchor formatting because we cannot depend on the character format to tell us if it is needed
      if (key !== 'text-anchor') {
        insertionFormat[key] = characterFormat[key];
      }
    }
  }
  return insertionFormat;
}

function customAttributeName(key: string): string {
  return 'data-' + key;
}

const USX_VALUE = '__usx_value';

function getUsxValue<T>(node: HTMLElement): T {
  return node[USX_VALUE];
}

function setUsxValue(node: HTMLElement, value: any): void {
  node[USX_VALUE] = value;
}

interface UsxStyle {
  style?: string;
}

interface Para extends UsxStyle {
  vid?: string;
  status?: string;
}

interface Chapter extends UsxStyle {
  number: number;
  altnumber?: string;
  pubnumber?: string;
  sid?: string;
  eid?: string;
}

interface NoteThread {
  iconsrc: string;
  preview: string;
  threadid: string;
  highlight?: boolean;
}

interface Verse extends UsxStyle {
  number: string;
  altnumber?: string;
  pubnumber?: string;
  sid?: string;
  eid?: string;
}

interface Note extends UsxStyle {
  caller: string;
  closed?: string;
  category?: string;
  contents?: { ops: DeltaOperation[] };
}

interface Figure extends UsxStyle {
  alt?: string;
  file: string;
  src?: string;
  size: string;
  loc?: string;
  copy?: string;
  ref: string;
  contents?: { ops: DeltaOperation[] };
}

interface Ref {
  loc: string;
}

interface Unmatched {
  marker: string;
}

export function registerScripture(): string[] {
  const QuillClipboard = Quill.import('modules/clipboard') as typeof Clipboard;
  const QuillHistory = Quill.import('modules/history') as typeof History;
  const QuillParchment = Quill.import('parchment') as typeof Parchment;
  const Inline = Quill.import('blots/inline') as typeof Parchment.Inline;
  const Block = Quill.import('blots/block') as typeof Parchment.Block;
  const Scroll = Quill.import('blots/scroll') as typeof Parchment.Scroll;
  const Embed = Quill.import('blots/embed') as typeof Parchment.Embed;
  const BlockEmbed = Quill.import('blots/block/embed') as typeof Parchment.Embed;
  const Text = Quill.import('blots/text') as typeof Parchment.Text;

  const formats: any[] = [];

  // zero width space
  const ZWSP = '\u200b';
  // non-breaking space
  const NBSP = '\u00A0';

  /**
   * This class overrides the "value" method so that it does not normalize text to NFC. This avoids a bug where Quill
   * does not properly handle NFD data (https://github.com/quilljs/quill/issues/1976).
   */
  class NotNormalizedText extends Text {
    static value(domNode: Text): string {
      return domNode.data;
    }
  }

  class VerseEmbed extends Embed {
    static blotName = 'verse';
    static tagName = 'usx-verse';

    static create(value: Verse): Node {
      const node = super.create(value) as HTMLElement;
      // add a wbr element before the verse number, so that it allows breaking
      node.appendChild(document.createElement('wbr'));
      const containerSpan = document.createElement('span');
      const verseSpan = document.createElement('span');
      verseSpan.innerText = value.number;
      containerSpan.appendChild(verseSpan);

      if (value.altnumber != null) {
        const verseAltSpan: HTMLSpanElement = document.createElement('span');
        verseAltSpan.setAttribute(customAttributeName('style'), 'va');
        verseAltSpan.innerText = value.altnumber;
        verseSpan.appendChild(verseAltSpan);
      }

      node.appendChild(containerSpan);
      setUsxValue(node, value);
      return node;
    }

    static value(node: HTMLElement): Verse {
      return getUsxValue(node);
    }
  }
  formats.push(VerseEmbed);

  class BlankEmbed extends Embed {
    static blotName = 'blank';
    static tagName = 'usx-blank';

    static create(value: boolean): Node {
      const node = super.create(value) as HTMLElement;
      node.innerText = NBSP.repeat(8);
      return node;
    }

    static value(_node: HTMLElement): boolean {
      return true;
    }

    static formats(node: HTMLElement): any {
      const contentNode = node.firstElementChild;
      return contentNode != null && contentNode.textContent === NBSP ? { initial: true } : undefined;
    }

    contentNode!: HTMLElement;

    format(name: string, value: any): void {
      if (name === 'initial' && value === true) {
        this.contentNode.innerText = NBSP;
      }
      super.format(name, value);
    }
  }
  formats.push(BlankEmbed);
  formats.push('initial');

  class EmptyEmbed extends Embed {
    static blotName = 'empty';
    static tagName = 'usx-empty';

    static create(value: boolean): Node {
      const node = super.create(value) as HTMLElement;
      node.innerText = ZWSP;
      return node;
    }

    static value(_node: HTMLElement): boolean {
      return true;
    }

    static formats(node: HTMLElement): boolean {
      return EmptyEmbed.value(node);
    }

    contentNode!: HTMLElement;
  }
  formats.push(EmptyEmbed);

  /** Span of characters or elements, that can have formatting. */
  class CharInline extends Inline {
    static blotName = 'char';
    static tagName = 'usx-char';

    static create(value: UsxStyle): Node {
      const node = super.create(value) as HTMLElement;
      if (value != null && value.style != null) {
        node.setAttribute(customAttributeName('style'), value.style);
        setUsxValue(node, value);
      }
      return node;
    }

    static formats(node: HTMLElement): UsxStyle {
      return CharInline.value(node);
    }

    static value(node: HTMLElement): UsxStyle {
      return getUsxValue(node);
    }

    format(name: string, value: any): void {
      const usxStyle = value as UsxStyle;
      if (name === CharInline.blotName && value != null && usxStyle.style != null) {
        const elem = this.domNode as HTMLElement;
        elem.setAttribute(customAttributeName('style'), usxStyle.style);
        setUsxValue(elem, usxStyle);
      } else {
        super.format(name, value);
      }
    }
  }
  formats.push(CharInline);

  class RefInline extends Inline {
    static blotName = 'ref';
    static tagName = 'usx-ref';

    static create(value: Ref): Node {
      const node = super.create(value) as HTMLElement;
      node.setAttribute(customAttributeName('loc'), value.loc);
      setUsxValue(node, value);
      return node;
    }

    static formats(node: HTMLElement): Ref {
      return RefInline.value(node);
    }

    static value(node: HTMLElement): Ref {
      return getUsxValue(node);
    }

    format(name: string, value: any): void {
      if (name === RefInline.blotName && value != null) {
        const ref = value as Ref;
        const elem = this.domNode as HTMLElement;
        elem.setAttribute(customAttributeName('loc'), ref.loc);
        setUsxValue(elem, ref);
      } else {
        super.format(name, value);
      }
    }
  }
  formats.push(RefInline);

  class NoteEmbed extends Embed {
    static blotName = 'note';
    static tagName = 'usx-note';

    static create(value: Note): Node {
      const node = super.create(value) as HTMLElement;
      if (value != null && value.style != null) {
        node.setAttribute(customAttributeName('style'), value.style);
      }
      node.setAttribute(customAttributeName('caller'), value.caller);
      if (value.caller !== '+' && value.caller !== '-') {
        node.innerText = value.caller;
      }
      if (value.contents != null) {
        // ignore blank embeds (checked here as non-string insert)
        node.title = value.contents.ops.reduce(
          (text, op) => (typeof op.insert === 'string' ? text + op.insert : text),
          ''
        );
      }
      setUsxValue(node, value);
      return node;
    }

    static value(node: HTMLElement): Note {
      return getUsxValue(node);
    }
  }
  formats.push(NoteEmbed);

  class NoteThreadEmbed extends Embed {
    static blotName = 'note-thread-embed';
    static tagName = 'display-note';

    static create(value: NoteThread) {
      const node = super.create(value) as HTMLElement;
      node.setAttribute('style', value.iconsrc);
      node.setAttribute('title', value.preview);
      node.setAttribute(customAttributeName('thread-id'), value.threadid);
      if (value.highlight) {
        node.classList.add('note-thread-highlight');
      }
      return node;
    }

    static formats(node: HTMLElement): NoteThread {
      return NoteThreadEmbed.value(node);
    }

    static value(node: HTMLElement): NoteThread {
      return {
        iconsrc: node.getAttribute('style')!,
        preview: node.getAttribute('title')!,
        threadid: node.getAttribute(customAttributeName('thread-id'))!
      };
    }

    format(name: string, value: any): void {
      if (name === NoteThreadEmbed.blotName && value != null) {
        const ref = value as NoteThread;
        const elem = this.domNode as HTMLElement;
        ref.highlight ? elem.classList.add('note-thread-highlight') : elem.classList.remove('note-thread-highlight');
      } else {
        super.format(name, value);
      }
    }
  }
  formats.push(NoteThreadEmbed);

  class OptBreakEmbed extends Embed {
    static blotName = 'optbreak';
    static tagName = 'usx-optbreak';

    static create(value: UsxStyle): Node {
      const node = super.create(value) as HTMLElement;
      node.innerHTML = '<br>';
      setUsxValue(node, value);
      return node;
    }

    static value(node: HTMLElement): UsxStyle {
      return getUsxValue(node);
    }
  }
  formats.push(OptBreakEmbed);

  class FigureEmbed extends Embed {
    static blotName = 'figure';
    static tagName = 'usx-figure';

    static create(value: Figure): Node {
      const node = super.create(value) as HTMLElement;
      node.innerHTML = '&#x1f4c8';
      const title: string[] = [];
      if (value.alt != null) {
        title.push(value.alt);
      }
      if (value.file != null) {
        title.push(value.file);
      }
      if (value.src != null) {
        title.push(value.src);
      }
      if (value.size != null) {
        title.push(value.size);
      }
      if (value.loc != null) {
        title.push(value.loc);
      }
      if (value.copy != null) {
        title.push(value.copy);
      }
      if (value.contents != null) {
        title.push(value.contents.ops.reduce((text, op) => text + op.insert, ''));
      }
      if (value.ref != null) {
        title.push(value.ref);
      }
      node.title = title.join('|');
      setUsxValue(node, value);
      return node;
    }

    static value(node: HTMLElement): Figure {
      return getUsxValue(node);
    }
  }
  formats.push(FigureEmbed);

  class UnmatchedEmbed extends Embed {
    static blotName = 'unmatched';
    static tagName = 'usx-unmatched';

    static create(value: Unmatched): Node {
      const node = super.create(value) as HTMLElement;
      node.innerText = value.marker;
      setUsxValue(node, value);
      return node;
    }

    static value(node: HTMLElement): Unmatched {
      return getUsxValue(node);
    }
  }
  formats.push(UnmatchedEmbed);

  class ParaBlock extends Block {
    static blotName = 'para';
    static tagName = 'usx-para';

    static create(value: Para): Node {
      const node = super.create(value) as HTMLElement;
      if (value != null && value.style != null) {
        node.setAttribute(customAttributeName('style'), value.style);
        setUsxValue(node, value);
      }
      return node;
    }

    static formats(node: HTMLElement): Para {
      return ParaBlock.value(node);
    }

    static value(node: HTMLElement): Para {
      return getUsxValue(node);
    }

    format(name: string, value: any): void {
      const para = value as Para;
      if (name === ParaBlock.blotName && value != null && para.style != null) {
        const elem = this.domNode as HTMLElement;
        elem.setAttribute(customAttributeName('style'), para.style);
        setUsxValue(elem, para);
      } else {
        super.format(name, value);
      }
    }
  }
  formats.push(ParaBlock);

  class ParaInline extends Inline {
    static blotName = 'para-contents';
    static tagName = 'usx-para-contents';

    static value(_node: HTMLElement): boolean {
      return true;
    }

    static formats(node: HTMLElement): boolean {
      return ParaInline.value(node);
    }

    formatAt(index: number, length: number, name: string, value: any): void {
      if (name === ParaInline.blotName || name === 'invalid-inline') {
        super.formatAt(index, length, name, value);
      } else {
        this.children.forEachAt(index, length, (child, offset, len) => {
          child.formatAt(offset, len, name, value);
        });
      }
    }

    insertAt(index: number, value: string, def?: any): void {
      // force verse embeds to not get inserted inside of segments
      if (value === 'verse') {
        const [child, offset] = this.children.find(index);
        if (child != null) {
          const after = child.split(offset);
          const node = VerseEmbed.create(def);
          const blot = new VerseEmbed(node);
          this.insertBefore(blot, after);
          return;
        }
      }
      super.insertAt(index, value, def);
    }
  }
  formats.push(ParaInline);

  class SegmentInline extends Inline {
    static blotName = 'segment';
    static tagName = 'usx-segment';

    static create(value: string): Node {
      const node = super.create(value) as HTMLElement;
      node.setAttribute(customAttributeName('segment'), value);
      return node;
    }

    static formats(node: HTMLElement): string {
      return SegmentInline.value(node);
    }

    static value(node: HTMLElement): string {
      return node.getAttribute(customAttributeName('segment'))!;
    }

    format(name: string, value: any): void {
      if (name === SegmentInline.blotName && value != null) {
        this.domNode.setAttribute(customAttributeName('segment'), value);
      } else {
        super.format(name, value);
      }
    }
  }
  formats.push(SegmentInline);

  class TextAnchorInline extends Inline {
    static blotName = 'text-anchor';
    static tagName = 'display-text-anchor';
  }
  formats.push(TextAnchorInline);

  // Lower index means deeper in the DOM tree i.e. text-anchor will be nested inside of char. If char doesn't exist
  // then it will nest inside the next available element higher up the DOM
  (Inline as any).order.push('text-anchor');
  (Inline as any).order.push('char');
  (Inline as any).order.push('segment');
  (Inline as any).order.push('para-contents');

  class ChapterEmbed extends BlockEmbed {
    static blotName = 'chapter';
    static tagName = 'usx-chapter';

    static create(value: Chapter): Node {
      const node = super.create(value) as HTMLElement;
      const span = document.createElement('span');
      span.innerText = value.number.toString();
      node.appendChild(span);
      node.contentEditable = 'false';
      setUsxValue(node, value);
      return node;
    }

    static value(node: HTMLElement): Chapter {
      return getUsxValue(node);
    }
  }
  formats.push(ChapterEmbed);
  Scroll.allowedChildren.push(ParaBlock);
  Scroll.allowedChildren.push(ChapterEmbed);

  class ClassAttributor extends QuillParchment.Attributor.Class {
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

  const HighlightSegmentClass = new ClassAttributor('highlight-segment', 'highlight-segment', {
    scope: Parchment.Scope.INLINE
  });
  formats.push(HighlightSegmentClass);

  const HighlightParaClass = new ClassAttributor('highlight-para', 'highlight-para', {
    scope: Parchment.Scope.BLOCK
  });
  formats.push(HighlightParaClass);

  const CheckingQuestionSegmentClass = new ClassAttributor('question-segment', 'question-segment', {
    scope: Parchment.Scope.INLINE
  });
  formats.push(CheckingQuestionSegmentClass);

  const CheckingQuestionCountAttribute = new QuillParchment.Attributor.Attribute(
    'question-count',
    'data-question-count',
    {
      scope: Parchment.Scope.INLINE
    }
  );
  formats.push(CheckingQuestionCountAttribute);

  const ParaStyleDescriptionAttribute = new QuillParchment.Attributor.Attribute(
    'style-description',
    'data-style-description',
    {
      scope: Parchment.Scope.INLINE
    }
  );
  formats.push(ParaStyleDescriptionAttribute);

  const NoteThreadSegmentClass = new ClassAttributor('note-thread-segment', 'note-thread-segment', {
    scope: Parchment.Scope.INLINE
  });
  formats.push(NoteThreadSegmentClass);
  const NoteThreadHighlightClass = new ClassAttributor('note-thread-highlight', 'note-thread-highlight', {
    scope: Parchment.Scope.INLINE
  });
  formats.push(NoteThreadHighlightClass);

  const InvalidBlockClass = new ClassAttributor('invalid-block', 'invalid-block', {
    scope: Parchment.Scope.BLOCK
  });
  formats.push(InvalidBlockClass);

  const InvalidInlineClass = new ClassAttributor('invalid-inline', 'invalid-inline', {
    scope: Parchment.Scope.INLINE
  });
  formats.push(InvalidInlineClass);

  class DisableHtmlClipboard extends QuillClipboard {
    onPaste(e: ClipboardEvent): void {
      if (e.defaultPrevented || !this.quill.isEnabled() || e.clipboardData == null) {
        return;
      }
      const range = this.quill.getSelection();
      if (range == null) {
        return;
      }
      let delta = new Delta().retain(range.index);
      const scrollTop = this.quill.scrollingContainer.scrollTop;
      this.container.focus();
      this.quill.selection.update('silent');

      let text = e.clipboardData.getData('text/plain');
      // do not allow pasting new lines
      text = text.replace(/(?:\r?\n)+/, ' ');
      setTimeout(() => {
        this.container.innerHTML = text;
        delta = delta.concat(this.convert()).delete(range.length);
        this.quill.updateContents(delta, 'user');
        // range.length contributes to delta.length()
        this.quill.setSelection(delta.length() - range.length, 'silent');
        this.quill.scrollingContainer.scrollTop = scrollTop;
        this.quill.focus();
      }, 1);
    }
  }

  class FixSelectionHistory extends QuillHistory {
    /**
     * Performs undo/redo. Override this method, so that we can fix the selection logic. This method was copied from
     * the Quill history module.
     *
     * @param {string} source The source stack type.
     * @param {string} dest The destination stack type.
     */
    change(source: HistoryStackType, dest: HistoryStackType): void {
      const delta = this.stack[source].pop();
      if (delta == null) {
        return;
      }
      this.stack[dest].push(delta);
      this.lastRecorded = 0;
      this.ignoreChange = true;
      // during undo/redo, segments can be incorrectly highlighted, so explicitly remove incorrect highlighting
      this.quill.updateContents(removeObsoleteSegmentAttrs(delta[source]), 'user');
      this.ignoreChange = false;
      const index = getLastChangeIndex(delta[source]);
      this.quill.setSelection(index);
    }
  }

  /**
   * Updates delta to remove segment highlights from segments that are not explicitly highlighted
   * and strips off formatting from note thread embeds.
   */
  function removeObsoleteSegmentAttrs(delta: DeltaStatic): DeltaStatic {
    const updatedDelta = new Delta();
    if (delta.ops != null) {
      for (const op of delta.ops) {
        const modelOp: DeltaOperation = cloneDeep(op);
        const attrs = modelOp.attributes;
        if (attrs != null && attrs['segment'] != null && attrs['highlight-segment'] == null) {
          attrs['highlight-segment'] = false;
        }
        if (typeof modelOp.insert === 'object') {
          // clear the formatting attributes on embeds to prevent dom elements from being corrupted
          modelOp.attributes = undefined;
        }
        (updatedDelta as any).push(modelOp);
      }
    }
    return updatedDelta.chop();
  }

  /**
   * Checks if the delta ends with a newline insert. This function was copied from the Quill history module.
   */
  function endsWithNewlineChange(delta: DeltaStatic): boolean {
    if (delta.ops == null) {
      return false;
    }
    const lastOp = delta.ops[delta.ops.length - 1];
    if (lastOp == null) {
      return false;
    }
    if (lastOp.insert != null) {
      return typeof lastOp.insert === 'string' && lastOp.insert.endsWith('\n');
    }
    if (lastOp.attributes != null) {
      return Object.keys(lastOp.attributes).some(function (attr) {
        return Parchment.query(attr, Parchment.Scope.BLOCK) != null;
      });
    }
    return false;
  }

  /**
   * Finds the index where the last insert/delete occurs in the delta. This function has been modified from the
   * original in the Quill history module.
   *
   * @param {DeltaStatic} delta The undo/redo delta.
   * @returns {number} The index where the last insert/delete occurs.
   */
  function getLastChangeIndex(delta: DeltaStatic): number {
    if (delta.ops == null) {
      return 0;
    }
    // skip inserted embeds when determining last edit
    let changeIndex = 0;
    let curIndex = 0;
    for (const op of delta.ops) {
      if (op.insert != null) {
        if (typeof op.insert === 'string') {
          curIndex += op.insert.length;
          changeIndex = curIndex;
        } else {
          curIndex++;
        }
      } else if (op.retain != null) {
        curIndex += op.retain;
        changeIndex = curIndex;
      }
    }
    if (endsWithNewlineChange(delta)) {
      changeIndex -= 1;
    }
    return changeIndex;
  }

  const formatNames: string[] = [];
  for (const format of formats) {
    if (typeof format === 'string') {
      formatNames.push(format);
    } else if (format.blotName != null) {
      Quill.register(`blots/${format.blotName}`, format);
      formatNames.push(format.blotName);
    } else {
      Quill.register(`formats/${format.attrName}`, format);
      formatNames.push(format.attrName);
    }
  }
  Quill.register('blots/scroll', Scroll, true);
  Quill.register('blots/text', NotNormalizedText, true);
  Quill.register('modules/clipboard', DisableHtmlClipboard, true);
  Quill.register('modules/cursors', QuillCursors);
  Quill.register('modules/history', FixSelectionHistory, true);
  Quill.register('modules/dragAndDrop', DragAndDrop);

  return formatNames;
}
