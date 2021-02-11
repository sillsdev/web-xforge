import { HttpErrorResponse } from '@angular/common/http';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Params } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import {
  createRange,
  ProgressStatus,
  RemoteTranslationEngine,
  TranslationSources,
  WordAlignmentMatrix,
  WordGraph,
  WordGraphArc
} from '@sillsdev/machine';
import cloneDeep from 'lodash-es/cloneDeep';
import { CookieService } from 'ngx-cookie-service';
import Quill from 'quill';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { TextType } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfoPermission } from 'realtime-server/lib/scriptureforge/models/text-info-permission';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import * as RichText from 'rich-text';
import { BehaviorSubject, defer, of, Subject } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { CONSOLE } from 'xforge-common/browser-globals';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { SharedModule } from '../../shared/shared.module';
import { EditorComponent, UPDATE_SUGGESTIONS_TIMEOUT } from './editor.component';
import { SuggestionsComponent } from './suggestions.component';

const mockedAuthService = mock(AuthService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);
const mockedTranslationEngineService = mock(TranslationEngineService);

class MockConsole {
  log(val: any) {
    if (
      typeof val !== 'string' ||
      (!/(Translated|Trained) segment, length: \d+, time: \d+\.\d+ms/.test(val) &&
        !/Segment \w+ of document \w+ was trained successfully\./.test(val))
    ) {
      console.log(val);
    }
  }
}

