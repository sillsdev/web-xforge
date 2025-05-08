import { TestBed } from '@angular/core/testing';
import Quill, { Delta, Range } from 'quill';
import { instance, mock, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextViewModel } from './text-view-model';

describe('TextViewModel', () => {
  const mockQuill = mock<Quill>();
  let testDelta: Delta;

  configureTestingModule(() => ({
    providers: [TextViewModel, { provide: Quill, useMock: mockQuill }]
  }));

  describe('dataRangeToEditorRange', () => {
    it('should return same range when there are no note embeds', () => {
      const env = new TestEnvironment();
      env.setupBasicContent();

      const dataRange: Range = { index: 1, length: 4 };
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      expect(result).toEqual(dataRange);
    });

    it('should adjust range when note embeds exist before the range', () => {
      const env = new TestEnvironment();
      env.setupContentWithEmbedBefore();

      const dataRange: Range = { index: 5, length: 6 }; // ' world'
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Index should be increased by 1 to account for note embed
      expect(result).toEqual({ index: 6, length: 6 });
    });

    it('should handle note embeds within the range', () => {
      const env = new TestEnvironment();
      env.setupContentWithEmbedInMiddle();

      const dataRange: Range = { index: 0, length: 11 }; // 'Hello world'
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Length should be increased by 1 to account for note embed
      expect(result).toEqual({ index: 0, length: 12 });
    });

    it('should handle multiple note embeds', () => {
      const env = new TestEnvironment();
      env.setupContentWithMultipleEmbeds();

      const dataRange: Range = { index: 0, length: 11 }; // 'Hello world'
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Length should be increased by 2 to account for both note embeds
      expect(result).toEqual({ index: 0, length: 13 });
    });

    it('should handle a zero-length range before embed', () => {
      const env = new TestEnvironment();
      env.setupContentWithEmbedInMiddle();

      const dataRange: Range = { index: 4, length: 0 }; // Start of 'o' in 'Hello'
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Index should remain the same since embed is after this position
      expect(result).toEqual({ index: 4, length: 0 });
    });

    it('should handle a zero-length range after an embed', () => {
      const env = new TestEnvironment();
      env.setupContentWithEmbedBefore();

      const dataRange: Range = { index: 5, length: 0 }; // Start of ' world'
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Index should be increased by 1 because of embed
      expect(result).toEqual({ index: 6, length: 0 });
    });

    it('should handle range at the end of document', () => {
      const env = new TestEnvironment();
      env.setupContentWithEmbedBefore();

      const dataRange: Range = { index: 11, length: 0 }; // End of text
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Index should be 12 due to the embed
      expect(result).toEqual({ index: 12, length: 0 });
    });

    it('should handle non-string inserts (other embeds)', () => {
      const env = new TestEnvironment();
      env.setupContentWithOtherEmbed();

      const dataRange: Range = { index: 0, length: 12 }; // 'Hello {image} world'
      const result: Range = env.textViewModel.dataRangeToEditorRange(dataRange);

      // Length should be increased by 1 to account for note embed
      expect(result).toEqual({ index: 0, length: 13 });
    });
  });

  class TestEnvironment {
    readonly textViewModel: TextViewModel;

    constructor() {
      this.textViewModel = TestBed.inject(TextViewModel);
      this.textViewModel.editor = instance(mockQuill);
    }

    setupBasicContent(): void {
      testDelta = new Delta([{ insert: 'Hello world' }]);
      when(mockQuill.getContents()).thenReturn(testDelta);
    }

    setupContentWithEmbedBefore(): void {
      testDelta = new Delta([{ insert: { 'note-thread-embed': true } }, { insert: 'Hello' }, { insert: ' world' }]);
      when(mockQuill.getContents()).thenReturn(testDelta);
    }

    setupContentWithEmbedInMiddle(): void {
      testDelta = new Delta([{ insert: 'Hello ' }, { insert: { 'note-thread-embed': true } }, { insert: 'world' }]);
      when(mockQuill.getContents()).thenReturn(testDelta);
    }

    setupContentWithMultipleEmbeds(): void {
      testDelta = new Delta([
        { insert: 'Hello' },
        { insert: { 'note-thread-embed': true } },
        { insert: ' w' },
        { insert: { 'note-thread-embed': true } },
        { insert: 'orld' }
      ]);
      when(mockQuill.getContents()).thenReturn(testDelta);
    }

    setupContentWithOtherEmbed(): void {
      testDelta = new Delta([
        { insert: 'Hello ' },
        { insert: { image: 'url' } },
        { insert: { 'note-thread-embed': true } },
        { insert: ' world' }
      ]);
      when(mockQuill.getContents()).thenReturn(testDelta);
    }
  }
});
