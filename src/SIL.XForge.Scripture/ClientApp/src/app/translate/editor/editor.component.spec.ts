import { HttpErrorResponse } from '@angular/common/http';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
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
import Quill, { DeltaOperation, DeltaStatic, RangeStatic, Sources } from 'quill';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import {
  AssignedUsers,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { hasParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextType } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { BehaviorSubject, defer, Observable, of, Subject } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { CONSOLE } from 'xforge-common/browser-globals';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { NoteThreadDoc } from '../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { SharedModule } from '../../shared/shared.module';
import { getCombinedVerseTextDoc, paratextUsersFromRoles } from '../../shared/test-utils';
import { EditorComponent, UPDATE_SUGGESTIONS_TIMEOUT } from './editor.component';
import { NoteDialogComponent } from './note-dialog/note-dialog.component';
import { SuggestionsComponent } from './suggestions.component';
import { ACTIVE_EDIT_TIMEOUT } from './translate-metrics-session';

const mockedAuthService = mock(AuthService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);
const mockedTranslationEngineService = mock(TranslationEngineService);
const mockedMatDialog = mock(MatDialog);

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
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService },
      { provide: MatDialog, useMock: mockedMatDialog }
    ]
  }));

  it('sharing is only enabled for administrators', fakeAsync(() => {
    const env = new TestEnvironment();
    env.updateParams({ projectId: 'project02', bookId: 'MAT' });
    env.wait();
    // Null for non admins
    expect(env.sharingButton).toBeNull();

    // Truthy for admins
    env.setCurrentUser('user04');
    env.updateParams({ projectId: 'project01', bookId: 'MAT' });
    env.wait();
    expect(env.sharingButton).not.toBeNull();
    env.dispose();
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
      let resolve: (value: TextDoc | PromiseLike<TextDoc>) => void;
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
      // The selection gets adjusted to come after the note icon embed.
      expect(selection!.index).toBe(range!.index + 1);
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
      expect(selection!.index).toBe(33);
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

      env.targetEditor.setSelection(index - 2, 1, 'user');
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
      expect(op.insert).toEqual({
        'note-thread-embed': {
          iconsrc: '--icon-file: url(/assets/icons/TagIcons/01flag1.png);',
          preview: 'Note from user01',
          threadid: 'thread05'
        }
      });
      op = segmentContents.ops![1];
      expect(op.insert.blank).toBeUndefined();
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      let index = env.targetEditor.getSelection()!.index;
      const length = 'Paragraph break.'.length;
      env.targetEditor.setSelection(index - length, length, 'user');
      index = env.typeCharacters('t');
      segmentRange = env.component.target!.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);

      // The note remains, the blank is removed
      op = segmentContents.ops![0];
      expect(op.insert).toEqual({
        'note-thread-embed': {
          iconsrc: '--icon-file: url(/assets/icons/TagIcons/01flag1.png);',
          preview: 'Note from user01',
          threadid: 'thread05'
        }
      });
      op = segmentContents.ops![1];
      expect(op.insert.blank).toBeUndefined();
      expect(op.attributes!.segment).toEqual('verse_1_4/p_1');

      env.targetEditor.setSelection(index - 1, 1, 'user');
      env.deleteCharacters();
      segmentRange = env.component.target!.segment!.range;
      segmentContents = env.targetEditor.getContents(segmentRange.index, segmentRange.length);

      // The note remains, the blank returns
      op = segmentContents.ops![0];
      expect(op.insert).toEqual({
        'note-thread-embed': {
          iconsrc: '--icon-file: url(/assets/icons/TagIcons/01flag1.png);',
          preview: 'Note from user01',
          threadid: 'thread05'
        }
      });
      op = segmentContents.ops![1];
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

    it('should increment offered suggestion count when inserting suggestion', fakeAsync(() => {
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
      expect(env.component.metricsSession?.metrics.type).toEqual('navigate');

      env.insertSuggestion();

      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestions).toBe(false);
      expect(env.component.metricsSession?.metrics.type).toEqual('edit');
      expect(env.component.metricsSession?.metrics.suggestionTotalCount).toBe(1);
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.component.metricsSession?.metrics.type).toEqual('edit');
      expect(env.component.metricsSession?.metrics.suggestionAcceptedCount).toBe(1);
      expect(env.component.metricsSession?.metrics.suggestionTotalCount).toBe(1);
      env.dispose();
    }));

    it("should not increment accepted suggestion if the content doesn't change", fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.component.target!.segmentRef).toBe('');
      const range = env.component.target!.getSegmentRange('verse_1_5');
      env.targetEditor.setSelection(range!.index + range!.length, 0, 'user');
      env.wait();
      env.typeCharacters('verse 5');
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestions).toBe(true);
      expect(env.component.suggestions[0].words).toEqual(['5']);
      expect(env.component.metricsSession?.metrics.type).toEqual('edit');
      expect(env.component.metricsSession?.metrics.suggestionTotalCount).toBe(1);
      expect(env.component.metricsSession?.metrics.suggestionAcceptedCount).toBeUndefined();

      env.insertSuggestion();

      expect(env.component.target!.segmentText).toBe('target: chapter 1, verse 5');
      expect(env.component.showSuggestions).toBe(false);
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.component.metricsSession?.metrics.type).toEqual('edit');
      expect(env.component.metricsSession?.metrics.suggestionTotalCount).toBe(1);
      expect(env.component.metricsSession?.metrics.suggestionAcceptedCount).toBeUndefined();
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

    it('does not build machine project if no source books exists', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      when(mockedTranslationEngineService.checkHasSourceBooks(anything())).thenReturn(false);
      env.wait();
      verify(mockedTranslationEngineService.createTranslationEngine(anything())).never();
      env.updateParams({ projectId: 'project02', bookId: 'MAT' });
      env.wait();
      verify(mockedTranslationEngineService.createTranslationEngine(anything())).never();
      expect().nothing();
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
      expect(selection!.index).toBe(50);
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
      expect(env.outOfSyncWarning).toBeNull();
      expect(env.isSourceAreaHidden).toBe(true);

      env.setDataInSync('project01', false);
      expect(env.component.canEdit).toBe(false);
      expect(env.outOfSyncWarning).not.toBeNull();
      env.dispose();
    }));

    it('user cannot edit a chapter source text visible', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user03');
      env.setProjectUserConfig();
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.canEdit).toBe(false);
      expect(env.component.showSource).toBe(true);
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

    it('user cannot edit a text that is not editable', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ editable: false });
      env.setProjectUserConfig();
      env.wait();

      expect(env.bookName).toEqual('Matthew');
      expect(env.component.projectTextNotEditable).toBe(true);
      expect(env.component.canEdit).toBe(false);
      expect(env.fixture.debugElement.query(By.css('.text-area .project-text-not-editable'))).not.toBeNull();
      env.dispose();
    }));

    it('user cannot edit a text if their permissions change', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.setProjectUserConfig();
      env.wait();

      const userId: string = 'user01';
      const projectId: string = 'project01';
      let projectDoc = env.getProjectDoc(projectId);
      expect(projectDoc.data?.userRoles[userId]).toBe(SFProjectRole.ParatextTranslator);
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.canEdit).toBe(true);

      let range = env.component.target!.getSegmentRange('verse_1_2');
      env.targetEditor.setSelection(range!.index + 1, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      // Change user role on the project and run a sync to force remote updates
      env.changeUserRole(projectId, userId, SFProjectRole.Observer);
      env.setDataInSync(projectId, true, false);
      env.setDataInSync(projectId, false, false);
      env.wait();
      resetCalls(env.mockedRemoteTranslationEngine);

      projectDoc = env.getProjectDoc(projectId);
      expect(projectDoc.data?.userRoles[userId]).toBe(SFProjectRole.Observer);
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.canEdit).toBe(false);

      range = env.component.target!.getSegmentRange('verse_1_3');
      env.targetEditor.setSelection(range!.index + 1, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_3');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();

      env.dispose();
    }));

    it('uses default font size', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ defaultFontSize: 18 });
      env.setProjectUserConfig();
      env.wait();

      const ptToRem = 12;
      expect(env.targetTextEditor.style.fontSize).toEqual(18 / ptToRem + 'rem');
      expect(env.sourceTextEditor.style.fontSize).toEqual(18 / ptToRem + 'rem');

      env.updateFontSize('project01', 24);
      expect(env.component.fontSize).toEqual(24 / ptToRem + 'rem');
      expect(env.targetTextEditor.style.fontSize).toEqual(24 / ptToRem + 'rem');
      env.updateFontSize('project02', 24);
      expect(env.sourceTextEditor.style.fontSize).toEqual(24 / ptToRem + 'rem');
      env.dispose();
    }));

    it('user has no resource access', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        translateConfig: {
          translationSuggestionsEnabled: true,
          shareEnabled: false,
          shareLevel: TranslateShareLevel.Specific,
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
      expect(env.isSourceAreaHidden).toBe(false);
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

    it('does not highlight read-only text editor', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user02');
      env.wait();
      const segmentRange = env.component.target!.getSegmentRange('verse_1_1')!;
      env.targetEditor.setSelection(segmentRange.index);
      env.wait();
      let element: HTMLElement = env.targetTextEditor.querySelector('usx-segment[data-segment="verse_1_1"]')!;
      expect(element.classList).not.toContain('highlight-segment');

      env.setCurrentUser('user01');
      env.wait();
      element = env.targetTextEditor.querySelector('usx-segment[data-segment="verse_1_1"]')!;
      expect(element.classList).toContain('highlight-segment');
      env.dispose();
    }));

    it('backspace and delete disabled for non-text elements and at segment boundaries', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.targetEditor.history['stack']['undo'].length).withContext('setup').toEqual(0);
      let range = env.component.target!.getSegmentRange('verse_1_2')!;
      let contents = env.targetEditor.getContents(range.index, 1);
      expect(contents.ops![0].insert.blank).toBeDefined();

      // set selection on a blank segment
      env.targetEditor.setSelection(range.index, 'user');
      env.wait();
      // the selection is programmatically set to after the blank
      expect(env.targetEditor.getSelection()!.index).toEqual(range.index + 1);
      expect(env.targetEditor.history['stack']['undo'].length).toEqual(0);

      env.pressKey('backspace');
      expect(env.targetEditor.history['stack']['undo'].length).toEqual(0);
      env.pressKey('delete');
      expect(env.targetEditor.history['stack']['undo'].length).toEqual(0);
      contents = env.targetEditor.getContents(range.index, 1);
      expect(contents.ops![0].insert.blank).toBeDefined();

      // set selection at segment boundaries
      range = env.component.target!.getSegmentRange('verse_1_4')!;
      env.targetEditor.setSelection(range.index + range.length, 'user');
      env.wait();
      env.pressKey('delete');
      expect(env.targetEditor.history['stack']['undo'].length).toEqual(0);
      env.targetEditor.setSelection(range.index, 'user');
      env.wait();
      env.pressKey('backspace');
      expect(env.targetEditor.history['stack']['undo'].length).toEqual(0);

      // other non-text elements
      range = env.component.target!.getSegmentRange('verse_1_1')!;
      env.targetEditor.insertEmbed(range.index, 'note', { caller: 'a', style: 'ft' }, 'api');
      env.wait();
      contents = env.targetEditor.getContents(range.index, 1);
      expect(contents.ops![0].insert.note).toBeDefined();
      env.targetEditor.setSelection(range.index + 1, 'user');
      env.pressKey('backspace');
      expect(env.targetEditor.history['stack']['undo'].length).toEqual(0);
      contents = env.targetEditor.getContents(range.index, 1);
      expect(contents.ops![0].insert.note).toBeDefined();
      env.dispose();
    }));

    it('undo/redo', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_2' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');

      const verse2SegmentIndex = 8;
      const verse3EmbedIndex = 9;
      env.typeCharacters('test');
      let contents = env.targetEditor.getContents();
      expect(contents.ops![verse2SegmentIndex].insert).toEqual('test');
      expect(contents.ops![verse2SegmentIndex].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });

      expect(contents.ops![verse3EmbedIndex].insert).toEqual({ verse: { number: '3', style: 'v' } });
      expect(contents.ops![verse3EmbedIndex].attributes).toEqual({ 'para-contents': true });

      env.triggerUndo();
      contents = env.targetEditor.getContents();
      // check that edit has been undone
      expect(contents.ops![verse2SegmentIndex].insert).toEqual({ blank: true });
      expect(contents.ops![verse2SegmentIndex].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });
      // check to make sure that data after the affected segment hasn't gotten corrupted
      expect(contents.ops![verse3EmbedIndex].insert).toEqual({ verse: { number: '3', style: 'v' } });
      expect(contents.ops![verse3EmbedIndex].attributes).toEqual({ 'para-contents': true });
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(33);
      expect(selection!.length).toBe(0);

      env.triggerRedo();
      contents = env.targetEditor.getContents();
      expect(contents.ops![verse2SegmentIndex].insert).toEqual('test');
      expect(contents.ops![verse2SegmentIndex].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });
      expect(contents.ops![verse3EmbedIndex].insert).toEqual({ verse: { number: '3', style: 'v' } });
      expect(contents.ops![verse3EmbedIndex].attributes).toEqual({ 'para-contents': true });

      env.dispose();
    }));

    it('ensure resolved notes do not appear', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      const segment: HTMLElement = env.targetTextEditor.querySelector('usx-segment[data-segment=verse_1_5]')!;
      expect(segment).not.toBeNull();
      const note = segment.querySelector('display-note')! as HTMLElement;
      expect(note).toBeNull();
      env.dispose();
    }));

    it('ensure inserting in a blank segment only produces required delta ops', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      const range = env.component.target!.getSegmentRange('verse_1_2');
      env.targetEditor.setSelection(range!.index + 1, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');

      let contents = env.targetEditor.getContents();
      const verse2SegmentIndex = 8;
      expect(contents.ops![verse2SegmentIndex].insert).toEqual({ blank: true });

      // Keep track of operations triggered in Quill
      let textChangeOps: RichText.DeltaOperation[] = [];
      env.targetEditor.on('text-change', (delta: DeltaStatic, _oldContents: DeltaStatic, _source: Sources) => {
        if (delta.ops != null) {
          textChangeOps = textChangeOps.concat(
            delta.ops.map(op => {
              delete op.attributes;
              return op;
            })
          );
        }
      });

      // Type a character and observe the correct operations are returned
      env.typeCharacters('t');
      contents = env.targetEditor.getContents();
      expect(contents.ops![verse2SegmentIndex].insert).toEqual('t');
      const expectedOps = [
        { retain: 33 },
        { insert: 't' },
        { retain: 32 },
        { delete: 1 },
        { retain: 1 },
        { retain: 32 },
        { retain: 1 }
      ];
      expect(textChangeOps).toEqual(expectedOps);

      env.dispose();
    }));
  });

  describe('Note threads', () => {
    it('embeds note on verse segments', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addParatextNoteThread(6, 'MAT 1:2', '', { start: 0, length: 0 }, ['user01']);
      env.addParatextNoteThread(
        7,
        'LUK 1:0',
        'for chapter',
        { start: 6, length: 11 },
        ['user01'],
        NoteStatus.Todo,
        'user02'
      );
      env.addParatextNoteThread(8, 'LUK 1:2-3', '', { start: 0, length: 0 }, ['user01'], NoteStatus.Todo, 'user01');
      env.addParatextNoteThread(
        9,
        'LUK 1:2-3',
        'section heading',
        { start: 38, length: 15 },
        ['user01'],
        NoteStatus.Todo,
        AssignedUsers.TeamUser
      );
      env.addParatextNoteThread(10, 'MAT 1:4', '', { start: 27, length: 0 }, ['user01']);
      env.setProjectUserConfig();
      env.wait();
      const verse1Segment: HTMLElement = env.getSegmentElement('verse_1_1')!;
      const verse1Note = verse1Segment.querySelector('display-note') as HTMLElement;
      expect(verse1Note).not.toBeNull();
      expect(verse1Note.getAttribute('style')).toEqual('--icon-file: url(/assets/icons/TagIcons/01flag3.png);');
      expect(verse1Note.getAttribute('title')).toEqual('Note from user01\n--- 2 more note(s) ---');
      let contents = env.targetEditor.getContents();
      expect(contents.ops![3].insert).toEqual('target: ');
      expect(contents.ops![4].attributes!['iconsrc']).toEqual('--icon-file: url(/assets/icons/TagIcons/01flag3.png);');

      // three notes in the segment on verse 3
      const noteVerse3: NodeListOf<Element> = env.getSegmentElement('verse_1_3')!.querySelectorAll('display-note')!;
      expect(noteVerse3.length).toEqual(3);

      const blankSegmentNote = env.getSegmentElement('verse_1_2')!.querySelector('display-note') as HTMLElement;
      expect(blankSegmentNote.getAttribute('style')).toEqual('--icon-file: url(/assets/icons/TagIcons/01flag1.png);');
      expect(blankSegmentNote.getAttribute('title')).toEqual('Note from user01');

      const segmentEndNote = env.getSegmentElement('verse_1_4')!.querySelector('display-note') as HTMLElement;
      expect(segmentEndNote).not.toBeNull();

      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      const redFlagIcon = '01flag1.png';
      const grayFlagIcon = '01flag4.png';
      const titleUsxSegment: HTMLElement = env.getSegmentElement('s_1')!;
      expect(titleUsxSegment.classList).toContain('note-thread-segment');
      const titleUsxNote: HTMLElement | null = titleUsxSegment.querySelector('display-note');
      expect(titleUsxNote).not.toBeNull();
      // Note assigned to a different specific user
      expect(titleUsxNote!.getAttribute('style')).toEqual(`--icon-file: url(/assets/icons/TagIcons/${grayFlagIcon});`);

      const sectionHeadingUsxSegment: HTMLElement = env.getSegmentElement('s_2')!;
      expect(sectionHeadingUsxSegment.classList).toContain('note-thread-segment');
      const sectionHeadingNote: HTMLElement | null = sectionHeadingUsxSegment.querySelector('display-note');
      expect(sectionHeadingNote).not.toBeNull();
      // Note assigned to team
      expect(sectionHeadingNote!.getAttribute('style')).toEqual(
        `--icon-file: url(/assets/icons/TagIcons/${redFlagIcon});`
      );
      const combinedVerseUsxSegment: HTMLElement = env.getSegmentElement('verse_1_2-3')!;
      const combinedVerseNote: HTMLElement | null = combinedVerseUsxSegment.querySelector('display-note');
      expect(combinedVerseNote!.getAttribute('data-thread-id')).toEqual('thread08');
      // Note assigned to current user
      expect(combinedVerseNote!.getAttribute('style')).toEqual(
        `--icon-file: url(/assets/icons/TagIcons/${redFlagIcon});`
      );
      env.dispose();
    }));

    it('handles text doc updates with note embed offset', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_2' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_2');

      const verse1EmbedIndex = 2;
      const verse1SegmentIndex = 3;
      const verse1NoteIndex = verse1SegmentIndex + 1;
      const verse1NoteAnchorIndex = verse1SegmentIndex + 2;
      const verse2SegmentIndex = 8;
      env.typeCharacters('t');
      const contents = env.targetEditor.getContents();
      expect(contents.ops![verse2SegmentIndex].insert).toEqual('t');
      expect(contents.ops![verse2SegmentIndex].attributes).toEqual({
        'para-contents': true,
        segment: 'verse_1_2',
        'highlight-segment': true
      });
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      const textOps = textDoc.data!.ops!;
      expect(textOps[2].insert['verse']['number']).toBe('1');
      expect(textOps[3].insert).toBe('target: chapter 1, verse 1.');
      expect(textOps[5].insert).toBe('t');
      expect(contents.ops![verse1EmbedIndex]!.insert['verse']['number']).toBe('1');
      expect(contents.ops![verse1SegmentIndex].insert).toBe('target: ');
      expect(contents.ops![verse1NoteIndex]!.attributes!['iconsrc']).toBe(
        '--icon-file: url(/assets/icons/TagIcons/01flag3.png);'
      );
      // text anchor for thread01
      expect(contents.ops![verse1NoteAnchorIndex]!.insert).toBe('chapter 1');
      expect(contents.ops![verse1NoteAnchorIndex]!.attributes).toEqual({
        'para-contents': true,
        'text-anchor': true,
        segment: 'verse_1_1',
        'note-thread-segment': true
      });
      expect(contents.ops![verse2SegmentIndex]!.insert).toBe('t');
      env.dispose();
    }));

    it('correctly removes embedded elements', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      let contents = env.targetEditor.getContents();
      let noteThreadEmbedCount = env.countNoteThreadEmbeds(contents.ops!);
      expect(noteThreadEmbedCount).toEqual(5);
      env.component.removeEmbeddedElements();
      env.wait();

      contents = env.targetEditor.getContents();
      noteThreadEmbedCount = env.countNoteThreadEmbeds(contents.ops!);
      expect(noteThreadEmbedCount).toEqual(0);
      env.dispose();
    }));

    it('uses note thread text anchor as anchor', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      let doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      const noteStart1 = env.component.target!.getSegmentRange('verse_1_1')!.index + doc.data!.position.start;
      doc = env.getNoteThreadDoc('project01', 'thread02');
      const noteStart2 = env.component.target!.getSegmentRange('verse_1_3')!.index + doc.data!.position.start;
      doc = env.getNoteThreadDoc('project01', 'thread03');
      // Add 1 for the one previous embed in the segment
      const noteStart3 = env.component.target!.getSegmentRange('verse_1_3')!.index + doc.data!.position.start + 1;
      doc = env.getNoteThreadDoc('project01', 'thread04');
      // Add 2 for the two previous embeds
      const noteStart4 = env.component.target!.getSegmentRange('verse_1_3')!.index + doc.data!.position.start + 2;
      doc = env.getNoteThreadDoc('project01', 'thread05');
      const noteStart5 = env.component.target!.getSegmentRange('verse_1_4')!.index + doc.data!.position.start;
      // positions are 11, 34, 55, 56, 94
      const expected = [noteStart1, noteStart2, noteStart3, noteStart4, noteStart5];
      expect(Array.from(env.component.target!.embeddedElements.values())).toEqual(expected);
      env.dispose();
    }));

    it('note position correctly accounts for footnote symbols', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_3')!;
      const contents = env.targetEditor.getContents(range.index, range.length);
      // The footnote starts after a note thread in the segment
      expect(contents.ops![1].insert).toEqual({ note: { caller: '*' } });
      const note2Position = env.getNoteThreadEditorPosition('thread02');
      expect(range.index).toEqual(note2Position);
      const noteThreadDoc3 = env.getNoteThreadDoc('project01', 'thread03');
      const noteThread3StartPosition = 20;
      expect(noteThreadDoc3.data!.position).toEqual({ start: noteThread3StartPosition, length: 7 });
      const note3Position = env.getNoteThreadEditorPosition('thread03');
      // plus 1 for the note icon embed at the beginning of the verse
      expect(range.index + noteThread3StartPosition + 1).toEqual(note3Position);
      env.dispose();
    }));

    it('correctly places note in subsequent segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addParatextNoteThread(6, 'MAT 1:4', 'target', { start: 0, length: 6 }, ['user01']);
      // Note 7 should be at position 0 on segment 1_4/p_1
      env.addParatextNoteThread(7, 'MAT 1:4', '', { start: 28, length: 0 }, ['user01']);
      env.setProjectUserConfig();
      env.wait();

      const note7Position = env.getNoteThreadEditorPosition('thread07');
      const note4EmbedLength = 1;
      expect(note7Position).toEqual(env.component.target!.getSegmentRange('verse_1_4/p_1')!.index + note4EmbedLength);
      env.dispose();
    }));

    it('shows reattached note in updated location', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      // active position of thread04 when reattached to verse 4
      const position: TextAnchor = { start: 19, length: 5 };
      // reattach thread04 from MAT 1:3 to MAT 1:4
      env.reattachNote('project01', 'thread04', 'MAT 1:4', position);

      // SUT
      env.wait();
      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_4')!;
      const note4Position: number = env.getNoteThreadEditorPosition('thread04');
      const note4Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread04')!;
      const note4Anchor: TextAnchor = note4Doc.data!.position;
      expect(note4Anchor).toEqual(position);
      expect(note4Position).toEqual(range.index + position.start);
      // The original note thread was on verse 3
      expect(note4Doc.data!.verseRef.verseNum).toEqual(3);
      env.dispose();
    }));

    it('shows highlights note icons when new content is unread', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ noteRefsRead: ['thread01_note0', 'thread02_note0'] });
      env.wait();

      expect(env.isNoteIconHighlighted('thread01')).toBe(true);
      expect(env.isNoteIconHighlighted('thread02')).toBe(false);
      expect(env.isNoteIconHighlighted('thread03')).toBe(true);
      expect(env.isNoteIconHighlighted('thread04')).toBe(true);
      expect(env.isNoteIconHighlighted('thread05')).toBe(true);

      let puc: SFProjectUserConfigDoc = env.getProjectUserConfigDoc('user01');
      expect(puc.data!.noteRefsRead).not.toContain('thread01_note1');
      expect(puc.data!.noteRefsRead).not.toContain('thread01_note2');

      let iconElement: HTMLElement = env.getNoteThreadIconElement('verse_1_1', 'thread01')!;
      iconElement.click();
      env.wait();
      puc = env.getProjectUserConfigDoc('user01');
      expect(puc.data!.noteRefsRead).toContain('thread01_note1');
      expect(puc.data!.noteRefsRead).toContain('thread01_note2');
      expect(env.isNoteIconHighlighted('thread01')).toBe(false);

      expect(puc.data!.noteRefsRead).toContain('thread02_note0');
      iconElement = env.getNoteThreadIconElement('verse_1_3', 'thread02')!;
      iconElement.click();
      env.wait();
      puc = env.getProjectUserConfigDoc('user01');
      expect(puc.data!.noteRefsRead).toContain('thread02_note0');
      expect(puc.data!.noteRefsRead.filter(ref => ref === 'thread02_note0').length).toEqual(1);
      expect(env.isNoteIconHighlighted('thread02')).toBe(false);
      env.dispose();
    }));

    it('should update note position when inserting text', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();

      let noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // edit before start position
      env.targetEditor.setSelection(5, 0, 'user');
      const text = ' add text ';
      const length = text.length;
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 + length, length: 9 });

      // edit at note position
      let notePosition = env.getNoteThreadEditorPosition('thread01');
      env.targetEditor.setSelection(notePosition, 0, 'user');
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: length * 2 + 8, length: 9 });

      // edit immediately after note
      notePosition = env.getNoteThreadEditorPosition('thread01');
      env.targetEditor.setSelection(notePosition + 1, 0, 'user');
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: length * 2 + 8, length: 9 + length });

      // edit immediately after verse note
      noteThreadDoc = env.getNoteThreadDoc('project01', 'thread02');
      notePosition = env.getNoteThreadEditorPosition('thread02');
      expect(noteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });
      env.targetEditor.setSelection(notePosition, 0, 'user');
      env.wait();
      expect(env.targetEditor.getSelection()!.index).toEqual(notePosition + 1);
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });
      env.dispose();
    }));

    it('should update note position when deleting text', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // delete text before note
      const length = 3;
      const noteEmbedLength = 1;
      let notePosition = env.getNoteThreadEditorPosition('thread01');
      env.targetEditor.setSelection(notePosition - length, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 - length, length: 9 });

      // delete text at the beginning of note text
      notePosition = env.getNoteThreadEditorPosition('thread01');
      env.targetEditor.setSelection(notePosition + noteEmbedLength, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 - length, length: 9 - length });

      // delete text right after note text
      notePosition = env.getNoteThreadEditorPosition('thread01');
      const noteLength = noteThreadDoc.data!.position.length;
      env.targetEditor.setSelection(notePosition + noteEmbedLength + noteLength, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 - length, length: 9 - length });
      env.dispose();
    }));

    it('does not try to update positions with an unchanged value', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();

      const priorThreadId = 'thread02';
      const priorThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', priorThreadId);
      const laterThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread04');
      const origPriorThreadDocAnchorStart: number = priorThreadDoc.data!.position.start;
      const origPriorThreadDocAnchorLength: number = priorThreadDoc.data!.position.length;
      const origLaterThreadDocAnchorStart: number = laterThreadDoc.data!.position.start;
      const origLaterThreadDocAnchorLength: number = laterThreadDoc.data!.position.length;
      expect(laterThreadDoc.data!.position.start)
        .withContext('setup: have some space between the anchorings')
        .toBeGreaterThan(origPriorThreadDocAnchorStart + origPriorThreadDocAnchorLength);

      const insertedText = 'inserted text';
      const insertedTextLength = insertedText.length;
      let priorThreadEditorPos = env.getNoteThreadEditorPosition(priorThreadId);

      // Edit between anchorings
      env.targetEditor.setSelection(priorThreadEditorPos, 0, 'user');
      env.wait();
      const priorThreadDocSpy: jasmine.Spy<any> = spyOn<any>(priorThreadDoc, 'submitJson0Op').and.callThrough();
      const laterThreadDocSpy: jasmine.Spy<any> = spyOn<any>(laterThreadDoc, 'submitJson0Op').and.callThrough();
      // SUT
      env.typeCharacters(insertedText);
      expect(priorThreadDoc.data!.position)
        .withContext('unchanged')
        .toEqual({ start: origPriorThreadDocAnchorStart, length: origPriorThreadDocAnchorLength });
      expect(laterThreadDoc.data!.position)
        .withContext('pushed over')
        .toEqual({ start: origLaterThreadDocAnchorStart + insertedTextLength, length: origLaterThreadDocAnchorLength });
      // It makes sense to update thread anchor position information when they changed, but we need not request
      // position changes with unchanged information.
      expect(priorThreadDocSpy.calls.count())
        .withContext('do not try to update position with an unchanged value')
        .toEqual(0);
      expect(laterThreadDocSpy.calls.count()).withContext('do update position where it changed').toEqual(1);

      env.dispose();
    }));

    it('re-embeds a note icon when a user deletes it', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(Array.from(env.component.target!.embeddedElements.values())).toEqual([11, 34, 55, 56, 94]);

      // deletes just the note icon
      env.targetEditor.setSelection(11, 1, 'user');
      env.deleteCharacters();
      expect(Array.from(env.component.target!.embeddedElements.values())).toEqual([11, 34, 55, 56, 94]);
      const textDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      expect(textDoc.data!.ops![3].insert).toBe('target: chapter 1, verse 1.');

      // replace icon and characters with new text
      env.targetEditor.setSelection(9, 5, 'user');
      const noteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });
      env.typeCharacters('t');
      // 4 characters deleted and 1 character inserted
      expect(Array.from(env.component.target!.embeddedElements.values())).toEqual([10, 31, 52, 53, 91]);
      expect(noteThreadDoc.data!.position).toEqual({ start: 7, length: 7 });
      expect(textDoc.data!.ops![3].insert).toBe('targettapter 1, verse 1.');

      // switch to a different text
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(noteThreadDoc.data!.position).toEqual({ start: 7, length: 7 });

      env.updateParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(Array.from(env.component!.target!.embeddedElements.values())).toEqual([10, 31, 52, 53, 91]);
      env.dispose();
    }));

    it('handles deleting parts of two notes text anchors', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addParatextNoteThread(6, 'MAT 1:1', 'verse', { start: 19, length: 5 }, ['user01']);
      env.setProjectUserConfig();
      env.wait();

      // 1 target: $chapter|-> 1, $ve<-|rse 1.
      env.targetEditor.setSelection(19, 7, 'user');
      env.deleteCharacters();
      const note1 = env.getNoteThreadDoc('project01', 'thread01');
      expect(note1.data!.position).toEqual({ start: 8, length: 7 });
      const note2 = env.getNoteThreadDoc('project01', 'thread06');
      expect(note2.data!.position).toEqual({ start: 15, length: 3 });
      const textDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      expect(textDoc.data!.ops![3].insert).toEqual('target: chapterrse 1.');
      env.dispose();
    }));

    it('updates notes anchors in subsequent verse segments', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addParatextNoteThread(6, 'MAT 1:4', 'chapter 1', { start: 8, length: 9 }, ['user01']);
      env.setProjectUserConfig();
      env.wait();

      const noteThreadDoc = env.getNoteThreadDoc('project01', 'thread05');
      expect(noteThreadDoc.data!.position).toEqual({ start: 28, length: 9 });
      env.targetEditor.setSelection(86, 0, 'user');
      const text = ' new text ';
      const length = text.length;
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: 28 + length, length: 9 });
      env.dispose();
    }));

    it('should update note position if deleting across position end boundary', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });
      // delete text that spans across the end boundary
      const notePosition = env.getNoteThreadEditorPosition('thread01');
      const deletionLength = 10;
      const noteEmbedLength: number = 1;
      // Arbitrary text position within thread anchoring, at which to start deleting.
      const textPositionWithinAnchors = 4;
      // Editor position to begin deleting. This should be in the note anchoring span.
      const delStart: number = notePosition + noteEmbedLength + textPositionWithinAnchors;
      const deletionLengthWithinTextAnchor = noteThreadDoc.data!.position.length - textPositionWithinAnchors;
      env.targetEditor.setSelection(delStart, deletionLength, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 - deletionLengthWithinTextAnchor });
      env.dispose();
    }));

    it('handles insert at the last character position', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addParatextNoteThread(6, 'MAT 1:1', '1', { start: 16, length: 1 }, ['user01']);
      env.addParatextNoteThread(7, 'MAT 1:3', '.', { start: 27, length: 1 }, ['user01']);
      env.setProjectUserConfig();
      env.wait();

      const thread1Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      const thread1Position = env.getNoteThreadEditorPosition('thread01');
      expect(thread1Doc.data!.position).toEqual({ start: 8, length: 9 });

      const embedLength = 1;
      // Editor position immediately following the end of the anchoring. Note that both the thread1 and thread6 note
      // icon embeds need to be accounted for.
      const immediatelyAfter: number = thread1Position + embedLength * 2 + thread1Doc.data!.position.length;
      // Test insert at index one character outside the text anchor. So not immediately after the anchoring, but another
      // character past that.
      env.targetEditor.setSelection(immediatelyAfter + 1, 0, 'user');
      env.typeCharacters('a');
      expect(thread1Doc.data!.position).toEqual({ start: 8, length: 9 });

      // the insert should be included in the text anchor length if inserting immediately after last character
      env.targetEditor.setSelection(immediatelyAfter, 0, 'user');
      env.typeCharacters('b');
      expect(thread1Doc.data!.position).toEqual({ start: 8, length: 10 });

      // insert in an adjacent text anchor should not be included in the previous note
      const noteThread3Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread03');
      expect(noteThread3Doc.data!.position).toEqual({ start: 20, length: 7 });
      const index = env.getNoteThreadEditorPosition('thread07');
      env.targetEditor.setSelection(index + 1, 0, 'user');
      env.typeCharacters('c');
      expect(noteThread3Doc.data!.position).toEqual({ start: 20, length: 7 });
      const noteThread7Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', `thread07`);
      expect(noteThread7Doc.data!.position).toEqual({ start: 27, length: 1 + 'c'.length });

      env.dispose();
    }));

    it('should default a note to the beginning if all text is deleted', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      let noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // delete the entire text anchor
      let notePosition = env.getNoteThreadEditorPosition('thread01');
      let length = 9;
      env.targetEditor.setSelection(notePosition + 1, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });

      // delete text that includes the entire text anchor
      noteThreadDoc = env.getNoteThreadDoc('project01', 'thread03');
      expect(noteThreadDoc.data!.position).toEqual({ start: 20, length: 7 });
      notePosition = env.getNoteThreadEditorPosition('thread03');
      length = 8;
      env.targetEditor.setSelection(notePosition + 1, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });
      env.dispose();
    }));

    it('should update paratext notes position after editing verse with multiple notes', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();

      const thread3Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread03');
      const thread3AnchorLength = 7;
      const thread4AnchorLength = 5;
      expect(thread3Doc.data!.position).toEqual({ start: 20, length: thread3AnchorLength });
      const otherNoteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread04');
      expect(otherNoteThreadDoc.data!.position).toEqual({ start: 20, length: thread4AnchorLength });
      const verseNoteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread02');
      expect(verseNoteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });
      // edit before paratext note
      let thread3Position = env.getNoteThreadEditorPosition('thread03');
      env.targetEditor.setSelection(thread3Position, 0, 'user');
      env.wait();
      const textBeforeNote = 'add text before ';
      const length1 = textBeforeNote.length;
      env.typeCharacters(textBeforeNote);
      expect(thread3Doc.data!.position).toEqual({ start: 20 + length1, length: thread3AnchorLength });
      expect(otherNoteThreadDoc.data!.position).toEqual({ start: 20 + length1, length: thread4AnchorLength });

      // edit within note selection start
      thread3Position = env.getNoteThreadEditorPosition('thread03');
      env.targetEditor.setSelection(thread3Position + 1, 0, 'user');
      env.wait();
      const textWithinNote = 'edit within note ';
      const length2 = textWithinNote.length;
      env.typeCharacters(textWithinNote);
      env.wait();
      let lengthChange: number = length2;
      expect(thread3Doc.data!.position).toEqual({ start: 20 + length1, length: thread3AnchorLength + lengthChange });
      expect(otherNoteThreadDoc.data!.position).toEqual({
        start: 20 + length1,
        length: thread4AnchorLength + lengthChange
      });

      // edit within note selection end
      const verse3Range = env.component.target!.getSegmentRange('verse_1_3')!;
      // Verse 3 ends with "[...]ter 1, verse 3.". Thread 4 anchors to "verse".
      const extraAmount: number = ` 3.`.length;
      const editorPosImmediatelyFollowingThread4Anchoring = verse3Range.index + verse3Range.length - extraAmount;
      env.targetEditor.setSelection(editorPosImmediatelyFollowingThread4Anchoring, 0, 'user');
      env.typeCharacters(textWithinNote);
      lengthChange += length2;
      expect(thread3Doc.data!.position).toEqual({ start: 20 + length1, length: thread3AnchorLength + lengthChange });
      expect(otherNoteThreadDoc.data!.position).toEqual({
        start: 20 + length1,
        length: thread4AnchorLength + lengthChange
      });

      // delete text within note selection
      thread3Position = env.getNoteThreadEditorPosition('thread03');
      const deleteLength = 5;
      const lengthAfterNote = 2;
      env.targetEditor.setSelection(thread3Position + lengthAfterNote, deleteLength, 'user');
      env.wait();
      env.typeCharacters('');
      lengthChange -= deleteLength;
      expect(thread3Doc.data!.position).toEqual({ start: 20 + length1, length: thread3AnchorLength + lengthChange });
      expect(otherNoteThreadDoc.data!.position).toEqual({
        start: 20 + length1,
        length: thread4AnchorLength + lengthChange
      });
      // the verse note thread position never changes
      expect(verseNoteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });

      // delete text at the end of a note anchor
      const thread4IconLength = 1;
      const lastTextAnchorPosition: number = thread3Position + thread4IconLength + thread3AnchorLength + lengthChange;
      env.targetEditor.setSelection(lastTextAnchorPosition, 1, 'user');
      env.deleteCharacters();
      lengthChange--;
      expect(thread3Doc.data!.position).toEqual({ start: 20 + length1, length: thread3AnchorLength + lengthChange });
      env.dispose();
    }));

    it('can display note dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const note = env.fixture.debugElement.query(By.css('display-note'));
      expect(note).not.toBeNull();
      note.nativeElement.click();
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      env.dispose();
    }));

    it('note belongs to a segment after a blank', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread05');
      expect(noteThreadDoc.data!.position).toEqual({ start: 28, length: 9 });
      let verse4p1Index = env.component.target!.getSegmentRange('verse_1_4/p_1')!.index;
      expect(env.getNoteThreadEditorPosition('thread05')).toEqual(verse4p1Index);
      // user deletes all of the text in segment before
      const range = env.component.target!.getSegmentRange('verse_1_4')!;
      env.targetEditor.setSelection(range.index, range.length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 2, length: 9 });

      // switch to a new book and back
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      env.updateParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      let note5Index: number = env.getNoteThreadEditorPosition('thread05');
      verse4p1Index = env.component.target!.getSegmentRange('verse_1_4/p_1')!.index;
      expect(note5Index).toEqual(verse4p1Index);

      // user inserts text in blank segment
      const index = env.component.target!.getSegmentRange('verse_1_4')!.index;
      env.targetEditor.setSelection(index + 1, 0, 'user');
      env.wait();
      const text = 'abc';
      env.typeCharacters(text);
      const nextSegmentLength = 1;
      expect(noteThreadDoc.data!.position).toEqual({ start: nextSegmentLength + text.length, length: 9 });

      // switch to a new book and back
      env.updateParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      env.updateParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(noteThreadDoc.data!.position).toEqual({ start: nextSegmentLength + text.length, length: 9 });
      verse4p1Index = env.component.target!.getSegmentRange('verse_1_4/p_1')!.index;
      note5Index = env.getNoteThreadEditorPosition('thread05');
      expect(note5Index).toEqual(verse4p1Index);
      env.dispose();
    }));

    it('remote edits correctly applied to editor', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // The remote user inserts text after the thread01 note
      let notePosition: number = env.getNoteThreadEditorPosition('thread01');
      let remoteEditPositionAfterNote: number = 4;
      let noteCountBeforePosition: number = 1;
      // Text position in the text doc at which the remote user edits
      let remoteEditTextPos: number = env.getRemoteEditPosition(
        notePosition,
        remoteEditPositionAfterNote,
        noteCountBeforePosition
      );
      // $ represents a note thread embed
      // target: $chap|ter 1, verse 1.
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      const insertDelta: DeltaStatic = new Delta();
      (insertDelta as any).push({ retain: remoteEditTextPos } as DeltaOperation);
      (insertDelta as any).push({ insert: 'abc' } as DeltaOperation);
      // Simulate remote changes coming in
      textDoc.submit(insertDelta);

      // SUT 1
      env.wait();
      // The local editor was updated to apply the remote edit in the correct position locally
      expect(env.component.target!.getSegmentText('verse_1_1')).toEqual('target: chap' + 'abc' + 'ter 1, verse 1.');
      const verse1Range = env.component.target!.getSegmentRange('verse_1_1')!;
      const verse1Contents = env.targetEditor.getContents(verse1Range.index, verse1Range.length);
      // ops are [0]target: , [1]$, [2]chapabcter 1, [3], verse 1.
      expect(verse1Contents.ops!.length).withContext('has expected op structure').toEqual(4);
      expect(verse1Contents.ops![2].attributes!['text-anchor']).withContext('inserted text has formatting').toBe(true);

      // The remote user selects some text and pastes in a replacement
      notePosition = env.getNoteThreadEditorPosition('thread02');
      // 1 note from verse 1, and 1 in verse 3 before the selection point
      noteCountBeforePosition = 2;
      remoteEditPositionAfterNote = 5;
      remoteEditTextPos = env.getRemoteEditPosition(notePosition, remoteEditPositionAfterNote, noteCountBeforePosition);
      const originalNotePosInVerse: number = env.getNoteThreadDoc('project01', 'thread03').data!.position.start;
      // $*targ|->et: cha<-|pter 1, $$verse 3.
      //          ------- 7 characters get replaced locally by the text 'defgh'
      const selectionLength: number = 'et: cha'.length;
      const insertDeleteDelta: DeltaStatic = new Delta();
      (insertDeleteDelta as any).push({ retain: remoteEditTextPos } as DeltaOperation);
      (insertDeleteDelta as any).push({ insert: 'defgh' } as DeltaOperation);
      (insertDeleteDelta as any).push({ delete: selectionLength } as DeltaOperation);
      textDoc.submit(insertDeleteDelta);

      // SUT 2
      env.wait();
      expect(env.component.target!.getSegmentText('verse_1_3')).toEqual('targ' + 'defgh' + 'pter 1, verse 3.');

      // The remote user selects and deletes some text that includes a couple note embeds.
      remoteEditPositionAfterNote = 15;
      remoteEditTextPos = env.getRemoteEditPosition(notePosition, remoteEditPositionAfterNote, noteCountBeforePosition);
      // $*targdefghpter |->1, $$v<-|erse 3.
      //                    ------ editor range deleted
      const deleteDelta: DeltaStatic = new Delta();
      (deleteDelta as any).push({ retain: remoteEditTextPos } as DeltaOperation);
      // the remote edit deletes 4, but locally it is expanded to 6 to include the 2 note embeds
      (deleteDelta as any).push({ delete: 4 } as DeltaOperation);
      textDoc.submit(deleteDelta);

      // SUT 3
      env.wait();
      expect(env.component.target!.getSegmentText('verse_1_3')).toEqual('targdefghpter ' + 'erse 3.');
      expect(env.getNoteThreadDoc('project01', 'thread03').data!.position.start).toEqual(originalNotePosInVerse);
      expect(env.getNoteThreadDoc('project01', 'thread04').data!.position.start).toEqual(originalNotePosInVerse);
      const verse3Index: number = env.component.target!.getSegmentRange('verse_1_3')!.index;
      // The note is re-embedded at the position in the note thread doc.
      // Applying remote changes must not affect text anchors
      let notesBefore: number = 1;
      expect(env.getNoteThreadEditorPosition('thread03')).toEqual(verse3Index + originalNotePosInVerse + notesBefore);
      notesBefore = 2;
      expect(env.getNoteThreadEditorPosition('thread04')).toEqual(verse3Index + originalNotePosInVerse + notesBefore);
      env.dispose();
    }));

    it('remote edits do not affect note thread text anchors', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const noteThread1Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      const noteThread4Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread04');
      const originalNoteThread1TextPos: TextAnchor = noteThread1Doc.data!.position;
      const originalNoteThread4TextPos: TextAnchor = noteThread4Doc.data!.position;
      expect(originalNoteThread1TextPos).toEqual({ start: 8, length: 9 });
      expect(originalNoteThread4TextPos).toEqual({ start: 20, length: 5 });

      // simulate text changes at current segment
      let notePosition: number = env.getNoteThreadEditorPosition('thread04');
      let remoteEditPositionAfterNote: number = 1;
      // 1 note in verse 1, and 3 in verse 3
      let noteCountBeforePosition: number = 4;
      // $target: chapter 1, $$v|erse 3.
      let remoteEditTextPos: number = env.getRemoteEditPosition(
        notePosition,
        remoteEditPositionAfterNote,
        noteCountBeforePosition
      );
      env.targetEditor.setSelection(notePosition + remoteEditPositionAfterNote);
      let insert = 'abc';
      let deltaOps: DeltaOperation[] = [{ retain: remoteEditTextPos }, { insert: insert }];
      const inSegmentDelta = new Delta(deltaOps);
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      textDoc.submit(inSegmentDelta);

      // SUT 1
      env.wait();
      expect(env.component.target!.getSegmentText('verse_1_3')).toEqual('target: chapter 1, v' + insert + 'erse 3.');
      expect(noteThread4Doc.data!.position).toEqual(originalNoteThread4TextPos);

      // simulate text changes at a different segment
      notePosition = env.getNoteThreadEditorPosition('thread01');
      noteCountBeforePosition = 1;
      // target: $c|hapter 1, verse 1.
      remoteEditTextPos = env.getRemoteEditPosition(notePosition, remoteEditPositionAfterNote, noteCountBeforePosition);
      insert = 'def';
      deltaOps = [{ retain: remoteEditTextPos }, { insert: insert }];
      const outOfSegmentDelta = new Delta(deltaOps);
      textDoc.submit(outOfSegmentDelta);

      // SUT 2
      env.wait();
      expect(env.component.target!.getSegmentText('verse_1_1')).toEqual('target: c' + insert + 'hapter 1, verse 1.');
      expect(noteThread1Doc.data!.position).toEqual(originalNoteThread1TextPos);
      expect(noteThread4Doc.data!.position).toEqual(originalNoteThread4TextPos);

      // simulate text changes just before a note embed
      remoteEditPositionAfterNote = -1;
      noteCountBeforePosition = 0;
      // target: |$cdefhapter 1, verse 1.
      remoteEditTextPos = env.getRemoteEditPosition(notePosition, remoteEditPositionAfterNote, noteCountBeforePosition);
      insert = 'before';
      deltaOps = [{ retain: remoteEditTextPos }, { insert: insert }];
      const insertDelta = new Delta(deltaOps);
      textDoc.submit(insertDelta);
      const note1Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      const anchor: TextAnchor = { start: 8 + insert.length, length: 12 };
      note1Doc.submitJson0Op(op => op.set(nt => nt.position, anchor));

      // SUT 3
      env.wait();
      expect(env.component.target!.getSegmentText('verse_1_1')).toEqual('target: ' + insert + 'cdefhapter 1, verse 1.');
      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_1')!;
      expect(env.getNoteThreadEditorPosition('thread01')).toEqual(range.index + anchor.start);
      const contents = env.targetEditor.getContents(range.index, range.length);
      expect(contents.ops![0].insert).toEqual('target: ' + insert);
      expect(contents.ops![0].attributes!['text-anchor']).toBeUndefined();

      // simulate text changes just after a note embed
      notePosition = env.getNoteThreadEditorPosition('thread01');
      remoteEditPositionAfterNote = 0;
      noteCountBeforePosition = 1;
      // target: before$|cdefhapter 1, verse 1.
      remoteEditTextPos = env.getRemoteEditPosition(notePosition, remoteEditPositionAfterNote, noteCountBeforePosition);
      insert = 'ghi';
      deltaOps = [{ retain: remoteEditTextPos }, { insert: insert }];
      const insertAfterNoteDelta = new Delta(deltaOps);
      textDoc.submit(insertAfterNoteDelta);

      // SUT 4
      env.wait();
      expect(env.getNoteThreadEditorPosition('thread01')).toEqual(notePosition);
      expect(env.component.target!.getSegmentText('verse_1_1')).toEqual(
        'target: before' + insert + 'cdefhapter 1, verse 1.'
      );
      env.dispose();
    }));

    it('can backspace the last character in a segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_2')!;
      env.targetEditor.setSelection(range.index);
      env.wait();
      env.typeCharacters('t');
      let contents: DeltaStatic = env.targetEditor.getContents(range.index, 3);
      expect(contents.length()).toEqual(3);
      expect(contents.ops![0].insert).toEqual('t');
      expect(contents.ops![1].insert['verse']).toBeDefined();
      expect(contents.ops![2].insert['note-thread-embed']).toBeDefined();

      env.backspace();
      contents = env.targetEditor.getContents(range.index, 3);
      expect(contents.length()).toEqual(3);
      expect(contents.ops![0].insert.blank).toBeDefined();
      expect(contents.ops![1].insert['verse']).toBeDefined();
      expect(contents.ops![2].insert['note-thread-embed']).toBeDefined();
      env.dispose();
    }));

    it('remote edits next to note on verse applied correctly', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      let verse3Element: HTMLElement = env.getSegmentElement('verse_1_3')!;
      let noteThreadIcon = verse3Element.querySelector('.note-thread-segment display-note');
      expect(noteThreadIcon).not.toBeNull();
      // Insert text next to thread02 icon
      const notePosition: number = env.getNoteThreadEditorPosition('thread02');
      const remoteEditPositionAfterNote: number = 0;
      const noteCountBeforePosition = 2;
      // $|*target: chapter 1, $$verse 3.
      const remoteEditTextPos: number = env.getRemoteEditPosition(
        notePosition,
        remoteEditPositionAfterNote,
        noteCountBeforePosition
      );
      const insert: string = 'abc';
      const deltaOps: DeltaOperation[] = [{ retain: remoteEditTextPos }, { insert: insert }];
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      textDoc.submit(new Delta(deltaOps));

      env.wait();
      expect(env.getNoteThreadEditorPosition('thread02')).toEqual(notePosition);
      verse3Element = env.getSegmentElement('verse_1_3')!;
      noteThreadIcon = verse3Element.querySelector('.note-thread-segment display-note');
      expect(noteThreadIcon).not.toBeNull();
      // check that the note thread underline does not get applied
      const insertTextDelta = env.targetEditor.getContents(notePosition + 1, 3);
      expect(insertTextDelta.ops![0].insert).toEqual('abc');
      expect(insertTextDelta.ops![0].attributes!['text-anchor']).toBeUndefined();
      env.dispose();
    }));

    it('undo delete-a-note-icon removes the duplicate recreated icon', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      const noteThread6Anchor: TextAnchor = { start: 19, length: 5 };
      env.addParatextNoteThread(6, 'MAT 1:1', 'verse', noteThread6Anchor, ['user01']);
      env.wait();

      // undo deleting just the note
      const noteThread1: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread01');
      const noteThread1Anchor: TextAnchor = { start: 8, length: 9 };
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      expect(textDoc.data!.ops![3].insert).toEqual('target: chapter 1, verse 1.');
      const note1Position: number = env.getNoteThreadEditorPosition('thread01');
      // target: |->$<-|chapter 1, $verse 1.
      env.targetEditor.setSelection(note1Position, 1, 'user');
      env.deleteCharacters();
      const positionAfterDelete: number = env.getNoteThreadEditorPosition('thread01');
      expect(positionAfterDelete).toEqual(note1Position);
      env.triggerUndo();
      expect(env.getNoteThreadEditorPosition('thread01')).toEqual(note1Position);
      expect(env.component.target!.getSegmentText('verse_1_1')).toBe('target: chapter 1, verse 1.');
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);

      // undo deleting note and context
      let deleteLength: number = 5;
      let beforeNoteLength: number = 2;
      // target|->: $ch<-|apter 1, $verse 1.
      env.targetEditor.setSelection(note1Position - beforeNoteLength, deleteLength, 'user');
      env.deleteCharacters();
      let newNotePosition: number = env.getNoteThreadEditorPosition('thread01');
      expect(newNotePosition).toEqual(note1Position - beforeNoteLength);
      env.triggerUndo();
      expect(env.getNoteThreadEditorPosition('thread01')).toEqual(note1Position);
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);

      // undo deleting just the note when note thread doc has history
      // target: |->$<-|chapter 1, $verse 1.
      env.targetEditor.setSelection(note1Position, 1, 'user');
      env.deleteCharacters();
      env.triggerUndo();
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);

      // undo deleting note and entire selection
      const embedLength = 1;
      deleteLength = beforeNoteLength + embedLength + noteThread1.data!.position.length;
      // target|->: $chapter<-| 1: $verse 1.
      env.targetEditor.setSelection(note1Position - beforeNoteLength, deleteLength, 'user');
      env.deleteCharacters();
      newNotePosition = env.getNoteThreadEditorPosition('thread01');
      const range = env.component.target!.getSegmentRange('verse_1_1')!;
      // note moves to the beginning of the verse
      expect(newNotePosition).toEqual(range.index);
      env.triggerUndo();
      expect(noteThread1.data!.position).toEqual({ start: 8, length: 9 });

      // undo deleting a second note in verse does not affect first note
      const note6Position: number = env.getNoteThreadEditorPosition('thread06');
      const noteThread6: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread06');
      deleteLength = 3;
      const text = 'abc';
      // target: $chapter 1, |->$ve<-|rse 1.
      env.targetEditor.setSelection(note6Position, deleteLength, 'api');
      env.typeCharacters(text);
      newNotePosition = env.getNoteThreadEditorPosition('thread06');
      expect(newNotePosition).toEqual(note6Position + text.length);
      env.triggerUndo();
      expect(env.getNoteThreadEditorPosition('thread06')).toEqual(note6Position);
      expect(noteThread6.data!.position).toEqual(noteThread6Anchor);
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);
      expect(textDoc.data!.ops![3].insert).toEqual('target: chapter 1, verse 1.');

      // undo deleting multiple notes
      const noteThread3: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread03');
      const noteThread4: NoteThreadDoc = env.getNoteThreadDoc('project01', 'thread04');
      const noteThread3Anchor: TextAnchor = { start: 20, length: 7 };
      const noteThread4Anchor: TextAnchor = { start: 20, length: 5 };
      expect(noteThread3.data!.position).toEqual(noteThread3Anchor);
      expect(noteThread4.data!.position).toEqual(noteThread4Anchor);
      expect(textDoc.data!.ops![8].insert).toEqual('target: chapter 1, verse 3.');
      const note3Position: number = env.getNoteThreadEditorPosition('thread03');
      const note4Position: number = env.getNoteThreadEditorPosition('thread04');
      deleteLength = 6;
      // $target: chapter 1|->, $$ve<-|rse 3.
      env.targetEditor.setSelection(note3Position - beforeNoteLength, deleteLength, 'api');
      env.deleteCharacters();
      newNotePosition = env.getNoteThreadEditorPosition('thread03');
      expect(newNotePosition).toEqual(note3Position - beforeNoteLength);
      newNotePosition = env.getNoteThreadEditorPosition('thread04');
      expect(newNotePosition).toEqual(note4Position - beforeNoteLength);
      env.triggerUndo();
      env.wait();
      expect(env.getNoteThreadEditorPosition('thread03')).toEqual(note3Position);
      expect(env.getNoteThreadEditorPosition('thread04')).toEqual(note4Position);
      expect(noteThread3.data!.position).toEqual(noteThread3Anchor);
      expect(noteThread4.data!.position).toEqual(noteThread4Anchor);
      expect(textDoc.data!.ops![8].insert).toEqual('target: chapter 1, verse 3.');
      env.dispose();
    }));

    it('note dialog appears after undo delete-a-note', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      let iconElement02: HTMLElement = env.getNoteThreadIconElement('verse_1_3', 'thread02')!;
      iconElement02.click();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      let iconElement03: HTMLElement = env.getNoteThreadIconElement('verse_1_3', 'thread03')!;
      iconElement03.click();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).twice();

      const notePosition: number = env.getNoteThreadEditorPosition('thread02');
      const selectionIndex: number = notePosition + 1;
      env.targetEditor.setSelection(selectionIndex, 'user');
      env.wait();
      env.backspace();

      // SUT
      env.triggerUndo();
      iconElement02 = env.getNoteThreadIconElement('verse_1_3', 'thread02')!;
      iconElement02.click();
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).thrice();
      expect(iconElement02.parentElement!.tagName.toLowerCase()).toBe('display-text-anchor');
      iconElement03 = env.getNoteThreadIconElement('verse_1_3', 'thread03')!;
      iconElement03.click();
      env.wait();
      // ensure that clicking subsequent notes in a verse still works
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).times(4);
      env.dispose();
    }));

    it('selection position on editor is kept when note dialog is opened and editor loses focus', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      const segmentRef = 'verse_1_3';
      const segmentRange = env.component.target!.getSegmentRange(segmentRef)!;
      env.targetEditor.setSelection(segmentRange.index);
      expect(env.activeElementClasses).toContain('ql-editor');
      const iconElement: HTMLElement = env.getNoteThreadIconElement(segmentRef, 'thread02')!;
      iconElement.click();
      const element: HTMLElement = env.targetTextEditor.querySelector(
        'usx-segment[data-segment="' + segmentRef + '"]'
      )!;
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      env.wait();
      expect(env.activeElementTagName).toBe('INPUT');
      expect(element.classList).withContext('dialog opened').toContain('highlight-segment');
      mockedMatDialog.closeAll();
      expect(element.classList).withContext('dialog closed').toContain('highlight-segment');
      env.dispose();
    }));
  });

  describe('Translation Suggestions disabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
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
      env.setupProject({ translateConfig: defaultTranslateConfig });
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 2, selectedSegment: 'verse_2_1' });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(2);
      expect(env.component.target!.segmentRef).toEqual('verse_2_1');
      const selection = env.targetEditor.getSelection();
      expect(selection!.index).toBe(50);
      expect(selection!.length).toBe(0);
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();
      expect(env.component.showSuggestions).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      env.dispose();
    }));

    it('user cannot edit', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
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
      env.setupProject({ translateConfig: defaultTranslateConfig });
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

    it('translator cannot edit a chapter without edit permission on chapter', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
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
      expect(env.component.userHasGeneralEditRight).toBe(true);
      expect(env.component.hasChapterEditPermission).toBe(false);
      expect(env.component.canEdit).toBe(false);
      expect(env.isSourceAreaHidden).toBe(true);
      expect(env.noChapterEditPermissionMessage).toBeTruthy();
      env.dispose();
    }));

    it('user has no resource access', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        translateConfig: {
          translationSuggestionsEnabled: false,
          shareEnabled: false,
          shareLevel: TranslateShareLevel.Specific,
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
      env.setupProject({ translateConfig: defaultTranslateConfig });
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
      expect(env.invalidWarning).not.toBeNull();
      env.dispose();
    }));

    it('prevents editing and informs user when text doc is corrupted', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 3 });
      env.updateParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.component.hasEditRight).toBe(true);
      expect(env.component.canEdit).toBe(false);
      expect(env.corruptedWarning).not.toBeNull();
      env.dispose();
    }));

    it('shows translation suggestions settings when suggestions are enabled for the project', fakeAsync(() => {
      const projectConfig = { translateConfig: { ...defaultTranslateConfig, translationSuggestionsEnabled: true } };
      const navigationParams: Params = { projectId: 'project01', bookId: 'MRK' };

      const env = new TestEnvironment();
      env.setupProject(projectConfig);
      env.setProjectUserConfig();
      env.updateParams(navigationParams);
      env.wait();
      expect(env.suggestionsSettingsButton).toBeTruthy();
      env.dispose();
    }));

    it('hides translation suggestions settings when suggestions are disabled for the project', fakeAsync(() => {
      const projectConfig = { translateConfig: { ...defaultTranslateConfig, translationSuggestionsEnabled: false } };
      const navigationParams: Params = { projectId: 'project01', bookId: 'MRK' };

      const env = new TestEnvironment();
      env.setupProject(projectConfig);
      env.setProjectUserConfig();
      env.updateParams(navigationParams);
      env.wait();
      expect(env.suggestionsSettingsButton).toBeFalsy();
      env.dispose();
    }));
  });
});