describe('EditorComponent', () => {
  configureTestingModule(() => ({
    declarations: [EditorComponent, SuggestionsComponent],
    imports: [
      NoopAnimationsModule,
      RouterTestingModule,
      SharedModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: CONSOLE, useValue: new MockConsole() },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService }
    ]
  }));

  describe('Translation Suggestions enabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.invalidWarning).toBeNull();
      env.dispose();
    }));

    it('start with previously selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 2, selectedSegment: 'verse_2_1' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target!.segmentRef).toEqual('verse_2_1');
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).never();
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(30);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(false);
      env.dispose();
    }));

    it('source retrieved after target', fakeAsync(() => {
      const env = new TestEnvironment();
      const sourceId = new TextDocId('project02', 40, 1);
      let resolve: ((value?: TextDoc) => void) | undefined;
      when(mockedSFProjectService.getText(deepEqual(sourceId))).thenReturn(new Promise(r => (resolve = r)));
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_2' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();
      expect(env.component.showSuggestions).toBe(false);

      resolve!(env.getTextDoc(sourceId));
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(true);

      env.dispose();
    }));

    it('select non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(false);

      resetCalls(env.mockedRemoteTranslationEngine);
      const range = env.component.target!.getSegmentRange('verse_1_3');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_3');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(33);
      expect(selection!.length).toBe(0);
      expect(env.getProjectUserConfigDoc().data!.selectedSegment).toBe('verse_1_3');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(false);

      env.dispose();
    }));

    it('select blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');

      resetCalls(env.mockedRemoteTranslationEngine);
      const range = env.component.target!.getSegmentRange('verse_1_2');
      env.targetEditor.setSelection(range!.index + 1, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(31);
      expect(selection!.length).toBe(0);
      expect(env.getProjectUserConfigDoc().data!.selectedSegment).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(true);
      expect(env.component.suggestions[0].words).toEqual(['target']);

      env.dispose();
    }));

    it('delete all text from non-verse paragraph segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'p_1' });
      env.wait();
      let segmentRange = env.component.target!.segment!.range;
      let segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      let op = segmentContents.ops![0];
      expect(op.insert.blank).toBe(true);
      expect(op.attributes!.segment).toEqual('p_1');

      const index = env.typeCharacters('t');
      segmentRange = env.component.target!.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      op = segmentContents.ops![0];
      expect(op.insert.blank).toBeUndefined();
      expect(op.attributes!.segment).toEqual('p_1');

      env.targetEditor.setSelection(index - 1, 1, 'user');
      env.deleteCharacters();
      segmentRange = env.component.target!.segment!.range;
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
      let segmentRange = env.component.target!.segment!.range;
      let segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      let op = segmentContents.ops![0];
      expect(op.insert.blank).toBe(true);
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      const index = env.typeCharacters('t');
      segmentRange = env.component.target!.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);
      op = segmentContents.ops![0];
      expect(op.insert.blank).toBeUndefined();
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      env.targetEditor.setSelection(index - 1, 1, 'user');
      env.deleteCharacters();
      segmentRange = env.component.target!.segment!.range;
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
      expect(env.component.target!.segmentRef).toBe('');

      const range = env.component.target!.getSegmentRange('verse_1_5');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(false);

      env.dispose();
    }));

    it('selection at end of incomplete segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.target!.segmentRef).toBe('');

      const range = env.component.target!.getSegmentRange('verse_1_5');
      env.targetEditor.setSelection(range!.index + range!.length, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.component.showSuggestions).toBe(true);
      expect(env.component.suggestions[0].words).toEqual(['verse', '5']);

      env.dispose();
    }));

    it('insert suggestion in non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion();
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestions).toBe(false);

      env.dispose();
    }));

    it('insert second suggestion in non-blank segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedBookNum: 40,
        selectedChapterNum: 1,
        selectedSegment: 'verse_1_5',
        numSuggestions: 2
      });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.downArrow();
      env.insertSuggestion();
      expect(env.component.target!.segmentText).toBe('target: chapter 1, versa 5');
      expect(env.component.showSuggestions).toBe(false);

      env.dispose();
    }));

    it('insert space when typing character after inserting a suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestions).toBe(true);

      const selectionIndex = env.typeCharacters('5.');
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5.');
      expect(env.component.showSuggestions).toBe(false);
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(selectionIndex + 1);
      expect(selection!.length).toBe(0);

      env.dispose();
    }));

    it('insert space when inserting a suggestion after inserting a previous suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestions).toBe(true);

      let selection = env.targetEditor.getSelection();
      const selectionIndex = selection!.index;
      env.insertSuggestion(1);
      expect(env.component.target!.segmentText).toEqual('target: chapter 1, verse 5');
      expect(env.component.showSuggestions).toBe(false);
      selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(selectionIndex + 2);
      expect(selection!.length).toBe(0);

      env.dispose();
    }));

    it('do not insert space when typing punctuation after inserting a suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion(1);
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse');
      expect(env.component.showSuggestions).toBe(true);

      const selectionIndex = env.typeCharacters('.');
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse.');
      expect(env.component.showSuggestions).toBe(false);
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(selectionIndex);
      expect(selection!.length).toBe(0);

      env.dispose();
    }));

    it('train a modified segment after selecting a different segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion();
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');

      const range = env.component.target!.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(
        env.mockedRemoteTranslationEngine.trainSegment(
          anything(),
          deepEqual(['target', ':', 'chapter', '1', ',', 'verse', '5']),
          true
        )
      ).once();

      env.dispose();
    }));

    it('does not train a modified segment after selecting a different segment if offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedTask: 'translate',
        selectedBookNum: 40,
        selectedChapterNum: 1,
        selectedSegment: 'verse_1_5',
        projectRef: 'project01'
      });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);
      env.insertSuggestion();
      const text = 'target: chapter 1, verse 5';
      expect(env.component.target!.segmentText).toBe(text);
      env.onlineStatus = false;
      when(mockedPwaService.isOnline).thenReturn(false);
      const range = env.component.target!.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      verify(mockedTranslationEngineService.storeTrainingSegment('project01', 'project02', 40, 1, 'verse_1_5')).once();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.trainSegment(anything(), anything(), anything())).never();

      env.dispose();
    }));

    it('train a modified segment after switching to another text and back', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion();
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');

      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.bookName).toEqual('Mark');
      expect(env.component.target!.segmentRef).toEqual('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.trainSegment(anything(), anything(), anything())).never();

      env.updateParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.target!.segmentRef).toEqual('verse_1_5');
      const range = env.component.target!.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(
        env.mockedRemoteTranslationEngine.trainSegment(
          anything(),
          deepEqual(['target', ':', 'chapter', '1', ',', 'verse', '5']),
          true
        )
      ).once();

      env.dispose();
    }));

    it('train a modified segment after selecting a segment in a different text', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedTask: 'translate',
        selectedBookNum: 40,
        selectedChapterNum: 1,
        selectedSegment: 'verse_1_5',
        selectedSegmentChecksum: 0
      });
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('');
      expect(env.component.showSuggestions).toBe(false);

      const range = env.component.target!.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).once();

      env.dispose();
    }));

    it('do not train an unmodified segment after selecting a different segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      env.insertSuggestion();
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');

      const selection = env.targetEditor.getSelection();
      env.targetEditor.deleteText(selection!.index - 7, 7, 'user');
      env.wait();
      expect(env.component.target!.segmentText).toBe('target: chapter 1, ');

      const range = env.component.target!.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.trainSegment(anything(), anything(), anything())).never();

      env.dispose();
    }));

    it('change texts', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.bookName).toEqual('Mark');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      env.dispose();
    }));

    it('change chapters', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.chapter).toBe(1);
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.component.chapter = 2;
      env.wait();
      const verseText = env.component.target!.getSegmentText('verse_2_1');
      expect(verseText).toBe('target: chapter 2, verse 1.');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.component.chapter = 1;
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

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
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.component.target!.segment!.initialChecksum).toBe(0);

      env.getProjectUserConfigDoc().submitJson0Op(op => op.unset(puc => puc.selectedSegmentChecksum!), false);
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.component.target!.segment!.initialChecksum).not.toBe(0);

      env.dispose();
    }));

    it('training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.component.showTrainingProgress).toBe(false);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).not.toBeNull();
      env.updateTrainingProgress(1);
      expect(env.trainingCompleteIcon).not.toBeNull();
      expect(env.trainingProgressSpinner).toBeNull();
      env.completeTrainingProgress();
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      tick(5000);
      env.wait();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.trainingProgress).toBeNull();
      expect(env.component.showTrainingProgress).toBe(false);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).not.toBeNull();

      env.dispose();
    }));

    it('close training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.component.showTrainingProgress).toBe(false);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).not.toBeNull();
      env.clickTrainingProgressCloseButton();
      expect(env.trainingProgress).toBeNull();
      expect(env.component.showTrainingProgress).toBe(false);
      env.updateTrainingProgress(1);
      env.completeTrainingProgress();
      env.wait();
      verify(mockedNoticeService.show(anything())).once();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).not.toBeNull();

      env.dispose();
    }));

    it('error in training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.component.showTrainingProgress).toBe(false);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).not.toBeNull();
      env.throwTrainingProgressError();
      expect(env.trainingProgress).toBeNull();
      expect(env.component.showTrainingProgress).toBe(false);

      tick(30000);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.component.showTrainingProgress).toBe(true);
      expect(env.trainingProgressSpinner).not.toBeNull();

      env.dispose();
    }));

    it('no source', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(30);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();
      expect(env.component.showSuggestions).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user02');
      env.setProjectUserConfig();
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user can edit a chapter with permission', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user03');
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 2 });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(2);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit a chapter with permission', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user03');
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 1 });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user has no resource access', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        translateConfig: {
          translationSuggestionsEnabled: true,
          source: {
            paratextId: 'resource01',
            name: 'Resource 1',
            shortName: 'SRC',
            projectRef: 'resource01',
            writingSystem: {
              tag: 'qaa'
            }
          }
        }
      });
      env.setCurrentUser('user01');
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'ACT' });
      env.wait();
      verify(mockedSFProjectService.get('resource01')).never();
      expect(env.bookName).toEqual('Acts');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('empty book', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'JHN' });
      env.wait();
      expect(env.bookName).toEqual('John');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();
      expect(env.component.showSuggestions).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      expect(env.component.target!.readOnlyEnabled).toBe(true);
      env.dispose();
    }));

    it('chapter is invalid', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.bookName).toEqual('Mark');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      expect(env.invalidWarning).not.toBeNull();
      env.dispose();
    }));

    it('ensure direction is RTL when project is to set to RTL', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ isRightToLeft: true });
      env.wait();
      expect(env.component.target!.isRtl).toBe(true);
      env.dispose();
    }));

    it('undo/redo', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_2' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');

      env.typeCharacters('test');
      let contents = env.targetEditor.getContents();
      expect(contents.ops![5].insert).toEqual('test');
      expect(contents.ops![5].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });
      expect(contents.ops![6].insert).toEqual({ verse: { number: '3', style: 'v' } });
      expect(contents.ops![6].attributes).toEqual({ 'para-contents': true });

      env.triggerUndo();
      contents = env.targetEditor.getContents();
      // check that edit has been undone
      expect(contents.ops![5].insert).toEqual({ blank: true });
      expect(contents.ops![5].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });
      // check to make sure that data after the affected segment hasn't gotten corrupted
      expect(contents.ops![6].insert).toEqual({ verse: { number: '3', style: 'v' } });
      expect(contents.ops![6].attributes).toEqual({ 'para-contents': true });
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(31);
      expect(selection!.length).toBe(0);

      env.triggerRedo();
      contents = env.targetEditor.getContents();
      expect(contents.ops![5].insert).toEqual('test');
      expect(contents.ops![5].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });
      expect(contents.ops![6].insert).toEqual({ verse: { number: '3', style: 'v' } });
      expect(contents.ops![6].attributes).toEqual({ 'para-contents': true });

      env.dispose();
    }));
  });

  describe('Translation Suggestions disabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: { translationSuggestionsEnabled: false } });
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('start with previously selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: { translationSuggestionsEnabled: false } });
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 2, selectedSegment: 'verse_2_1' });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target!.segmentRef).toEqual('verse_2_1');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(30);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();
      expect(env.component.showSuggestions).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: { translationSuggestionsEnabled: false } });
      env.setCurrentUser('user02');
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user can edit a chapter with permission', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: { translationSuggestionsEnabled: false } });
      env.setCurrentUser('user03');
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 2 });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(2);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit a chapter with permission', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: { translationSuggestionsEnabled: false } });
      env.setCurrentUser('user03');
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 1 });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user has no resource access', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        translateConfig: {
          translationSuggestionsEnabled: false,
          source: {
            paratextId: 'resource01',
            name: 'Resource 1',
            shortName: 'SRC',
            projectRef: 'resource01',
            writingSystem: {
              tag: 'qaa'
            }
          }
        }
      });
      env.setCurrentUser('user01');
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'ACT' });
      env.wait();
      verify(mockedSFProjectService.get('resource01')).never();
      expect(env.bookName).toEqual('Acts');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('chapter is invalid', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: { translationSuggestionsEnabled: false } });
      env.setProjectUserConfig();
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.bookName).toEqual('Mark');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      expect(env.invalidWarning).not.toBeNull();
      env.dispose();
    }));
  });
});

