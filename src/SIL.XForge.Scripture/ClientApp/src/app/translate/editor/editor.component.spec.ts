import { MdcSlider } from '@angular-mdc/web';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Params } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import {
  createRange,
  InteractiveTranslationSession,
  ProgressStatus,
  RemoteTranslationEngine,
  TranslationResult,
  TranslationResultBuilder,
  WordAlignmentMatrix
} from '@sillsdev/machine';
import * as OTJson0 from 'ot-json0';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { SFProjectUserConfig } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import * as RichText from 'rich-text';
import { BehaviorSubject, defer, Subject } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { TextDocId } from '../../core/models/text-doc-id';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { CONFIDENCE_THRESHOLD_TIMEOUT, EditorComponent, UPDATE_SUGGESTIONS_TIMEOUT } from './editor.component';
import { SuggestionComponent } from './suggestion.component';

describe('EditorComponent', () => {
  describe('Translation Suggestions enabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.textName).toBe('Book 1');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toBe('Source');
      expect(env.component.targetLabel).toBe('Target');
      expect(env.component.target.segmentRef).toBe('');
      const selection = env.component.target.editor.getSelection();
      expect(selection).toBeNull();
      env.dispose();
    }));

    it('start with previously selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 2, selectedSegment: 'verse_2_1' });
      env.wait();
      expect(env.component.textName).toBe('Book 1');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target.segmentRef).toBe('verse_2_1');
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(29);
      expect(selection.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);
      env.dispose();
    }));

    it('source retrieved after target', fakeAsync(() => {
      const env = new TestEnvironment();
      const sourceId = new TextDocId('project01', 'text01', 1, 'source');
      let resolve: (value?: TextDoc) => void;
      when(env.mockedSFProjectService.getText(deepEqual(sourceId))).thenReturn(new Promise(r => (resolve = r)));
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_2' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);

      resolve(env.createTextDoc(sourceId));
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(true);

      env.dispose();
    }));

    it('select non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);

      resetCalls(env.mockedRemoteTranslationEngine);
      const range = env.component.target.getSegmentRange('verse_1_3');
      env.component.target.editor.setSelection(range.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_3');
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(32);
      expect(selection.length).toBe(0);
      expect(env.projectUserConfigDoc.data.selectedSegment).toBe('verse_1_3');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);

      env.dispose();
    }));

    it('select blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');

      resetCalls(env.mockedRemoteTranslationEngine);
      const range = env.component.target.getSegmentRange('verse_1_2');
      env.component.target.editor.setSelection(range.index + 1, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_2');
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(30);
      expect(selection.length).toBe(0);
      expect(env.projectUserConfigDoc.data.selectedSegment).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(true);
      expect(env.component.suggestionWords).toEqual(['target']);

      env.dispose();
    }));

    it('selection not at end of incomplete segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.target.segmentRef).toBe('');

      const range = env.component.target.getSegmentRange('verse_1_5');
      env.component.target.editor.setSelection(range.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);

      env.dispose();
    }));

    it('selection at end of incomplete segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.target.segmentRef).toBe('');

      const range = env.component.target.getSegmentRange('verse_1_5');
      env.component.target.editor.setSelection(range.index + range.length, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(true);
      expect(env.component.suggestionWords).toEqual(['verse', '5']);

      env.dispose();
    }));

    it('insert suggestion in non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion();
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestion).toBe(false);

      env.dispose();
    }));

    it('insert space when typing character after inserting a suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestion).toBe(true);

      const selectionIndex = env.typeCharacters('5');
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestion).toBe(false);
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(selectionIndex + 1);
      expect(selection.length).toBe(0);

      env.dispose();
    }));

    it('insert space when inserting a suggestion after inserting a previous suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestion).toBe(true);

      let selection = env.component.target.editor.getSelection();
      const selectionIndex = selection.index;
      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toEqual('target: chapter 1, verse 5');
      expect(env.component.showSuggestion).toBe(false);
      selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(selectionIndex + 2);
      expect(selection.length).toBe(0);

      env.dispose();
    }));

    it('do not insert space when typing punctuation after inserting a suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestion).toBe(true);

      const selectionIndex = env.typeCharacters('.');
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse.');
      expect(env.component.showSuggestion).toBe(false);
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(selectionIndex);
      expect(selection.length).toBe(0);

      env.dispose();
    }));

    it('train a modified segment after selecting a different segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion();
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');

      const range = env.component.target.getSegmentRange('verse_1_1');
      env.component.target.editor.setSelection(range.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.lastApprovedPrefix).toEqual(['target', ':', 'chapter', '1', ',', 'verse', '5']);

      env.dispose();
    }));

    it('do not train an unmodified segment after selecting a different segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion();
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');

      const selection = env.component.target.editor.getSelection();
      env.component.target.editor.deleteText(selection.index - 7, 7, 'user');
      env.wait();
      expect(env.component.target.segmentText).toBe('target: chapter 1, ');

      const range = env.component.target.getSegmentRange('verse_1_1');
      env.component.target.editor.setSelection(range.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.lastApprovedPrefix).toEqual([]);

      env.dispose();
    }));

    it('change texts', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.textName).toBe('Book 1');
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateParams({ projectId: 'project01', bookId: 'text02' });
      env.wait();
      expect(env.component.textName).toBe('Book 2');
      expect(env.component.target.segmentRef).toBe('');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateParams({ projectId: 'project01', bookId: 'text01' });
      env.wait();
      expect(env.component.textName).toBe('Book 1');
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      env.dispose();
    }));

    it('change chapters', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.chapter).toBe(1);
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.component.chapter = 2;
      env.wait();
      const verseText = env.component.target.getSegmentText('verse_2_1');
      expect(verseText).toBe('target: chapter 2, verse 1.');
      expect(env.component.target.segmentRef).toEqual('');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.component.chapter = 1;
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      env.dispose();
    }));

    it('selected segment checksum unset on server', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedBookId: 'text01',
        selectedChapter: 1,
        selectedSegment: 'verse_1_1',
        selectedSegmentChecksum: 0
      });
      env.wait();
      expect(env.component.chapter).toBe(1);
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.component.target.segment.initialChecksum).toBe(0);

      env.projectUserConfigDoc.submitJson0Op(op => op.unset(puc => puc.selectedSegmentChecksum), false);
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.component.target.segment.initialChecksum).not.toBe(0);

      env.dispose();
    }));

    it('update confidence threshold', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedBookId: 'text01',
        selectedChapter: 1,
        selectedSegment: 'verse_1_2',
        confidenceThreshold: 0.5
      });
      env.wait();
      expect(env.component.confidenceThreshold).toBe(50);
      expect(env.component.showSuggestion).toBe(true);
      tick(10000);

      env.clickSuggestionsMenuButton();
      env.updateConfidenceThresholdSlider(60);
      expect(env.component.confidenceThreshold).toBe(60);
      expect(env.component.showSuggestion).toBe(false);

      env.updateConfidenceThresholdSlider(40);
      expect(env.component.confidenceThreshold).toBe(40);
      expect(env.component.showSuggestion).toBe(true);

      env.dispose();
    }));

    it('training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.component.showTrainingProgress).toBe(false);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).toBeDefined();
      env.updateTrainingProgress(1);
      expect(env.trainingCompleteIcon).toBeDefined();
      expect(env.trainingProgressSpinner).toBeNull();
      env.completeTrainingProgress();
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      tick(5000);
      env.wait();
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.trainingProgress).toBeNull();
      expect(env.component.showTrainingProgress).toBe(false);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).toBeDefined();

      env.dispose();
    }));

    it('close training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text01', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.component.showTrainingProgress).toBe(false);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).toBeDefined();
      env.clickTrainingProgressCloseButton();
      expect(env.trainingProgress).toBeNull();
      expect(env.component.showTrainingProgress).toBe(false);
      env.updateTrainingProgress(1);
      env.completeTrainingProgress();
      env.wait();
      verify(env.mockedNoticeService.show(anything())).once();
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).toBeDefined();

      env.dispose();
    }));

    it('no source', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookId: 'text03', selectedChapter: 1, selectedSegment: 'verse_1_1' });
      env.updateParams({ projectId: 'project01', bookId: 'text03' });
      env.wait();
      expect(env.component.textName).toBe('Book 3');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toBe('Source');
      expect(env.component.targetLabel).toBe('Target');
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(29);
      expect(selection.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);
      expect(env.isSourceAreaHidden).toEqual(true);
      env.dispose();
    }));
  });

  describe('Translation Suggestions disabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject(false);
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'text03' });
      env.wait();
      expect(env.component.textName).toBe('Book 3');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toBe('Source');
      expect(env.component.targetLabel).toBe('Target');
      expect(env.component.target.segmentRef).toBe('');
      const selection = env.component.target.editor.getSelection();
      expect(selection).toBeNull();
      expect(env.isSourceAreaHidden).toEqual(true);
      env.dispose();
    }));

    it('start with previously selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject(false);
      env.setProjectUserConfig({ selectedBookId: 'text03', selectedChapter: 2, selectedSegment: 'verse_2_1' });
      env.updateParams({ projectId: 'project01', bookId: 'text03' });
      env.wait();
      expect(env.component.textName).toBe('Book 3');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target.segmentRef).toBe('verse_2_1');
      const selection = env.component.target.editor.getSelection();
      expect(selection.index).toBe(29);
      expect(selection.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);
      expect(env.isSourceAreaHidden).toEqual(true);
      env.dispose();
    }));
  });
});