const defaultTranslateConfig = {
  translationSuggestionsEnabled: false,
  shareEnabled: false,
  shareLevel: TranslateShareLevel.Specific
};

class TestEnvironment {
  readonly component: EditorComponent;
  readonly fixture: ComponentFixture<EditorComponent>;

  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);

  private userRolesOnProject = {
    user01: SFProjectRole.ParatextTranslator,
    user02: SFProjectRole.ParatextConsultant,
    user03: SFProjectRole.ParatextTranslator,
    user04: SFProjectRole.ParatextAdministrator
  };
  private paratextUsersOnProject = paratextUsersFromRoles(this.userRolesOnProject);
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private readonly params$: BehaviorSubject<Params>;
  private trainingProgress$ = new Subject<ProgressStatus>();
  private textInfoPermissions = {
    user01: TextInfoPermission.Write,
    user02: TextInfoPermission.None,
    user03: TextInfoPermission.Read
  };

  private testProjectProfile: SFProjectProfile = {
    name: 'project 01',
    paratextId: 'target01',
    shortName: 'TRG',
    isRightToLeft: false,
    userRoles: this.userRolesOnProject,
    userPermissions: {},
    writingSystem: { tag: 'qaa' },
    translateConfig: {
      translationSuggestionsEnabled: true,
      shareEnabled: false,
      shareLevel: TranslateShareLevel.Specific,
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
    sync: { queuedCount: 0, dataInSync: true },
    editable: true,
    texts: [
      {
        bookNum: 40,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions
          },
          {
            number: 2,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions
          }
        ],
        hasSource: true,
        permissions: this.textInfoPermissions
      },
      {
        bookNum: 41,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: false,
            permissions: this.textInfoPermissions
          }
        ],
        hasSource: true,
        permissions: this.textInfoPermissions
      },
      {
        bookNum: 42,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions
          },
          {
            number: 2,
            lastVerse: 3,
            isValid: true,
            permissions: {
              user01: TextInfoPermission.Write,
              user02: TextInfoPermission.None,
              user03: TextInfoPermission.Write
            }
          },
          {
            number: 3,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions
          }
        ],
        hasSource: false,
        permissions: this.textInfoPermissions
      },
      {
        bookNum: 43,
        chapters: [
          {
            number: 1,
            lastVerse: 0,
            isValid: true,
            permissions: this.textInfoPermissions
          }
        ],
        hasSource: false,
        permissions: this.textInfoPermissions
      },
      {
        bookNum: 44,
        chapters: [
          {
            number: 1,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions
          }
        ],
        hasSource: true,
        permissions: this.textInfoPermissions
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
    this.addCombinedVerseTextDoc(new TextDocId('project01', 42, 1, 'target'));
    this.addCombinedVerseTextDoc(new TextDocId('project01', 42, 2, 'target'));
    this.addTextDoc(new TextDocId('project01', 42, 3, 'target'), 'target', true);
    this.addEmptyTextDoc(new TextDocId('project01', 43, 1, 'target'));

    when(mockedActivatedRoute.params).thenReturn(this.params$);
    this.setupUsers();
    this.setCurrentUser('user01');
    when(mockedTranslationEngineService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    when(mockedTranslationEngineService.createTranslationEngine('project02')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    this.setupProject();
    this.addParatextNoteThread(1, 'MAT 1:1', 'chapter 1', { start: 8, length: 9 }, ['user01', 'user02', 'user03']);
    this.addParatextNoteThread(2, 'MAT 1:3', 'target: chapter 1, verse 3.', { start: 0, length: 0 }, ['user01']);
    this.addParatextNoteThread(3, 'MAT 1:3', 'verse 3', { start: 20, length: 7 }, ['user01']);
    this.addParatextNoteThread(4, 'MAT 1:3', 'verse', { start: 20, length: 5 }, ['user01']);
    this.addParatextNoteThread(5, 'MAT 1:4', 'Paragraph', { start: 28, length: 9 }, ['user01']);
    this.addParatextNoteThread(6, 'MAT 1:5', 'resolved note', { start: 0, length: 0 }, ['user01'], NoteStatus.Resolved);
    when(mockedTranslationEngineService.checkHasSourceBooks(anything())).thenReturn(true);
    when(this.mockedRemoteTranslationEngine.getWordGraph(anything())).thenCall(segment =>
      Promise.resolve(this.createWordGraph(segment))
    );
    when(this.mockedRemoteTranslationEngine.trainSegment(anything(), anything(), anything())).thenResolve();
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();
    when(mockedSFProjectService.getProfile('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.getProfile('project02')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, 'project02')
    );
    when(mockedSFProjectService.tryGetForRole('project01', anything())).thenCall((id, role) =>
      hasParatextRole(role) ? this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id) : undefined
    );
    when(mockedSFProjectService.getUserConfig('project01', anything())).thenCall((_projectId, userId) =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId('project01', userId)
      )
    );
    when(mockedSFProjectService.getUserConfig('project02', anything())).thenCall((_projectId, userId) =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId('project02', userId)
      )
    );
    when(mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedSFProjectService.isProjectAdmin('project01', 'user04')).thenResolve(true);
    when(mockedSFProjectService.queryNoteThreads('project01')).thenCall(id =>
      this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, {
        [obj<NoteThread>().pathStr(t => t.projectRef)]: id,
        [obj<NoteThread>().pathStr(t => t.status)]: NoteStatus.Todo
      })
    );
    when(mockedPwaService.isOnline).thenReturn(true);
    when(mockedPwaService.onlineStatus).thenReturn(of(true));

    const openNoteDialogs: MockNoteDialogRef[] = [];
    when(mockedMatDialog.openDialogs).thenCall(() => openNoteDialogs);
    when(mockedMatDialog.open(NoteDialogComponent, anything())).thenCall(() => {
      const noteDialog = new MockNoteDialogRef(this.fixture.nativeElement);
      openNoteDialogs.push(noteDialog);
      return noteDialog;
    });
    when(mockedMatDialog.closeAll()).thenCall(() => openNoteDialogs.forEach(dialog => dialog.close()));

    this.fixture = TestBed.createComponent(EditorComponent);
    this.component = this.fixture.componentInstance;
  }

  get activeElementClasses(): DOMTokenList | undefined {
    return document.activeElement?.classList;
  }
  get activeElementTagName(): string | undefined {
    return document.activeElement?.tagName;
  }

  get bookName(): string {
    return Canon.bookNumberToEnglishName(this.component.bookNum!);
  }

  get suggestionsSettingsButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('button[icon="settings"]'));
  }

  get sharingButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-share'));
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

  get targetTextEditor(): HTMLElement {
    return this.fixture.debugElement.query(By.css('#target-text-area .ql-container')).nativeElement;
  }

  get sourceTextArea(): DebugElement {
    return this.fixture.debugElement.query(By.css('#source-text-area'));
  }

  get sourceTextEditor(): HTMLElement {
    return this.sourceTextArea.query(By.css('.ql-container')).nativeElement;
  }

  get invalidWarning(): DebugElement {
    return this.fixture.debugElement.query(By.css('.formatting-invalid-warning'));
  }

  get corruptedWarning(): DebugElement {
    return this.fixture.debugElement.query(By.css('.doc-corrupted-warning'));
  }

  get outOfSyncWarning(): DebugElement {
    return this.fixture.debugElement.query(By.css('.out-of-sync-warning'));
  }

  get noChapterEditPermissionMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('.no-edit-permission-message'));
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
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user04',
      data: {
        name: 'User 04',
        email: 'user4@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth04',
        displayName: 'User 04',
        sites: {
          sf: {
            projects: ['project01', 'project02', 'project03']
          }
        }
      }
    });
  }

  setupProject(data: Partial<SFProject> = {}): void {
    const projectProfileData = cloneDeep(this.testProjectProfile);
    const projectData: SFProject = {
      ...this.testProjectProfile,
      paratextUsers: this.paratextUsersOnProject
    };
    if (data.translateConfig?.translationSuggestionsEnabled != null) {
      projectProfileData.translateConfig.translationSuggestionsEnabled =
        data.translateConfig.translationSuggestionsEnabled;
    }
    if (data.translateConfig?.source !== undefined) {
      projectProfileData.translateConfig.source = data.translateConfig?.source;
    }
    if (data.isRightToLeft != null) {
      projectProfileData.isRightToLeft = data.isRightToLeft;
    }
    if (data.editable != null) {
      projectProfileData.editable = data.editable;
    }
    if (data.defaultFontSize != null) {
      projectProfileData.defaultFontSize = data.defaultFontSize;
    }
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: projectProfileData
    });
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project02',
      data: cloneDeep(projectProfileData)
    });
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: projectData
    });
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    userConfig.noteRefsRead = userConfig.noteRefsRead ?? [];
    const user1Config = cloneDeep(userConfig);
    user1Config.ownerRef = 'user01';
    this.addProjectUserConfig(user1Config as SFProjectUserConfig);
    const user2Config = cloneDeep(userConfig);
    user2Config.ownerRef = 'user02';
    this.addProjectUserConfig(user2Config as SFProjectUserConfig);
    const user3Config = cloneDeep(userConfig);
    user3Config.ownerRef = 'user03';
    this.addProjectUserConfig(user3Config as SFProjectUserConfig);
    const user4Config = cloneDeep(userConfig);
    user4Config.ownerRef = 'user04';
    this.addProjectUserConfig(user4Config as SFProjectUserConfig);
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

  getProjectDoc(projectId: string): SFProjectProfileDoc {
    return this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
  }

  getSegmentElement(segmentRef: string): HTMLElement | null {
    return this.targetEditor.container.querySelector('usx-segment[data-segment="' + segmentRef + '"]');
  }

  getTextDoc(textId: TextDocId): TextDoc {
    return this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, textId.toString());
  }

  getUserDoc(userId: string): UserDoc {
    return this.realtimeService.get<UserDoc>(UserDoc.COLLECTION, userId);
  }

  getNoteThreadDoc(projectId: string, threadId: string): NoteThreadDoc {
    const docId: string = projectId + ':' + threadId;
    return this.realtimeService.get<NoteThreadDoc>(NoteThreadDoc.COLLECTION, docId);
  }

  getNoteThreadIconElement(segmentRef: string, threadId: string): HTMLElement | null {
    return this.fixture.nativeElement.querySelector(
      `usx-segment[data-segment=${segmentRef}] display-note[data-thread-id=${threadId}]`
    );
  }

  /** Editor position of note thread. */
  getNoteThreadEditorPosition(threadId: string): number {
    return this.component.target!.embeddedElements.get(threadId)!;
  }

  getRemoteEditPosition(notePosition: number, positionAfter: number, noteCount: number): number {
    return notePosition + 1 + positionAfter - noteCount;
  }

  isNoteIconHighlighted(threadId: string): boolean {
    const thread: HTMLElement | null = this.targetTextEditor.querySelector(
      `usx-segment display-note[data-thread-id="${threadId}"].note-thread-highlight`
    );
    return thread != null;
  }

  setDataInSync(projectId: string, isInSync: boolean, source?: any): void {
    const projectDoc: SFProjectProfileDoc = this.getProjectDoc(projectId);
    projectDoc.submitJson0Op(op => op.set(p => p.sync.dataInSync!, isInSync), source);
    tick();
    this.fixture.detectChanges();
  }

  updateFontSize(projectId: string, size: number): void {
    const projectDoc: SFProjectProfileDoc = this.getProjectDoc(projectId);
    projectDoc.submitJson0Op(op => op.set(p => p.defaultFontSize, size), false);
    tick();
    this.fixture.detectChanges();
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

  changeUserRole(projectId: string, userId: string, role: SFProjectRole): void {
    const projectDoc: SFProjectProfileDoc = this.getProjectDoc(projectId);
    const userRoles = cloneDeep(this.userRolesOnProject);
    userRoles[userId] = role;
    projectDoc.submitJson0Op(op => op.set(p => p.userRoles, userRoles), false);

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
    const delta = new Delta().retain(selection.index).insert(str).delete(selection.length);
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

  backspace(): void {
    const selection = this.targetEditor.getSelection()!;
    const delta = new Delta([{ retain: selection.index - 1 }, { delete: 1 }]);
    this.targetEditor.updateContents(delta, 'user');
    this.wait();
  }

  deleteCharacters(): number {
    const selection = this.targetEditor.getSelection()!;
    this.targetEditor.deleteText(selection.index, selection.length, 'user');
    this.wait();
    this.targetEditor.setSelection(selection.index, 'user');
    this.wait();
    return selection.index;
  }

  pressKey(key: string): void {
    const keyCodes = { backspace: 8, delete: 46 };
    if (keyCodes[key] == null) {
      throw new Error('key code does not exist');
    }
    this.targetEditor.root.dispatchEvent(new KeyboardEvent('keydown', { keyCode: keyCodes[key] }));
    this.wait();
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
    this.wait();
    this.component.metricsSession!.dispose();
  }

  addTextDoc(id: TextDocId, textType: TextType = 'target', corrupt = false): void {
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
    delta.insert({ note: { caller: '*' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 4.`, { segment: `verse_${id.chapterNum}_4` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert('Paragraph break.', { segment: `verse_${id.chapterNum}_4/p_1` });
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
    if (corrupt) {
      delta.insert('this doc is corrupt');
      delta.delete(100);
      delta.retain(1);
    }
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }

  addParatextNoteThread(
    threadNum: number,
    verseStr: string,
    selectedText: string,
    position: TextAnchor,
    userIds: string[],
    status: NoteStatus = NoteStatus.Todo,
    assignedSFUserRef?: string
  ): void {
    const threadId: string = `thread0${threadNum}`;
    const assignedUser: ParatextUserProfile | undefined = this.paratextUsersOnProject.find(
      u => u.sfUserId === assignedSFUserRef
    );
    const notes: Note[] = [];
    for (let i = 0; i < userIds.length; i++) {
      const id = userIds[i];
      const date = new Date('2021-03-01T12:00:00');
      date.setHours(date.getHours() + i);
      const type: NoteType = NoteType.Normal;
      const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
      const note: Note = {
        threadId: threadId,
        type,
        conflictType,
        ownerRef: id,
        dataId: `${threadId}_note${i}`,
        dateCreated: date.toJSON(),
        dateModified: date.toJSON(),
        content: `<p><bold>Note from ${id}</bold></p>`,
        extUserId: id,
        deleted: false,
        status: NoteStatus.Todo,
        tagIcon: `01flag${i + 1}`,
        assignment: assignedUser?.opaqueUserId
      };
      notes.push(note);
    }

    const verseRef: VerseRef = VerseRef.parse(verseStr);
    this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
      id: `project01:${threadId}`,
      data: {
        projectRef: 'project01',
        dataId: threadId,
        verseRef: fromVerseRef(verseRef),
        ownerRef: 'user01',
        originalSelectedText: selectedText,
        notes,
        tagIcon: '01flag1',
        originalContextBefore: '\\v 1 target: ',
        originalContextAfter: ', verse 1.',
        position,
        status: status,
        assignment: assignedUser?.opaqueUserId
      }
    });
  }

  reattachNote(projectId: string, threadId: string, verseStr: string, position: TextAnchor): void {
    const noteThreadDoc: NoteThreadDoc = this.getNoteThreadDoc(projectId, threadId);
    const template: Note = noteThreadDoc.data!.notes[0];
    const verseRef: VerseRef = VerseRef.parse(verseStr);
    const contextAfter: string = ` ${verseRef.verseNum}.`;
    const reattachParts: string[] = [verseStr, 'verse', position.start.toString(), 'target: chapter 1, ', contextAfter];
    const reattached: string = reattachParts.join(REATTACH_SEPARATOR);
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
    const note: Note = {
      dataId: 'reattach01',
      type,
      conflictType,
      threadId: template.threadId,
      content: template.content,
      deleted: false,
      extUserId: '',
      ownerRef: template.ownerRef,
      status: NoteStatus.Unspecified,
      dateCreated: template.dateCreated,
      dateModified: template.dateModified,
      reattached
    };
    const index: number = noteThreadDoc.data!.notes.length;
    noteThreadDoc.submitJson0Op(op => {
      op.set(nt => nt.position, position);
      op.insert(nt => nt.notes, index, note);
    });
  }

  countNoteThreadEmbeds(ops: RichText.DeltaOperation[]): number {
    let noteEmbedCount: number = 0;
    for (const op of ops) {
      if (op.insert != null && op.insert['note-thread-embed'] != null) {
        noteEmbedCount++;
      }
    }
    return noteEmbedCount;
  }

  private addCombinedVerseTextDoc(id: TextDocId): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: getCombinedVerseTextDoc(id)
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

class MockNoteDialogRef {
  close$ = new Subject<void>();

  constructor(element: Element) {
    // steal the focus to simulate a dialog stealing the focus
    element.appendChild(document.createElement('input')).focus();
  }

  close() {
    this.close$.next();
    this.close$.complete();
  }

  afterClosed(): Observable<void> {
    return this.close$;
  }
}