class TestEnvironment {
  readonly component: EditorComponent;
  readonly fixture: ComponentFixture<EditorComponent>;

  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);

  private userRolesOnProject = {
    user01: SFProjectRole.ParatextTranslator,
    user02: SFProjectRole.ParatextConsultant,
    user03: SFProjectRole.ParatextTranslator
  };
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private readonly params$: BehaviorSubject<Params>;
  private trainingProgress$ = new Subject<ProgressStatus>();

  private testProject: SFProject = {
    name: 'project 01',
    paratextId: 'target01',
    shortName: 'TRG',
    isRightToLeft: false,
    userRoles: this.userRolesOnProject,
    writingSystem: { tag: 'qaa' },
    translateConfig: {
      translationSuggestionsEnabled: true,
      source: {
        paratextId: 'source01',
        projectRef: 'project02',
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
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: true,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
          },
          {
            number: 2,
            lastVerse: 3,
            isValid: true,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
          }
        ],
        hasSource: true,
        permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
      },
      {
        bookNum: 41,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: false,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
          }
        ],
        hasSource: true,
        permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
      },
      {
        bookNum: 42,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: true,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
          },
          {
            number: 2,
            lastVerse: 3,
            isValid: true,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Write }
          }
        ],
        hasSource: false,
        permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
      },
      {
        bookNum: 43,
        chapters: [
          {
            number: 1,
            lastVerse: 0,
            isValid: true,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
          }
        ],
        hasSource: false,
        permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
      },
      {
        bookNum: 44,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: true,
            permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
          }
        ],
        hasSource: true,
        permissions: { user01: TextInfoPermission.Write, user03: TextInfoPermission.Read }
      }
    ]
  };

  constructor() {
    this.params$ = new BehaviorSubject<Params>({ projectId: 'project01', bookId: 'MAT' });
    this.addTextDoc(new TextDocId('project02', 40, 1, 'target'), 'source');
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));
    this.addTextDoc(new TextDocId('project02', 40, 2, 'target'), 'source');
    this.addTextDoc(new TextDocId('project01', 40, 2, 'target'));
    this.addTextDoc(new TextDocId('project02', 41, 1, 'target'), 'source');
    this.addTextDoc(new TextDocId('project01', 41, 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 42, 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 42, 2, 'target'));
    this.addEmptyTextDoc(new TextDocId('project01', 43, 1, 'target'));

    when(mockedActivatedRoute.params).thenReturn(this.params$);
    this.setupUsers();
    this.setCurrentUser('user01');
    when(mockedTranslationEngineService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    this.setupProject();
    when(this.mockedRemoteTranslationEngine.getWordGraph(anything())).thenCall(segment =>
      Promise.resolve(this.createWordGraph(segment))
    );
    when(this.mockedRemoteTranslationEngine.trainSegment(anything(), anything(), anything())).thenResolve();
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.get('project02')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project02')
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
    when(mockedPwaService.isOnline).thenReturn(true);
    when(mockedPwaService.onlineStatus).thenReturn(of(true));

    this.fixture = TestBed.createComponent(EditorComponent);
    this.component = this.fixture.componentInstance;
  }

  get bookName(): string {
    return Canon.bookNumberToEnglishName(this.component.bookNum!);
  }

  get suggestions(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-suggestions'));
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

  get invalidWarning(): DebugElement {
    return this.fixture.debugElement.query(By.css('.invalid-warning'));
  }

  get isSourceAreaHidden(): boolean {
    return this.sourceTextArea.nativeElement.style.display === 'none';
  }

  get targetEditor(): Quill {
    return this.component.target!.editor!;
  }

  set onlineStatus(value: boolean) {
    when(mockedPwaService.isOnline).thenReturn(value);
    when(mockedPwaService.onlineStatus).thenReturn(of(value));
  }

  setCurrentUser(userId: string): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() => this.realtimeService.subscribe(UserDoc.COLLECTION, userId));
  }

  setupUsers(): void {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: {
        name: 'User 01',
        email: 'user1@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth01',
        displayName: 'User 01',
        sites: {
          sf: {
            projects: ['project01', 'project02', 'project03']
          }
        }
      }
    });
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user02',
      data: {
        name: 'User 02',
        email: 'user2@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth02',
        displayName: 'User 02',
        sites: {
          sf: {
            projects: ['project01', 'project02', 'project03']
          }
        }
      }
    });
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user03',
      data: {
        name: 'User 03',
        email: 'user3@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth03',
        displayName: 'User 03',
        sites: {
          sf: {
            projects: ['project01', 'project02', 'project03']
          }
        }
      }
    });
  }

  setupProject(data: Partial<SFProject> = {}): void {
    const projectData = cloneDeep(this.testProject);
    if (data.translateConfig?.translationSuggestionsEnabled != null) {
      projectData.translateConfig.translationSuggestionsEnabled = data.translateConfig.translationSuggestionsEnabled;
    }
    if (data.translateConfig?.source !== undefined) {
      projectData.translateConfig.source = data.translateConfig?.source;
    }
    if (data.isRightToLeft != null) {
      projectData.isRightToLeft = data.isRightToLeft;
    }
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: projectData
    });
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project02',
      data: projectData
    });
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    const user1Config = cloneDeep(userConfig);
    user1Config.ownerRef = 'user01';
    this.addProjectUserConfig(user1Config as SFProjectUserConfig);
    const user2Config = cloneDeep(userConfig);
    user2Config.ownerRef = 'user02';
    this.addProjectUserConfig(user2Config as SFProjectUserConfig);
    const user3Config = cloneDeep(userConfig);
    user3Config.ownerRef = 'user03';
    this.addProjectUserConfig(user3Config as SFProjectUserConfig);
  }

  getProjectUserConfigDoc(userId: string = 'user01'): SFProjectUserConfigDoc {
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      getSFProjectUserConfigDocId('project01', userId)
    );
  }

  getChapterElement(index: number): Element | null {
    const chapters = this.targetEditor.container.querySelectorAll('usx-chapter');
    if (chapters.hasOwnProperty(index) !== undefined) {
      return chapters[index];
    }
    return null;
  }

  getParagraphElement(index: number): Element | null {
    const paragraphs = this.targetEditor.container.querySelectorAll('usx-para');
    if (paragraphs.hasOwnProperty(index) !== undefined) {
      return paragraphs[index];
    }
    return null;
  }

  getSegmentElement(segmentRef: string): HTMLElement | null {
    return this.targetEditor.container.querySelector('usx-segment[data-segment="' + segmentRef + '"]');
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
    const keydownEvent: any = document.createEvent('CustomEvent');
    if (i === 0) {
      keydownEvent.key = 'Enter';
    } else {
      keydownEvent.key = i.toString();
      keydownEvent.ctrlKey = true;
    }
    keydownEvent.initEvent('keydown', true, true);
    this.component.target!.editor!.root.dispatchEvent(keydownEvent);
    this.wait();
  }

  downArrow(): void {
    const keydownEvent: any = document.createEvent('CustomEvent');
    keydownEvent.key = 'ArrowDown';
    keydownEvent.initEvent('keydown', true, true);
    this.component.target!.editor!.root.dispatchEvent(keydownEvent);
    this.wait();
  }

  clickTrainingProgressCloseButton(): void {
    this.trainingProgressCloseButton.nativeElement.click();
    this.fixture.detectChanges();
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
    const delta = new Delta().retain(selection.index).delete(selection.length).insert(str);
    this.targetEditor.updateContents(delta, 'user');
    const selectionIndex = selection.index + str.length;
    this.targetEditor.setSelection(selectionIndex, 'user');
    const keyEvent: any = document.createEvent('CustomEvent');
    this.wait();
    for (const c of str) {
      keyEvent.key = c;
      keyEvent.initEvent('keyup', true, true);
      this.component.target!.editor!.root.dispatchEvent(keyEvent);
      this.wait();
    }
    return selectionIndex;
  }

  deleteCharacters(): number {
    const selection = this.targetEditor.getSelection()!;
    this.targetEditor.deleteText(selection.index, selection.length, 'user');
    this.targetEditor.setSelection(selection.index, 'user');
    this.wait();
    return selection.index;
  }

  triggerUndo(): void {
    this.targetEditor.history.undo();
    this.wait();
  }

  triggerRedo(): void {
    this.targetEditor.history.redo();
    this.wait();
  }

  dispose(): void {
    this.component.metricsSession!.dispose();
  }

  addTextDoc(id: TextDocId, textType: TextType = 'target'): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    switch (textType) {
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
    switch (textType) {
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
    if (userConfig.translationSuggestionsEnabled == null) {
      userConfig.translationSuggestionsEnabled = true;
    }
    if (userConfig.numSuggestions == null) {
      userConfig.numSuggestions = 1;
    }
    if (userConfig.confidenceThreshold == null) {
      userConfig.confidenceThreshold = 0.2;
    }
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

  private createWordGraph(segment: string[]): WordGraph {
    const arcs: WordGraphArc[] = [];
    for (let i = 0; i < segment.length; i++) {
      let targetWord = segment[i];
      if (targetWord === 'source') {
        targetWord = 'target';
      }
      const alignment = new WordAlignmentMatrix(1, 1);
      alignment.set(0, 0, true);
      arcs.push(
        new WordGraphArc(i, i + 1, -10, [targetWord], alignment, createRange(i, i + 1), [TranslationSources.Smt], [0.5])
      );
      if (targetWord === 'verse') {
        arcs.push(
          new WordGraphArc(i, i + 1, -11, ['versa'], alignment, createRange(i, i + 1), [TranslationSources.Smt], [0.4])
        );
      }
    }
    return new WordGraph(arcs, [segment.length]);
  }
}