class MockInteractiveTranslationSession implements InteractiveTranslationSession {
  prefix: string[] = [];
  isLastWordComplete: boolean = true;
  currentResults: TranslationResult[] = [];

  constructor(public readonly sourceSegment: string[], private readonly approved: (prefix: string[]) => void) {
    this.updateCurrentResults();
  }

  setPrefix(prefix: string[], isLastWordComplete: boolean): TranslationResult[] {
    this.prefix.length = 0;
    this.prefix.push(...prefix);
    this.isLastWordComplete = isLastWordComplete;
    this.updateCurrentResults();
    return this.currentResults;
  }

  appendToPrefix(addition: string, isLastWordComplete: boolean): TranslationResult[] {
    if (this.isLastWordComplete) {
      this.prefix.push(addition);
    } else {
      this.prefix[this.prefix.length - 1] = this.prefix[this.prefix.length - 1] + addition;
    }
    this.isLastWordComplete = isLastWordComplete;
    this.updateCurrentResults();
    return this.currentResults;
  }

  appendWordsToPrefix(words: string[]): TranslationResult[] {
    for (const word of words) {
      if (this.isLastWordComplete) {
        this.prefix.push(word);
      } else {
        this.prefix[this.prefix.length - 1] = word;
      }
      this.isLastWordComplete = true;
    }
    this.updateCurrentResults();
    return this.currentResults;
  }

