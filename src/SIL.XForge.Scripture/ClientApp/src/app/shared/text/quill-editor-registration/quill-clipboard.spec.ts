import Quill, { Delta, Range } from 'quill';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { TextComponent } from '../text.component';
import { DisableHtmlClipboard } from './quill-clipboard';

describe('DisableHtmlClipboard', () => {
  let quill: Quill;
  let quillMock: Quill;
  let textComponentMock: TextComponent;
  let clipboard: DisableHtmlClipboard;
  let mockRange: Range;
  let mockFormat: { segment: string; bold: boolean };

  beforeEach(() => {
    quillMock = mock<Quill>();
    textComponentMock = mock(TextComponent);

    when(quillMock.root).thenReturn(document.createElement('div'));
    when(quillMock.scroll).thenReturn({ domNode: document.createElement('div') } as any);

    quill = instance(quillMock);
    clipboard = new DisableHtmlClipboard(quill, { textComponent: instance(textComponentMock) });

    mockRange = { index: 5, length: 0 };
    mockFormat = { segment: 'verse_1_1', bold: true };
  });

  describe('onCapturePaste', () => {
    const createPasteEvent = (text: string = '', isPrevented = false): ClipboardEvent => {
      const event = new ClipboardEvent('paste');
      if (text) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
      }
      if (isPrevented) {
        Object.defineProperty(event, 'defaultPrevented', { value: true });
      }
      return event;
    };

    beforeEach(() => {
      when(quillMock.isEnabled()).thenReturn(true);
      when(quillMock.getSelection(true)).thenReturn(mockRange);
      when(quillMock.getFormat(mockRange.index)).thenReturn(mockFormat);
      when(quillMock.getFormat(mockRange.index, 1)).thenReturn(mockFormat);
      when(textComponentMock.isValidSelectionForCurrentSegment(mockRange)).thenReturn(true);
    });

    afterEach(() => {
      expect(true).toBe(true); // Prevent SPEC HAS NO EXPECTATIONS warning
    });

    it('should replace multiple newlines with single space (testing regex)', () => {
      const testCases = [
        {
          input: 'first\n\nsecond',
          expected: 'first second'
        },
        {
          input: 'first\r\n\r\nsecond',
          expected: 'first second'
        },
        {
          input: 'first\r\n\nsecond\n\r\nthird',
          expected: 'first second third'
        },
        {
          input: '\n\nstart\nmiddle\n\nend\n\n',
          expected: ' start middle end '
        }
      ];

      for (const testCase of testCases) {
        // Override convert to capture the cleaned text passed for conversion
        let capturedText = '';
        clipboard.convert = (arg: { text: string }) => {
          capturedText = arg.text;
          return new Delta().insert(arg.text);
        };

        const event = createPasteEvent(testCase.input);
        clipboard.onCapturePaste(event);

        expect(capturedText).toBe(testCase.expected);

        // Also verify that updateContents was called correctly
        verify(
          quillMock.updateContents(
            deepEqual(
              new Delta().retain(mockRange.index).insert(testCase.expected, mockFormat).delete(mockRange.length)
            ),
            'user'
          )
        ).once();

        resetCalls(quillMock);
      }
    });

    it('should handle mixed newlines and backslashes', () => {
      const inputText = 'line1\\\r\n\\line2\n\\\nline3\\';
      const expected = 'line1 line2 line3';

      // Override convert to capture the cleaned text passed for conversion
      let capturedText = '';
      clipboard.convert = (arg: { text: string }) => {
        capturedText = arg.text;
        return new Delta().insert(arg.text);
      };

      const event = createPasteEvent(inputText);
      clipboard.onCapturePaste(event);

      expect(capturedText).toBe(expected);

      verify(
        quillMock.updateContents(
          deepEqual(new Delta().retain(mockRange.index).insert(expected, mockFormat).delete(mockRange.length)),
          'user'
        )
      ).once();
    });

    interface InvalidCase {
      name: string;
      setup: () => ClipboardEvent;
    }

    const invalidCases: InvalidCase[] = [
      {
        name: 'prevented event',
        setup: () => createPasteEvent('', true)
      },
      {
        name: 'disabled editor',
        setup: () => {
          when(quillMock.isEnabled()).thenReturn(false);
          return createPasteEvent();
        }
      },
      {
        name: 'null selection',
        setup: () => {
          when(quillMock.getSelection(true)).thenReturn(null as any);
          return createPasteEvent();
        }
      },
      {
        name: 'invalid selection',
        setup: () => {
          when(textComponentMock.isValidSelectionForCurrentSegment(mockRange)).thenReturn(false);
          return createPasteEvent();
        }
      }
    ];

    invalidCases.forEach(({ name, setup }) => {
      it(`should return early for ${name}`, () => {
        clipboard.onCapturePaste(setup());
        verify(quillMock.updateContents(anything(), anything())).never();
      });
    });
  });
});
