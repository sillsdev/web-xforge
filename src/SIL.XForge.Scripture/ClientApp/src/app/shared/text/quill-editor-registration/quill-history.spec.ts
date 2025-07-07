import { Scope } from 'parchment';
import Quill, { Delta } from 'quill';
import Scroll from 'quill/blots/scroll';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { FixSelectionHistory, getLastChangeIndex, removeObsoleteSegmentAttrs } from './quill-history';

describe('Quill history', () => {
  const createMockScroll = (): Scroll => {
    const scrollMock = mock<Scroll>();
    when(scrollMock.registry).thenReturn({
      query: (name: string, scope?: Scope) =>
        ['align', 'list'].includes(name) && scope === Scope.BLOCK ? { scope: Scope.BLOCK } : null
    } as any);
    return instance(scrollMock);
  };

  describe('getLastChangeIndex', () => {
    interface TestCase {
      name: string;
      delta: Delta;
      expected: number;
      setup?: (delta: Delta) => void;
    }

    const testCases: TestCase[] = [
      {
        name: 'null delta ops',
        delta: new Delta(),
        expected: 0,
        setup: delta => (delta.ops = null as any)
      },
      {
        name: 'single insert',
        delta: new Delta().insert('hello'),
        expected: 5
      },
      {
        name: 'retain followed by insert',
        delta: new Delta().retain(3).insert('test'),
        expected: 7
      },
      {
        name: 'single embed insert',
        delta: new Delta().insert({ image: 'test.jpg' }),
        expected: 0
      },
      {
        name: 'text followed by embed',
        delta: new Delta().insert('hello').insert({ image: 'test.jpg' }),
        expected: 5
      },
      {
        name: 'embed followed by text',
        delta: new Delta().insert({ image: 'test.jpg' }).insert('hello'),
        expected: 6
      },
      {
        name: 'mixed text and embeds with trailing text',
        delta: new Delta().insert({ image: 'test1.jpg' }).insert('text').insert({ image: 'test.jpg' }).insert('more'),
        expected: 10
      },
      {
        name: 'mixed text and embeds with trailing embed',
        delta: new Delta().insert({ image: 'test1.jpg' }).insert('text').insert({ image: 'test.jpg' }),
        expected: 5
      },
      {
        name: 'retain followed by embed',
        delta: new Delta().retain(3).insert({ image: 'test.jpg' }),
        expected: 3
      }
    ];

    const mockScroll = createMockScroll();
    testCases.forEach(({ name, delta, expected, setup }) => {
      it(`should handle ${name}`, () => {
        if (setup) setup(delta);
        expect(getLastChangeIndex(mockScroll, delta)).toBe(expected);
      });
    });
  });

  describe('removeObsoleteSegmentAttrs', () => {
    interface TestCase {
      name: string;
      input: Delta;
      expectedAttrs: Record<string, any>;
    }

    const testCases: TestCase[] = [
      {
        name: 'commenter selection removal',
        input: new Delta().insert('text', {
          segment: 'verse_1_1',
          'highlight-segment': true,
          'commenter-selection': true
        }),
        expectedAttrs: {
          segment: 'verse_1_1',
          'highlight-segment': true,
          'commenter-selection': null
        }
      },
      {
        name: 'default highlight segment',
        input: new Delta().insert('text', {
          segment: 'verse_1_1',
          'commenter-selection': true
        }),
        expectedAttrs: {
          segment: 'verse_1_1',
          'highlight-segment': false,
          'commenter-selection': null
        }
      },
      {
        name: 'no segment attribute',
        input: new Delta().insert('text', {
          'commenter-selection': true
        }),
        expectedAttrs: {
          'commenter-selection': true
        }
      }
    ];

    testCases.forEach(({ name, input, expectedAttrs }) => {
      it(`should handle ${name}`, () => {
        const result = removeObsoleteSegmentAttrs(input);
        expect(result.ops[0].attributes).toEqual(expectedAttrs);
      });
    });
  });

  describe('FixSelectionHistory', () => {
    let quillMock: Quill;
    let history: FixSelectionHistory;

    beforeEach(() => {
      quillMock = mock<Quill>();

      const root = document.createElement('div');
      root.addEventListener = () => {};
      when(quillMock.root).thenReturn(root);
      when(quillMock.keyboard).thenReturn({ addBinding: () => {} } as any);
      when(quillMock.getContents()).thenReturn(new Delta());
      when(quillMock.updateContents(anything(), anything())).thenReturn();

      history = new FixSelectionHistory(instance(quillMock), {});
      history.stack = { undo: [], redo: [] };
    });

    afterEach(() => {
      expect(true).toBe(true); // Prevent SPEC HAS NO EXPECTATIONS warning
    });

    it('should clean up highlighting during undo', () => {
      const delta = new Delta().insert('text', { segment: 'verse_1_1' });
      history.stack.undo = [{ delta, range: { index: 0, length: 4 } }];

      history.change('undo', 'redo');

      verify(quillMock.updateContents(deepEqual(removeObsoleteSegmentAttrs(delta)), Quill.sources.USER)).once();
    });
  });
});
