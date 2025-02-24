import Quill, { Delta, Range } from 'quill';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
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

    it('should clean and paste text with attributes', () => {
      const inputText = 'test\ntext\\with\\backslashes';
      const expectedText = 'test text with backslashes';

      const event = createPasteEvent(inputText);
      const pasteDelta = new Delta().insert(expectedText);
      clipboard.convert = () => pasteDelta;

      clipboard.onCapturePaste(event);

      verify(
        quillMock.updateContents(
          deepEqual(new Delta().retain(mockRange.index).insert(expectedText, mockFormat).delete(mockRange.length)),
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