  approve(): Promise<void> {
    this.approved(this.prefix);
    return Promise.resolve();
  }

  private updateCurrentResults(): void {
    const builder = new TranslationResultBuilder();
    for (let i = 0; i < this.sourceSegment.length; i++) {
      let targetWord = this.sourceSegment[i];
      if (targetWord === 'source') {
        targetWord = 'target';
      }
      builder.appendWord(targetWord, 0.5);
      const alignment = new WordAlignmentMatrix(1, 1);
      alignment.set(0, 0, true);
      builder.markPhrase(createRange(i, i + 1), alignment);
    }
    this.currentResults = [builder.toResult(this.sourceSegment, this.prefix.length)];
  }
}

class TestEnvironment {
  readonly component: EditorComponent;
  readonly fixture: ComponentFixture<EditorComponent>;

  readonly mockedSFProjectService = mock(SFProjectService);
  readonly mockedUserService = mock(UserService);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  lastApprovedPrefix: string[] = [];
  projectUserConfigDoc: SFProjectUserConfigDoc;

  private readonly params$: BehaviorSubject<Params>;
  private trainingProgress$ = new Subject<ProgressStatus>();

  constructor() {
    this.params$ = new BehaviorSubject<Params>({ projectId: 'project01', bookId: 'text01' });
    this.addTextDoc(new TextDocId('project01', 'text01', 1, 'source'));
    this.addTextDoc(new TextDocId('project01', 'text01', 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 'text01', 2, 'source'));
    this.addTextDoc(new TextDocId('project01', 'text01', 2, 'target'));
    this.addTextDoc(new TextDocId('project01', 'text02', 1, 'source'));
    this.addTextDoc(new TextDocId('project01', 'text02', 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 'text03', 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 'text03', 2, 'target'));

    when(this.mockedActivatedRoute.params).thenReturn(this.params$);
    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedSFProjectService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    this.setupProject();
    when(this.mockedRemoteTranslationEngine.translateInteractively(1, anything())).thenCall(
      (_n: number, segment: string[]) =>
        Promise.resolve(new MockInteractiveTranslationSession(segment, prefix => (this.lastApprovedPrefix = prefix)))
    );
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));
    when(this.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();

    TestBed.configureTestingModule({
      declarations: [EditorComponent, SuggestionComponent],
      imports: [NoopAnimationsModule, RouterTestingModule, SharedModule, UICommonModule],
      providers: [
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) }
      ]
    });
    this.fixture = TestBed.createComponent(EditorComponent);
    this.component = this.fixture.componentInstance;
  }

  get suggestion(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-suggestion'));
  }

  get confidenceThresholdSlider(): DebugElement {
    return this.fixture.debugElement.query(By.css('#confidence-threshold-slider'));
  }

  get trainingProgress(): DebugElement {
    return this.fixture.debugElement.query(By.css('.training-progress'));
  }

  get trainingProgressSpinner(): DebugElement {
    return this.trainingProgress.query(By.css('#training-progress-spinner'));
  }

  get trainingCompleteIcon(): DebugElement {
    return this.trainingProgress.query(By.css('#training-complete-icon'));
  }

  get trainingProgressCloseButton(): DebugElement {
    return this.trainingProgress.query(By.css('#training-close-button'));
  }

  get sourceTextArea(): DebugElement {
    return this.fixture.debugElement.query(By.css('#source-text-area'));
  }

  get isSourceAreaHidden(): boolean {
    return this.sourceTextArea.nativeElement.style.display === 'none';
  }

  setupProject(translationSuggestionsEnabled: boolean = true): void {
    const project: SFProject = {
      userRoles: { user01: SFProjectRole.ParatextTranslator },
      inputSystem: { languageName: 'Target' },
      translationSuggestionsEnabled,
      sourceInputSystem: { languageName: 'Source' },
      texts: [
        { bookId: 'text01', name: 'Book 1', chapters: [{ number: 1 }, { number: 2 }], hasSource: true },
        { bookId: 'text02', name: 'Book 2', chapters: [{ number: 1 }], hasSource: true },
        { bookId: 'text03', name: 'Book 3', chapters: [{ number: 1 }, { number: 2 }], hasSource: false }
      ]
    };
    const adapter = new MemoryRealtimeDocAdapter('project01', OTJson0.type, project);
    const projectDataDoc = new SFProjectDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedSFProjectService.get('project01')).thenResolve(projectDataDoc);
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    userConfig.ownerRef = 'user01';
    const adapter = new MemoryRealtimeDocAdapter('project01', OTJson0.type, userConfig);
    this.projectUserConfigDoc = new SFProjectUserConfigDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedSFProjectService.getUserConfig('project01', 'user01')).thenResolve(this.projectUserConfigDoc);
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    tick(UPDATE_SUGGESTIONS_TIMEOUT);
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  insertSuggestion(i: number = 0): void {
    if (i === 0) {
      const wordsLink = this.suggestion.query(By.css('#words-link'));
      wordsLink.nativeElement.click();
    } else {
      const keydownEvent: any = document.createEvent('CustomEvent');
      keydownEvent.key = i.toString();
      keydownEvent.ctrlKey = true;
      keydownEvent.initEvent('keydown', true, true);
      this.component.target.editor.root.dispatchEvent(keydownEvent);
    }
    this.wait();
  }

  clickSuggestionsMenuButton(): void {
    this.component.suggestionsMenuButton.elementRef.nativeElement.click();
    this.fixture.detectChanges();
    tick(16);
    this.fixture.detectChanges();
  }

  clickTrainingProgressCloseButton(): void {
    this.trainingProgressCloseButton.nativeElement.click();
    this.fixture.detectChanges();
  }

  updateConfidenceThresholdSlider(value: number): void {
    const slider = this.confidenceThresholdSlider.componentInstance as MdcSlider;
    slider.setValue(value, true);
    tick(CONFIDENCE_THRESHOLD_TIMEOUT);
    this.wait();
  }

  updateParams(params: Params): void {
    this.params$.next(params);
  }

  updateTrainingProgress(percentCompleted: number): void {
    this.trainingProgress$.next({ percentCompleted, message: 'message' });
    this.fixture.detectChanges();
  }

  completeTrainingProgress(): void {
    const trainingProgress$ = this.trainingProgress$;
    this.trainingProgress$ = new Subject<ProgressStatus>();
    trainingProgress$.complete();
    this.fixture.detectChanges();
    tick();
  }

  typeCharacters(str: string): number {
    const selection = this.component.target.editor.getSelection();
    const delta = new Delta()
      .retain(selection.index)
      .delete(selection.length)
      .insert(str);
    this.component.target.editor.updateContents(delta, 'user');
    const selectionIndex = selection.index + str.length;
    this.component.target.editor.setSelection(selectionIndex, 0, 'user');
    this.wait();
    return selectionIndex;
  }

  dispose(): void {
    this.component.metricsSession.dispose();
  }

  createTextDoc(id: TextDocId): TextDoc {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapter.toString(), style: 'c' } });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapter}, verse 1.`, { segment: `verse_${id.chapter}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    switch (id.textType) {
      case 'source':
        delta.insert(`${id.textType}: chapter ${id.chapter}, verse 2.`, { segment: `verse_${id.chapter}_2` });
        break;
      case 'target':
        delta.insert({ blank: 'normal' }, { segment: `verse_${id.chapter}_2` });
        break;
    }
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapter}, verse 3.`, { segment: `verse_${id.chapter}_3` });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapter}, verse 4.`, { segment: `verse_${id.chapter}_4` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: 'initial' }, { segment: `verse_${id.chapter}_4/p_1` });
    delta.insert({ verse: { number: '5', style: 'v' } });
    switch (id.textType) {
      case 'source':
        delta.insert(`${id.textType}: chapter ${id.chapter}, verse 5.`, { segment: `verse_${id.chapter}_5` });
        break;
      case 'target':
        delta.insert(`${id.textType}: chapter ${id.chapter}, `, { segment: `verse_${id.chapter}_5` });
        break;
    }
    delta.insert('\n', { para: { style: 'p' } });
    const adapter = new MemoryRealtimeDocAdapter(id.toString(), RichText.type, delta);
    return new TextDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private addTextDoc(id: TextDocId): void {
    when(this.mockedSFProjectService.getText(deepEqual(id))).thenResolve(this.createTextDoc(id));
  }
}
