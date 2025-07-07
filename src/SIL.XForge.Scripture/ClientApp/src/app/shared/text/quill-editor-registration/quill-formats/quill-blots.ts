import { omit } from 'lodash-es';
import { Blot, Scope } from 'parchment';
import QuillBlockBlot, { BlockEmbed as QuillBlockEmbedBlot } from 'quill/blots/block';
import QuillEmbedBlot from 'quill/blots/embed';
import QuillInlineBlot from 'quill/blots/inline';
import QuillScrollBlot from 'quill/blots/scroll';
import QuillTextBlot from 'quill/blots/text';
import { isString } from '../../../../../type-utils';
import {
  Book,
  Chapter,
  Figure,
  Note,
  NoteThread,
  Para,
  Ref,
  Unmatched,
  UsxStyle,
  Verse
} from './quill-blot-value-types';

/** Zero-width space */
const ZWSP = '\u200b';

/** Non-breaking space */
const NBSP = '\u00A0';

const USX_VALUE = '__usx_value';

function getUsxValue<T>(node: HTMLElement): T {
  return node[USX_VALUE];
}

/** Record textdoc data that was used to make this node, to help later write back to the textdoc. */
function setUsxValue(node: HTMLElement, value: any): void {
  node[USX_VALUE] = value;
}

function customAttributeName(key: string): string {
  return 'data-' + key;
}

/**
 * This class overrides the "value" method so that it does not normalize text to NFC. This avoids a bug where Quill
 * does not properly handle NFD data (https://github.com/quilljs/quill/issues/1976).
 */
export class NotNormalizedText extends QuillTextBlot {
  static value(domNode: Text): string {
    return domNode.data;
  }
}

/**
 * This class overrides the Quill `ScrollBlot` 'create' method so that it can handle unknown blot types.
 * If an unregistered blot type is encountered, it will be rendered as the 'unknown' blot type.
 */
export class ScrollBlot extends QuillScrollBlot {
  create(input: Node | string | Scope, value?: any): Blot {
    // Try to create the blot.  If blot type not registered, fallback to the custom 'unknown' blot
    try {
      return super.create(input, value);
    } catch (e) {
      // Create 'unknown' blot for string input only
      if (!isString(input)) {
        throw e;
      }

      console.error(`Unable to create blot: '${input}'.`);

      // Pass name of attempted blot
      value[UnknownBlot.origBlotNameProp] = input;

      return super.create('unknown', value);
    }
  }
}

/**
 * Fallback blot for when Quill encounters a blot type that is not registered.
 */
export class UnknownBlot extends QuillEmbedBlot {
  static blotName = 'unknown';
  static tagName = 'sf-unknown';
  static origBlotNameProp = 'origBlotName';

  static create(value: any): Node {
    const node = super.create(value) as HTMLElement;
    setUsxValue(node, omit(value, UnknownBlot.origBlotNameProp));
    node.innerText = `[Unknown format: '${value[UnknownBlot.origBlotNameProp] || 'unknown'}']`;
    return node;
  }

  static value(node: HTMLElement): any {
    return getUsxValue(node);
  }
}

export class VerseEmbed extends QuillEmbedBlot {
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

export class BlankEmbed extends QuillEmbedBlot {
  static blotName = 'blank';
  static tagName = 'usx-blank';

  static create(value: boolean): Node {
    const node = super.create(value) as HTMLElement;
    setUsxValue(node, value);
    node.innerText = NBSP.repeat(8);
    return node;
  }

  static value(node: HTMLElement): boolean {
    return getUsxValue(node);
  }

  value(): any {
    // The base implementation will always return true, so we override it to allow { blank: false }
    return {
      [this.statics.blotName]: this.statics.value(this.domNode)
    };
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

export class EmptyEmbed extends QuillEmbedBlot {
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

/** Span of characters or elements, that can have formatting. */
export class CharInline extends QuillInlineBlot {
  static blotName = 'char';
  static tagName = 'usx-char';

  static create(value: UsxStyle | UsxStyle[]): HTMLElement {
    const node = super.create(value);
    if (value == null) {
      return node;
    }

    let characterStyles: string = '';
    if (Array.isArray(value)) {
      // Transform an array of styles to a space-delimited list
      characterStyles = value.map((styleItem: UsxStyle) => styleItem.style).join(' ');
      if (characterStyles.trim() === '') {
        return node;
      }
    } else {
      if (value.style == null) {
        return node;
      }
      characterStyles = value.style;
    }

    node.setAttribute(customAttributeName('style'), characterStyles);
    setUsxValue(node, value);

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

export class RefInline extends QuillInlineBlot {
  static blotName = 'ref';
  static tagName = 'usx-ref';

  static create(value: Ref): HTMLElement {
    const node = super.create(value);
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

export class NoteEmbed extends QuillEmbedBlot {
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

export class NoteThreadEmbed extends QuillEmbedBlot {
  static blotName = 'note-thread-embed';
  static tagName = 'display-note';

  static create(value: NoteThread): HTMLElement {
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

export class OptBreakEmbed extends QuillEmbedBlot {
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

export class FigureEmbed extends QuillEmbedBlot {
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

export class UnmatchedEmbed extends QuillEmbedBlot {
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

export class ParaBlock extends QuillBlockBlot {
  static blotName = 'para';
  static tagName = 'usx-para';

  static create(value: Para): HTMLElement {
    const node = super.create(value);
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

export class ParaInline extends QuillInlineBlot {
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
        const blot = new VerseEmbed(this.scroll as QuillScrollBlot, node);
        this.insertBefore(blot, after);
        return;
      }
    }
    super.insertAt(index, value, def);
  }
}

export class SegmentInline extends QuillInlineBlot {
  static blotName = 'segment';
  static tagName = 'usx-segment';

  static create(value: string): HTMLElement {
    const node = super.create(value);
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

export class TextAnchorInline extends QuillInlineBlot {
  static blotName = 'text-anchor';
  static tagName = 'display-text-anchor';
}

export class ChapterEmbed extends QuillBlockEmbedBlot {
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

export class BookBlock extends QuillBlockBlot {
  static blotName = 'book';
  static tagName = 'usx-book';

  static create(value: Book): HTMLElement {
    const node = super.create(value);
    if (value != null && value.style != null) {
      node.setAttribute(customAttributeName('style'), value.style);
      node.setAttribute(customAttributeName('code'), value.code);
      setUsxValue(node, value);
    }
    return node;
  }

  static formats(node: HTMLElement): Book {
    return BookBlock.value(node);
  }

  static value(node: HTMLElement): Book {
    return getUsxValue(node);
  }

  format(name: string, value: any): void {
    const book = value as Book;
    if (name === BookBlock.blotName && value != null && book.style != null) {
      const elem = this.domNode as HTMLElement;
      elem.setAttribute(customAttributeName('style'), book.style);
      elem.setAttribute(customAttributeName('code'), book.code);
      setUsxValue(elem, book);
    } else {
      super.format(name, value);
    }
  }
}
