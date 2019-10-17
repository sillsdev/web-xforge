import { MdcSlider } from '@angular-mdc/web';
import { HttpErrorResponse } from '@angular/common/http';
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
import cloneDeep from 'lodash/cloneDeep';
import Quill from 'quill';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import * as RichText from 'rich-text';
import { BehaviorSubject, defer, Subject } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { CONFIDENCE_THRESHOLD_TIMEOUT, EditorComponent, UPDATE_SUGGESTIONS_TIMEOUT } from './editor.component';
import { SuggestionComponent } from './suggestion.component';

const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);

describe('EditorComponent', () => {
  configureTestingModule(() => ({
    declarations: [EditorComponent, SuggestionComponent],
    imports: [NoopAnimationsModule, RouterTestingModule, SharedModule, UICommonModule],
    providers: [
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute }
    ]
  }));

  describe('Translation Suggestions enabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      env.dispose();
    }));

    it('start with previously selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 2, selectedSegment: 'verse_2_1' });
      env.wait();
      expect(env.component.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target.segmentRef).toEqual('verse_2_1');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(30);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);
      env.dispose();
    }));

    it('source retrieved after target', fakeAsync(() => {
      const env = new TestEnvironment();
      const sourceId = new TextDocId('project01', 40, 1, 'source');
      let resolve: ((value?: TextDoc) => void) | undefined;
      when(mockedSFProjectService.getText(deepEqual(sourceId))).thenReturn(new Promise(r => (resolve = r)));
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_2' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);

      resolve!(env.getTextDoc(sourceId));
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(true);

      env.dispose();
    }));

    it('select non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);

      resetCalls(env.mockedRemoteTranslationEngine);
      const range = env.component.target.getSegmentRange('verse_1_3');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_3');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(33);
      expect(selection!.length).toBe(0);
      expect(env.getProjectUserConfigDoc().data!.selectedSegment).toBe('verse_1_3');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(false);

      env.dispose();
    }));

    it('select blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');

      resetCalls(env.mockedRemoteTranslationEngine);
      const range = env.component.target.getSegmentRange('verse_1_2');
      env.targetEditor.setSelection(range!.index + 1, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_2');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(31);
      expect(selection!.length).toBe(0);
      expect(env.getProjectUserConfigDoc().data!.selectedSegment).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(true);
      expect(env.component.suggestionWords).toEqual(['target']);

      env.dispose();
    }));

    it('delete all text from non-verse paragraph segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'p_1' });
      env.wait();
      let segmentRange = env.component.target.segment!.range;
      let segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      let op = segmentContents.ops![0];
      expect(op.insert.blank).toBe(true);
      expect(op.attributes!.segment).toEqual('p_1');

      const index = env.typeCharacters('t');
      segmentRange = env.component.target.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      op = segmentContents.ops![0];
      expect(op.insert.blank).toBeUndefined();
      expect(op.attributes!.segment).toEqual('p_1');

      env.targetEditor.setSelection(index - 1, 1, 'user');
      env.deleteCharacters();
      segmentRange = env.component.target.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      op = segmentContents.ops![0];
      expect(op.insert.blank).toBe(true);
      expect(op.attributes!.segment).toEqual('p_1');

      env.dispose();
    }));

    it('delete all text from verse paragraph segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_4/p_1' });
      env.wait();
      let segmentRange = env.component.target.segment!.range;
      let segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      let op = segmentContents.ops![0];
      expect(op.insert.blank).toBe(true);
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      const index = env.typeCharacters('t');
      segmentRange = env.component.target.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      op = segmentContents.ops![0];
      expect(op.insert.blank).toBeUndefined();
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      env.targetEditor.setSelection(index - 1, 1, 'user');
      env.deleteCharacters();
      segmentRange = env.component.target.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      op = segmentContents.ops![0];
      expect(op.insert.blank).toBe(true);
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      env.dispose();
    }));

    it('selection not at end of incomplete segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.target.segmentRef).toBe('');

      const range = env.component.target.getSegmentRange('verse_1_5');
      env.targetEditor.setSelection(range!.index, 0, 'user');
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
      env.targetEditor.setSelection(range!.index + range!.length, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();
      expect(env.component.showSuggestion).toBe(true);
      expect(env.component.suggestionWords).toEqual(['verse', '5']);

      env.dispose();
    }));

    it('insert suggestion in non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
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
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestion).toBe(true);

      const selectionIndex = env.typeCharacters('5');
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestion).toBe(false);
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(selectionIndex + 1);
      expect(selection!.length).toBe(0);

      env.dispose();
    }));

    it('insert space when inserting a suggestion after inserting a previous suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestion).toBe(true);

      let selection = env.targetEditor.getSelection();
      const selectionIndex = selection!.index;
      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toEqual('target: chapter 1, verse 5');
      expect(env.component.showSuggestion).toBe(false);
      selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(selectionIndex + 2);
      expect(selection!.length).toBe(0);

      env.dispose();
    }));

    it('do not insert space when typing punctuation after inserting a suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestion).toBe(true);

      const selectionIndex = env.typeCharacters('.');
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse.');
      expect(env.component.showSuggestion).toBe(false);
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(selectionIndex);
      expect(selection!.length).toBe(0);

      env.dispose();
    }));

    it('train a modified segment after selecting a different segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion();
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');

      const range = env.component.target.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.lastApprovedPrefix).toEqual(['target', ':', 'chapter', '1', ',', 'verse', '5']);

      env.dispose();
    }));

    it('do not train an unmodified segment after selecting a different segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestion).toBe(true);

      env.insertSuggestion();
      expect(env.component.target.segmentText).toBe('target: chapter 1, verse 5');

      const selection = env.targetEditor.getSelection();
      env.targetEditor.deleteText(selection!.index - 7, 7, 'user');
      env.wait();
      expect(env.component.target.segmentText).toBe('target: chapter 1, ');

      const range = env.component.target.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.lastApprovedPrefix).toEqual([]);

      env.dispose();
    }));

    it('change texts', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.bookName).toEqual('Matthew');
      expect(env.component.target.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.component.bookName).toEqual('Mark');
      expect(env.component.target.segmentRef).toEqual('');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.component.bookName).toEqual('Matthew');
      expect(env.component.target.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      env.dispose();
    }));

    it('change chapters', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
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
        selectedBookNum: 40,
        selectedChapterNum: 1,
        selectedSegment: 'verse_1_1',
        selectedSegmentChecksum: 0
      });
      env.wait();
      expect(env.component.chapter).toBe(1);
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.component.target.segment!.initialChecksum).toBe(0);

      env.getProjectUserConfigDoc().submitJson0Op(op => op.unset(puc => puc.selectedSegmentChecksum!), false);
      env.wait();
      expect(env.component.target.segmentRef).toBe('verse_1_1');
      expect(env.component.target.segment!.initialChecksum).not.toBe(0);

      env.dispose();
    }));

    it('update confidence threshold', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedBookNum: 40,
        selectedChapterNum: 1,
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
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
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
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
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
      verify(mockedNoticeService.show(anything())).once();
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).once();

      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).toBeDefined();

      env.dispose();
    }));

    it('error in training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
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
      env.throwTrainingProgressError();
      expect(env.trainingProgress).toBeNull();
      expect(env.component.showTrainingProgress).toBe(false);

      tick(30000);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).toBeDefined();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).toBeDefined();

      env.dispose();
    }));

    it('no source', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.component.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target.segmentRef).toEqual('verse_1_1');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(30);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user02');
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEditTexts).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('empty book', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'JHN' });
      env.wait();
      expect(env.component.bookName).toEqual('John');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      expect(env.component.target.readOnlyEnabled).toBe(true);
      env.dispose();
    }));
  });

  describe('Translation Suggestions disabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject(false);
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.component.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('start with previously selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject(false);
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 2, selectedSegment: 'verse_2_1' });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.component.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target.segmentRef).toEqual('verse_2_1');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(30);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.translateInteractively(1, anything())).never();
      expect(env.component.showSuggestion).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user02');
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.component.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEditTexts).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
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

  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);

  lastApprovedPrefix: string[] = [];

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);
  private readonly params$: BehaviorSubject<Params>;
  private trainingProgress$ = new Subject<ProgressStatus>();

  constructor() {
    this.params$ = new BehaviorSubject<Params>({ projectId: 'project01', bookId: 'MAT' });
    this.addTextDoc(new TextDocId('project01', 40, 1, 'source'));
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 40, 2, 'source'));
    this.addTextDoc(new TextDocId('project01', 40, 2, 'target'));
    this.addTextDoc(new TextDocId('project01', 41, 1, 'source'));
    this.addTextDoc(new TextDocId('project01', 41, 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 42, 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 42, 2, 'target'));
    this.addEmptyTextDoc(new TextDocId('project01', 43, 1, 'target'));

    when(mockedActivatedRoute.params).thenReturn(this.params$);
    this.setCurrentUser('user01');
    when(mockedSFProjectService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    this.setupProject();
    when(this.mockedRemoteTranslationEngine.translateInteractively(1, anything())).thenCall(
      (_n: number, segment: string[]) =>
        Promise.resolve(new MockInteractiveTranslationSession(segment, prefix => (this.lastApprovedPrefix = prefix)))
    );
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.getUserConfig('project01', anything())).thenCall((_projectId, userId) =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId('project01', userId)
      )
    );
    when(mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );

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

  get targetEditor(): Quill {
    return this.component.target.editor!;
  }

  setCurrentUser(userId: string): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
  }

  setupProject(translationSuggestionsEnabled: boolean = true): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project 01',
        paratextId: 'target01',
        shortName: 'TRG',
        userRoles: { user01: SFProjectRole.ParatextTranslator, user02: SFProjectRole.ParatextConsultant },
        writingSystem: { tag: 'qaa' },
        translateConfig: {
          translationSuggestionsEnabled,
          source: {
            paratextId: 'source01',
            name: 'source',
            shortName: 'SRC',
            writingSystem: {
              tag: 'qaa'
            }
          }
        },
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific
        },
        sync: { queuedCount: 0 },
        texts: [
          {
            bookNum: 40,
            chapters: [{ number: 1, lastVerse: 3 }, { number: 2, lastVerse: 3 }],
            hasSource: true
          },
          { bookNum: 41, chapters: [{ number: 1, lastVerse: 3 }], hasSource: true },
          {
            bookNum: 42,
            chapters: [{ number: 1, lastVerse: 3 }, { number: 2, lastVerse: 3 }],
            hasSource: false
          },
          {
            bookNum: 43,
            chapters: [{ number: 1, lastVerse: 0 }],
            hasSource: false
          }
        ]
      }
    });
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    const user1Config = cloneDeep(userConfig);
    user1Config.ownerRef = 'user01';
    this.addProjectUserConfig(user1Config as SFProjectUserConfig);
    const user2Config = cloneDeep(userConfig);
    user2Config.ownerRef = 'user02';
    this.addProjectUserConfig(user2Config as SFProjectUserConfig);
  }

  getProjectUserConfigDoc(userId: string = 'user01'): SFProjectUserConfigDoc {
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      getSFProjectUserConfigDocId('project01', userId)
    );
  }

  getTextDoc(textId: TextDocId): TextDoc {
    return this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, textId.toString());
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
      this.component.target.editor!.root.dispatchEvent(keydownEvent);
    }
    this.wait();
  }

  clickSuggestionsMenuButton(): void {
    this.component.suggestionsMenuButton!.elementRef.nativeElement.click();
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

  throwTrainingProgressError(): void {
    const trainingProgress$ = this.trainingProgress$;
    this.trainingProgress$ = new Subject<ProgressStatus>();
    trainingProgress$.error(new HttpErrorResponse({ status: 404 }));
    this.fixture.detectChanges();
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
    const selection = this.targetEditor.getSelection()!;
    const delta = new Delta()
      .retain(selection.index)
      .delete(selection.length)
      .insert(str);
    this.targetEditor.updateContents(delta, 'user');
    const selectionIndex = selection.index + str.length;
    this.targetEditor.setSelection(selectionIndex, 'user');
    this.wait();
    return selectionIndex;
  }

  deleteCharacters(): number {
    const selection = this.targetEditor.getSelection()!;
    this.targetEditor.deleteText(selection.index, selection.length, 'user');
    this.targetEditor.setSelection(selection.index, 'user');
    this.wait();
    return selection.index;
  }

  dispose(): void {
    this.component.metricsSession!.dispose();
  }

  addTextDoc(id: TextDocId): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    switch (id.textType) {
      case 'source':
        delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 2.`, { segment: `verse_${id.chapterNum}_2` });
        break;
      case 'target':
        delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_2` });
        break;
    }
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 4.`, { segment: `verse_${id.chapterNum}_4` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_4/p_1` });
    delta.insert({ verse: { number: '5', style: 'v' } });
    switch (id.textType) {
      case 'source':
        delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 5.`, { segment: `verse_${id.chapterNum}_5` });
        break;
      case 'target':
        delta.insert(`${id.textType}: chapter ${id.chapterNum}, `, { segment: `verse_${id.chapterNum}_5` });
        break;
    }
    delta.insert('\n', { para: { style: 'p' } });
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }

  private addProjectUserConfig(userConfig: SFProjectUserConfig): void {
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId('project01', userConfig.ownerRef),
      data: userConfig
    });
  }

  private addEmptyTextDoc(id: TextDocId): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: new Delta()
    });
  }
}
