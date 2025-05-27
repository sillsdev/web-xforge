import QuillScrollBlot from 'quill/blots/scroll';
import { instance, mock } from 'ts-mockito';
import {
  BlankEmbed,
  BookBlock,
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
  UnknownBlot,
  UnmatchedEmbed,
  VerseEmbed
} from './quill-blots';

describe('Quill blots', () => {
  describe('NotNormalizedText', () => {
    it('should not normalize NFD text', () => {
      const nfdText = 'e\u0301'; // é as NFD
      const textNode = document.createTextNode(nfdText);
      expect(NotNormalizedText.value(textNode)).toBe(nfdText);
    });
  });

  describe('UnknownBlot', () => {
    it('should create node with unknown format message', () => {
      const value = {
        origBlotName: 'test-format',
        data: 'test-data'
      };

      const node = UnknownBlot.create(value) as HTMLElement;

      expect(node.tagName.toLowerCase()).toBe('sf-unknown');
      expect(node.innerText).toBe(`[Unknown format: 'test-format']`);
    });
  });

  describe('BlankEmbed', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create blank node with nbsp', () => {
      const node = BlankEmbed.create(true) as HTMLElement;
      expect(node.innerText).toBe('\u00A0'.repeat(8));
    });

    it('should format with initial value', () => {
      const node = BlankEmbed.create(true) as HTMLElement;
      const blankEmbed = new BlankEmbed(mockScroll, node);

      blankEmbed.format('initial', true);

      expect(node.firstElementChild?.textContent).toBe('\u00A0'); // Non-breaking space
    });

    it('should return undefined formats when not initial', () => {
      const node = BlankEmbed.create(true) as HTMLElement;
      expect(BlankEmbed.formats(node)).toBeUndefined();
    });
  });

  describe('BookBlock', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create book block', () => {
      const value = { style: 'id', code: 'MAT' };
      const node = BookBlock.create(value);

      expect(node.getAttribute('data-style')).toBe('id');
      expect(node.getAttribute('data-code')).toBe('MAT');
    });

    it('should format existing book block', () => {
      const value = { style: 'id', code: 'MAT' };
      const node = BookBlock.create({ style: 'id', code: 'MRK' }) as HTMLElement;
      const paraBlock = new BookBlock(mockScroll, node);

      paraBlock.format('book', value);

      expect(node.getAttribute('data-style')).toBe('id');
      expect(node.getAttribute('data-code')).toBe('MAT');
    });

    it('should handle null value', () => {
      const node = BookBlock.create(null as any);
      expect(node.hasAttribute('data-style')).toBe(false);
    });

    it('should return stored value', () => {
      const value = { style: 'id', code: 'MAT' };
      const node = BookBlock.create(value);
      expect(BookBlock.value(node)).toEqual(value);
      expect(BookBlock.formats(node)).toEqual(value);
    });
  });

  describe('ChapterEmbed', () => {
    it('should create chapter node', () => {
      const value = { number: 1 };
      const node = ChapterEmbed.create(value) as HTMLElement;

      expect(node.tagName.toLowerCase()).toBe('usx-chapter');
      expect(node.querySelector('span')?.innerText).toBe('1');
      expect(node.contentEditable).toBe('false');
    });

    it('should retrieve chapter value from node', () => {
      const value = { number: 1 };
      const node = ChapterEmbed.create(value) as HTMLElement;

      const retrieved = ChapterEmbed.value(node);
      expect(retrieved).toEqual(value);
    });
  });

  describe('CharInline', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create node with single style', () => {
      const value = { style: 'bold' };
      const node = CharInline.create(value);

      expect(node.getAttribute('data-style')).toBe('bold');
    });

    it('should create node with multiple styles', () => {
      const value = [{ style: 'bold' }, { style: 'italic' }];
      const node = CharInline.create(value);

      expect(node.getAttribute('data-style')).toBe('bold italic');
    });

    it('should format existing node', () => {
      const value = { style: 'bold' };
      const node = CharInline.create({}) as HTMLElement;
      const charInline = new CharInline(mockScroll, node);

      charInline.format('char', value);

      expect(node.getAttribute('data-style')).toBe('bold');
    });

    it('should handle null value', () => {
      const node = CharInline.create(null as any);
      expect(node.hasAttribute('data-style')).toBe(false);
    });

    it('should handle empty style array', () => {
      const value = [{ style: '' }];
      const node = CharInline.create(value);
      expect(node.hasAttribute('data-style')).toBe(false);
    });

    it('should use parent format for non-char formats', () => {
      const node = CharInline.create({}) as HTMLElement;
      const charInline = new CharInline(mockScroll, node);

      charInline.format('other-format', true);

      expect(node.hasAttribute('data-style')).toBe(false);
    });

    it('should return stored value', () => {
      const value = { style: 'bold' };
      const node = CharInline.create(value);
      expect(CharInline.value(node)).toEqual(value);
      expect(CharInline.formats(node)).toEqual(value);
    });
  });

  describe('EmptyEmbed', () => {
    it('should create empty node with zero-width space', () => {
      const node = EmptyEmbed.create(true) as HTMLElement;
      expect(node.innerText).toBe('\u200b');
    });

    it('should return true for value and formats', () => {
      const node = EmptyEmbed.create(true) as HTMLElement;
      expect(EmptyEmbed.value(node)).toBe(true);
      expect(EmptyEmbed.formats(node)).toBe(true);
    });
  });

  describe('FigureEmbed', () => {
    it('should create figure with icon and title', () => {
      const value = {
        alt: 'Alt text',
        file: 'image.jpg',
        src: 'path/to/image',
        size: '100x100',
        loc: 'GEN 1:1',
        copy: '© 2024',
        ref: 'figure1'
      };
      const node = FigureEmbed.create(value) as HTMLElement;

      expect(node.innerHTML).toBe('📈'); // &#x1f4c8
      expect(node.title).toBe('Alt text|image.jpg|path/to/image|100x100|GEN 1:1|© 2024|figure1');
    });

    it('should handle partial figure data', () => {
      const value = { alt: 'Alt text' };
      const node = FigureEmbed.create(value as any) as HTMLElement;
      expect(node.title).toBe('Alt text');
    });

    it('should handle contents with multiple ops', () => {
      const value = {
        contents: {
          ops: [{ insert: 'text1' }, { insert: 'text2' }]
        }
      };
      const node = FigureEmbed.create(value as any) as HTMLElement;
      expect(node.title).toBe('text1text2');
    });

    it('should retrieve stored value', () => {
      const value = { alt: 'Alt text' };
      const node = FigureEmbed.create(value as any) as HTMLElement;
      expect(FigureEmbed.value(node)).toEqual(value as any);
    });

    it('should maintain DOM structure with empty fields', () => {
      const value = {};
      const node = FigureEmbed.create(value as any) as HTMLElement;
      expect(node.innerHTML).toBe('📈'); // &#x1f4c8
      expect(node.title).toBe('');
    });
  });

  describe('NoteEmbed', () => {
    it('should create note with caller and style', () => {
      const value = { caller: 'a', style: 'footnote' };
      const node = NoteEmbed.create(value) as HTMLElement;

      expect(node.getAttribute('data-style')).toBe('footnote');
      expect(node.getAttribute('data-caller')).toBe('a');
      expect(node.innerText).toBe('a');
    });

    it('should handle special callers', () => {
      const value = { caller: '+' };
      const node = NoteEmbed.create(value) as HTMLElement;

      expect(node.getAttribute('data-caller')).toBe('+');
      expect(node.innerText).toBe('');
    });

    it('should set title from contents', () => {
      const value = {
        caller: 'a',
        contents: { ops: [{ insert: 'note text' }] }
      };
      const node = NoteEmbed.create(value) as HTMLElement;

      expect(node.title).toBe('note text');
    });

    it('should handle null style', () => {
      const value = { caller: 'a' };
      const node = NoteEmbed.create(value) as HTMLElement;
      expect(node.hasAttribute('data-style')).toBe(false);
    });

    it('should handle multiple content ops', () => {
      const value = {
        caller: 'a',
        contents: {
          ops: [{ insert: 'text1' }, { insert: '\n' }, { insert: 'text2' }]
        }
      };
      const node = NoteEmbed.create(value) as HTMLElement;
      expect(node.title).toBe('text1\ntext2');
    });

    it('should retrieve stored note value', () => {
      const value = { caller: 'a', style: 'footnote' };
      const node = NoteEmbed.create(value) as HTMLElement;
      expect(NoteEmbed.value(node)).toEqual(value);
    });
  });

  describe('NoteThreadEmbed', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create note thread with attributes', () => {
      const value = {
        iconsrc: 'icon.png',
        preview: 'Preview text',
        threadid: 'thread1'
      };
      const node = NoteThreadEmbed.create(value) as HTMLElement;

      expect(node.getAttribute('style')).toBe('icon.png');
      expect(node.getAttribute('title')).toBe('Preview text');
      expect(node.getAttribute('data-thread-id')).toBe('thread1');
    });

    it('should handle highlight formatting', () => {
      const value = {
        iconsrc: 'icon.png',
        preview: 'Preview text',
        threadid: 'thread1',
        highlight: true
      };
      const node = NoteThreadEmbed.create(value) as HTMLElement;
      const noteThread = new NoteThreadEmbed(mockScroll, node);

      noteThread.format('note-thread-embed', value);

      expect(node.classList.contains('note-thread-highlight')).toBe(true);
    });

    it('should remove highlight class when highlight is false', () => {
      const value = {
        iconsrc: 'icon.png',
        preview: 'Preview text',
        threadid: 'thread1',
        highlight: true
      };
      const node = NoteThreadEmbed.create(value) as HTMLElement;
      const noteThread = new NoteThreadEmbed(mockScroll, node);

      noteThread.format('note-thread-embed', { ...value, highlight: false });

      expect(node.classList.contains('note-thread-highlight')).toBe(false);
    });

    it('should handle non note-thread-embed format', () => {
      const node = NoteThreadEmbed.create({
        iconsrc: 'icon.png',
        preview: 'text',
        threadid: 'thread1'
      }) as HTMLElement;
      const noteThread = new NoteThreadEmbed(mockScroll, node);

      noteThread.format('other-format', true);

      expect(node.classList.length).toBe(0);
    });

    it('should return thread attributes in value and formats', () => {
      const value = {
        iconsrc: 'icon.png',
        preview: 'Preview text',
        threadid: 'thread1'
      };
      const node = NoteThreadEmbed.create(value) as HTMLElement;
      const expected = NoteThreadEmbed.value(node);
      expect(expected).toEqual(value);
      expect(NoteThreadEmbed.formats(node)).toEqual(expected);
    });

    it('should not include highlight in value', () => {
      const value = {
        iconsrc: 'icon.png',
        preview: 'Preview text',
        threadid: 'thread1',
        highlight: true
      };
      const node = NoteThreadEmbed.create(value) as HTMLElement;
      const retrieved = NoteThreadEmbed.value(node);
      expect(retrieved.highlight).toBeUndefined();
    });
  });

  describe('OptBreakEmbed', () => {
    it('should create break node with br', () => {
      const value = { style: 'break' };
      const node = OptBreakEmbed.create(value) as HTMLElement;

      expect(node.innerHTML).toBe('<br>');
    });

    it('should store and retrieve style value', () => {
      const value = { style: 'break' };
      const node = OptBreakEmbed.create(value) as HTMLElement;
      expect(OptBreakEmbed.value(node)).toEqual(value);
    });
  });

  describe('ParaBlock', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create para block with style', () => {
      const value = { style: 'p' };
      const node = ParaBlock.create(value);

      expect(node.getAttribute('data-style')).toBe('p');
    });

    it('should format existing para block', () => {
      const value = { style: 'p' };
      const node = ParaBlock.create({}) as HTMLElement;
      const paraBlock = new ParaBlock(mockScroll, node);

      paraBlock.format('para', value);

      expect(node.getAttribute('data-style')).toBe('p');
    });

    it('should handle null value', () => {
      const node = ParaBlock.create(null as any);
      expect(node.hasAttribute('data-style')).toBe(false);
    });

    it('should return stored value', () => {
      const value = { style: 'p' };
      const node = ParaBlock.create(value);
      expect(ParaBlock.value(node)).toEqual(value);
      expect(ParaBlock.formats(node)).toEqual(value);
    });
  });

  describe('ParaInline', () => {
    let mockScroll: QuillScrollBlot;
    let mockLinkedList: any;
    let paraInline: ParaInline;
    let node: HTMLElement;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
      mockLinkedList = mock<any>();
      node = ParaInline.create(true);
      paraInline = new ParaInline(mockScroll, node);
      paraInline['children'] = instance(mockLinkedList);
    });

    it('should return true for value and formats', () => {
      expect(ParaInline.value(node)).toBe(true);
      expect(ParaInline.formats(node)).toBe(true);
    });
  });

  describe('RefInline', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create ref node with location', () => {
      const value = { loc: 'GEN 1:1' };
      const node = RefInline.create(value);

      expect(node.getAttribute('data-loc')).toBe('GEN 1:1');
    });

    it('should format ref node', () => {
      const value = { loc: 'GEN 1:1' };
      const node = RefInline.create({ loc: '' });
      const refInline = new RefInline(mockScroll, node);

      refInline.format('ref', value);

      expect(node.getAttribute('data-loc')).toBe('GEN 1:1');
    });

    it('should store and retrieve ref value', () => {
      const value = { loc: 'GEN 1:1' };
      const node = RefInline.create(value);
      expect(RefInline.value(node)).toEqual(value);
    });
  });

  describe('SegmentInline', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create segment with id', () => {
      const value = 'segment1';
      const node = SegmentInline.create(value);

      expect(node.getAttribute('data-segment')).toBe('segment1');
    });

    it('should format segment', () => {
      const node = SegmentInline.create('old-id');
      const segmentInline = new SegmentInline(mockScroll, node);

      segmentInline.format('segment', 'new-id');

      expect(node.getAttribute('data-segment')).toBe('new-id');
    });

    it('should return segment id for value and formats', () => {
      const value = 'segment1';
      const node = SegmentInline.create(value);
      expect(SegmentInline.value(node)).toBe(value);
      expect(SegmentInline.formats(node)).toBe(value);
    });
  });

  describe('TextAnchorInline', () => {
    let mockScroll: QuillScrollBlot;

    beforeEach(() => {
      mockScroll = instance(mock(QuillScrollBlot));
    });

    it('should create text anchor node', () => {
      const node = TextAnchorInline.create(null);
      expect(node.tagName.toLowerCase()).toBe('display-text-anchor');
    });

    it('should ignore formatting', () => {
      const node = TextAnchorInline.create(null);
      const textAnchor = new TextAnchorInline(mockScroll, node);
      textAnchor.format('any-format', true);
      expect(node.attributes.length).toBe(0);
    });
  });

  describe('UnmatchedEmbed', () => {
    it('should create unmatched node with marker', () => {
      const value = { marker: '\\' };
      const node = UnmatchedEmbed.create(value) as HTMLElement;

      expect(node.innerText).toBe('\\');
    });

    it('should retrieve stored value', () => {
      const value = { marker: '\\' };
      const node = UnmatchedEmbed.create(value) as HTMLElement;
      expect(UnmatchedEmbed.value(node)).toEqual(value);
    });
  });

  describe('VerseEmbed', () => {
    it('should create verse node with number', () => {
      const verseValue = { number: '1' };
      const node = VerseEmbed.create(verseValue) as HTMLElement;
      const verseSpan = node.querySelector('span span') as HTMLElement | null;

      expect(node.tagName.toLowerCase()).toBe('usx-verse');
      expect(verseSpan?.innerText).toBe('1');
      expect(node.querySelector('wbr')).toBeTruthy();
    });

    it('should create verse node with altnumber', () => {
      const verseValue = { number: '1', altnumber: '2' };
      const node = VerseEmbed.create(verseValue) as HTMLElement;

      const altSpan = node.querySelector('[data-style="va"]') as HTMLElement | null;
      expect(altSpan?.innerText).toBe('2');
    });

    it('should retrieve verse value from node', () => {
      const verseValue = { number: '1' };
      const node = VerseEmbed.create(verseValue) as HTMLElement;

      const value = VerseEmbed.value(node);
      expect(value).toEqual(verseValue);
    });
  });
});
