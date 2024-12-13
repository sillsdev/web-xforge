import { BreakpointObserver } from '@angular/cdk/layout';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Params, Route, Router, RouterModule } from '@angular/router';
import {
  InteractiveTranslatorFactory,
  LatinWordDetokenizer,
  LatinWordTokenizer,
  ProgressStatus,
  TranslationSources,
  WordAlignmentMatrix,
  WordGraph,
  WordGraphArc,
  createRange
} from '@sillsdev/machine';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { merge } from 'lodash-es';
import cloneDeep from 'lodash-es/cloneDeep';
import { CookieService } from 'ngx-cookie-service';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import Quill, { DeltaOperation, DeltaStatic, RangeStatic, Sources, StringMap } from 'quill';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { WritingSystem } from 'realtime-server/lib/esm/common/models/writing-system';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { RecursivePartial } from 'realtime-server/lib/esm/common/utils/type-utils';
import { BiblicalTerm } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { EditorTabGroupType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { NoteTag, SF_TAG_ICON } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import {
  AssignedUsers,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType,
  getNoteThreadDocId
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole, isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  createTestProject,
  createTestProjectProfile
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  SFProjectUserConfig,
  getSFProjectUserConfigDocId
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextType } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import * as RichText from 'rich-text';
import { BehaviorSubject, Observable, Subject, defer, firstValueFrom, of, take } from 'rxjs';
import { anything, capture, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { CONSOLE } from 'xforge-common/browser-globals';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { GenericDialogComponent, GenericDialogOptions } from 'xforge-common/generic-dialog/generic-dialog.component';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestBreakpointObserver } from 'xforge-common/test-breakpoint-observer';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { isBlink } from 'xforge-common/utils';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { NoteThreadDoc } from '../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { ParatextService } from '../../core/paratext.service';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { HttpClient } from '../../machine-api/http-client';
import { RemoteTranslationEngine } from '../../machine-api/remote-translation-engine';
import { SFTabsModule, TabFactoryService, TabGroup, TabMenuService } from '../../shared/sf-tab-group';
import { SharedModule } from '../../shared/shared.module';
import { getCombinedVerseTextDoc, paratextUsersFromRoles } from '../../shared/test-utils';
import { PRESENCE_EDITOR_ACTIVE_TIMEOUT } from '../../shared/text/text.component';
import { XmlUtils } from '../../shared/utils';
import { BiblicalTermsComponent } from '../biblical-terms/biblical-terms.component';
import { DraftGenerationService } from '../draft-generation/draft-generation.service';
import { TrainingProgressComponent } from '../training-progress/training-progress.component';
import { EditorDraftComponent } from './editor-draft/editor-draft.component';
import { EditorComponent, UPDATE_SUGGESTIONS_TIMEOUT } from './editor.component';
import { NoteDialogComponent, NoteDialogData, NoteDialogResult } from './note-dialog/note-dialog.component';
import { SuggestionsComponent } from './suggestions.component';
import { EditorTabFactoryService } from './tabs/editor-tab-factory.service';
import { EditorTabMenuService } from './tabs/editor-tab-menu.service';
import { EditorTabInfo } from './tabs/editor-tabs.types';
import { ACTIVE_EDIT_TIMEOUT } from './translate-metrics-session';

const mockedAuthService = mock(AuthService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedTranslationEngineService = mock(TranslationEngineService);
const mockedMatDialog = mock(MatDialog);
const mockedHttpClient = mock(HttpClient);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedParatextService = mock(ParatextService);
const mockedPermissionsService = mock(PermissionsService);

class MockComponent {}

const ROUTES: Route[] = [
  { path: 'projects/:projectId/translate/:bookId/:chapter', component: MockComponent },
  { path: 'projects/:projectId/translate/:bookId', component: MockComponent },
  { path: 'projects/:projectId/translate', component: MockComponent },
  { path: 'projects', component: MockComponent }
];

class MockConsole {
  log(val: any): void {
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
    declarations: [EditorComponent, SuggestionsComponent, TrainingProgressComponent, EditorDraftComponent],
    imports: [
      BiblicalTermsComponent,
      NoopAnimationsModule,
      RouterModule.forRoot(ROUTES),
      SharedModule,
      UICommonModule,
      TestTranslocoModule,
      TranslocoMarkupModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      SFTabsModule
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
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService },
      { provide: MatDialog, useMock: mockedMatDialog },
      { provide: BreakpointObserver, useClass: TestBreakpointObserver },
      { provide: HttpClient, useMock: mockedHttpClient },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: TabFactoryService, useValue: EditorTabFactoryService },
      { provide: TabMenuService, useValue: EditorTabMenuService },
      { provide: PermissionsService, useMock: mockedPermissionsService }
    ]
  }));

  it('sharing is only enabled for administrators', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.routeWithParams({ projectId: 'project02', bookId: 'MAT' });
    env.wait();
    // Null for non admins
    expect(env.sharingButton).toBeNull();

    // Truthy for admins
    env.setCurrentUser('user04');
    env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
    env.wait();
    expect(env.sharingButton).not.toBeNull();
    env.dispose();
  }));

  it('response to remote text deletion', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.routeWithParams({ projectId: 'project02', bookId: 'MAT' });
    env.wait();

    const dialogMessage = spyOn((env.component as any).dialogService, 'message').and.callThrough();
    const textDocId = new TextDocId('project02', 40, 1, 'target');
    env.deleteText(textDocId.toString());
    expect(dialogMessage).toHaveBeenCalledTimes(1);
    tick();
    expect(env.location.path()).toEqual('/projects/project02/translate');
    env.dispose();
  }));

  it('remote user config should not change segment', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectUserConfig({
      selectedBookNum: 40,
      selectedChapterNum: 2,
      selectedSegment: 'verse_2_1',
      selectedSegmentChecksum: 12345
    });
    env.wait();

    expect(env.component.target!.segmentRef).toEqual('verse_2_1');
    env.getProjectUserConfigDoc().submitJson0Op(op => op.set(puc => puc.selectedSegment, <string>'verse_2_2'), false);
    env.wait();
    expect(env.component.target!.segmentRef).toEqual('verse_2_1');

    env.dispose();
  }));

  it('shows warning to users in Chrome when translation is Korean, Japanese, or Chinese', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProject({
      writingSystem: { tag: 'ko' }
    });
    env.wait();

    expect(env.component.canEdit).toBe(true);
    expect(env.component.projectDoc?.data?.writingSystem.tag).toEqual('ko');
    if (isBlink()) {
      expect(env.component.writingSystemWarningBanner).toBe(true);
      expect(env.showWritingSystemWarningBanner).not.toBeNull();
    } else {
      expect(env.component.writingSystemWarningBanner).toBe(false);
      expect(env.showWritingSystemWarningBanner).toBeNull();
    }

    env.dispose();
  }));

  it('does not show warning to users when translation is not Korean, Japanese, or Chinese', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProject({
      writingSystem: { tag: 'en' }
    });
    env.wait();

    expect(env.component.canEdit).toBe(true);
    expect(env.component.projectDoc?.data?.writingSystem.tag).toEqual('en');
    expect(env.component.writingSystemWarningBanner).toBe(false);
    expect(env.showWritingSystemWarningBanner).toBeNull();
    discardPeriodicTasks();
  }));

  it('does not show warning to users if they do not have edit permissions on the selected book', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProject({
      writingSystem: { tag: 'ko' },
      translateConfig: defaultTranslateConfig
    });
    // user03 only has read permissions on Luke 1
    // As the editor is disabled, we do not need to show the writing system warning
    // The no_permission_edit_chapter message will be displayed instead
    env.setCurrentUser('user03');
    env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 1 });
    env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
    env.wait();

    expect(env.component.projectDoc?.data?.writingSystem.tag).toEqual('ko');
    expect(env.component.writingSystemWarningBanner).toBe(false);
    expect(env.showWritingSystemWarningBanner).toBeNull();
    expect(env.component.userHasGeneralEditRight).toBe(true);
    expect(env.component.hasChapterEditPermission).toBe(false);
    expect(env.component.canEdit).toBe(false);
    expect(env.component.showNoEditPermissionMessage).toBe(true);
    expect(env.noChapterEditPermissionMessage).not.toBeNull();

    discardPeriodicTasks();
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
      expect(env.component.verse).toBe('1');
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
          threadid: 'dataid05'
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
          threadid: 'dataid05'
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
          threadid: 'dataid05'
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

    it('should display the verse too long error', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_5' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      expect(env.component.showSuggestions).toBe(true);

      // Change to the long verse
      const range = env.component.target!.getSegmentRange('verse_1_6');
      env.targetEditor.setSelection(range!.index + range!.length, 0, 'user');
      env.wait();

      // Verify an error displayed
      expect(env.component.target!.segmentRef).toBe('verse_1_6');
      expect(env.component.showSuggestions).toBe(false);
      verify(mockedNoticeService.show(anything())).once();

      env.dispose();
    }));

    it('should not display the verse too long error if user has suggestions disabled', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedBookNum: 40,
        selectedChapterNum: 1,
        selectedSegment: 'verse_1_5',
        translationSuggestionsEnabled: false
      });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_5');
      // showSuggestions being true doesn't mean suggestions are shown, only that they could be if visible
      expect(env.component.showSuggestions).toBe(true);

      // Change to the long verse
      const range = env.component.target!.getSegmentRange('verse_1_6');
      env.targetEditor.setSelection(range!.index + range!.length, 0, 'user');
      env.wait();

      // Verify an error did not display
      expect(env.component.target!.segmentRef).toBe('verse_1_6');
      expect(env.component.showSuggestions).toBe(false);
      verify(mockedNoticeService.show(anything())).never();

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
      verify(env.mockedRemoteTranslationEngine.trainSegment(anything(), 'target: chapter 1, verse 5', true)).once();

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

      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.bookName).toEqual('Mark');
      expect(env.component.target!.segmentRef).toEqual('verse_1_5');
      verify(env.mockedRemoteTranslationEngine.trainSegment(anything(), anything(), anything())).never();

      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.target!.segmentRef).toEqual('verse_1_5');
      const range = env.component.target!.getSegmentRange('verse_1_1');
      env.targetEditor.setSelection(range!.index, 0, 'user');
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.trainSegment(anything(), 'target: chapter 1, verse 5', true)).once();

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
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
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
      env.routeWithParams({ projectId: 'project02', bookId: 'MAT' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(env.bookName).toEqual('Mark');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.target!.segmentRef).toEqual('verse_1_1');
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      env.dispose();
    }));

    it('change chapters', fakeAsync(() => {
      const env = new TestEnvironment();
      env.ngZone.run(() => {
        env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
        env.wait();
        expect(env.component.chapter).toBe(1);
        expect(env.component.target!.segmentRef).toBe('verse_1_1');
        verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

        resetCalls(env.mockedRemoteTranslationEngine);
        env.component.chapter = 2;
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '2' });
        env.wait();
        const verseText = env.component.target!.getSegmentText('verse_2_1');
        expect(verseText).toBe('target: chapter 2, verse 1.');
        expect(env.component.target!.segmentRef).toEqual('verse_1_1');
        verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).never();

        resetCalls(env.mockedRemoteTranslationEngine);
        env.component.chapter = 1;
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '1' });
        env.wait();
        expect(env.component.target!.segmentRef).toBe('verse_1_1');
        verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      });
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
      expect(env.trainingProgress).toBeNull();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.trainingProgressSpinner).not.toBeNull();
      env.updateTrainingProgress(1);
      expect(env.trainingCompleteIcon).not.toBeNull();
      expect(env.trainingProgressSpinner).toBeNull();
      env.completeTrainingProgress();
      expect(env.trainingProgress).not.toBeNull();
      tick(5000);
      env.wait();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      expect(env.trainingProgress).toBeNull();
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.trainingProgressSpinner).not.toBeNull();

      env.dispose();
    }));

    it('close training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.trainingProgress).toBeNull();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.trainingProgressSpinner).not.toBeNull();
      env.clickTrainingProgressCloseButton();
      expect(env.trainingProgress).toBeNull();
      env.updateTrainingProgress(1);
      env.completeTrainingProgress();
      env.wait();
      verify(mockedNoticeService.show(anything())).once();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();

      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.trainingProgressSpinner).not.toBeNull();

      env.dispose();
    }));

    it('error in training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segmentRef).toBe('verse_1_1');
      expect(env.trainingProgress).toBeNull();
      verify(env.mockedRemoteTranslationEngine.getWordGraph(anything())).once();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();

      resetCalls(env.mockedRemoteTranslationEngine);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.trainingProgressSpinner).not.toBeNull();
      env.throwTrainingProgressError();
      expect(env.trainingProgress).toBeNull();

      tick(30000);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress).not.toBeNull();
      expect(env.trainingProgressSpinner).not.toBeNull();

      env.dispose();
    }));

    it('no source', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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

    it('source correctly displays when text changes', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject(
        {
          texts: [
            {
              bookNum: 44,
              chapters: [
                {
                  number: 1,
                  lastVerse: 3,
                  isValid: true,
                  permissions: {
                    user01: TextInfoPermission.Read
                  }
                }
              ],
              hasSource: false,
              permissions: {
                user01: TextInfoPermission.Read
              }
            }
          ]
        },
        'project02'
      );
      env.setProjectUserConfig();
      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.bookName).toEqual('Matthew');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      let selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      expect(env.isSourceAreaHidden).toBe(true);

      env.routeWithParams({ projectId: 'project01', bookId: 'ACT' });
      env.wait();
      expect(env.bookName).toEqual('Acts');
      expect(env.component.chapter).toBe(1);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      expect(env.isSourceAreaHidden).toBe(false);

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
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      env.changeUserRole(projectId, userId, SFProjectRole.Viewer);
      env.setDataInSync(projectId, true, false);
      env.setDataInSync(projectId, false, false);
      env.wait();
      resetCalls(env.mockedRemoteTranslationEngine);

      projectDoc = env.getProjectDoc(projectId);
      expect(projectDoc.data?.userRoles[userId]).toBe(SFProjectRole.Viewer);
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
      when(mockedSFProjectService.getProfile('resource01')).thenResolve({
        id: 'resource01',
        data: createTestProjectProfile()
      } as SFProjectProfileDoc);

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
      env.routeWithParams({ projectId: 'project01', bookId: 'ACT' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'JHN' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
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

    it('first chapter is missing', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.setProjectUserConfig();
      env.routeWithParams({ projectId: 'project01', bookId: 'ROM' });
      env.wait();
      expect(env.bookName).toEqual('Romans');
      expect(env.component.chapter).toBe(2);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
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
      expect(contents.ops![verse2SegmentIndex].attributes)
        .withContext('typeCharacters verse2SegmentIndex attributes')
        .toEqual({
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
      expect(contents.ops![verse2SegmentIndex].attributes)
        .withContext('triggerUndo verse2SegmentIndex attributes')
        .toEqual({
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
      expect(contents.ops![verse2SegmentIndex].attributes)
        .withContext('triggerRedo verse2SegmentIndex attributes')
        .toEqual({
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
      env.typeCharacters('t', { 'commenter-selection': true });
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
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      const attributes: StringMap = textDoc.data!.ops![5].attributes!;
      expect(Object.keys(attributes)).toEqual(['segment']);
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
      expect(verse1Note.getAttribute('style')).toEqual('--icon-file: url(/assets/icons/TagIcons/01flag1.png);');
      expect(verse1Note.getAttribute('title')).toEqual('Note from user01\n--- 2 more note(s) ---');
      let contents = env.targetEditor.getContents();
      expect(contents.ops![3].insert).toEqual('target: ');
      expect(contents.ops![4].attributes!['iconsrc']).toEqual('--icon-file: url(/assets/icons/TagIcons/01flag1.png);');

      // three notes in the segment on verse 3
      const noteVerse3: NodeListOf<Element> = env.getSegmentElement('verse_1_3')!.querySelectorAll('display-note')!;
      expect(noteVerse3.length).toEqual(3);

      const blankSegmentNote = env.getSegmentElement('verse_1_2')!.querySelector('display-note') as HTMLElement;
      expect(blankSegmentNote.getAttribute('style')).toEqual('--icon-file: url(/assets/icons/TagIcons/01flag1.png);');
      expect(blankSegmentNote.getAttribute('title')).toEqual('Note from user01');

      const segmentEndNote = env.getSegmentElement('verse_1_4')!.querySelector('display-note') as HTMLElement;
      expect(segmentEndNote).not.toBeNull();

      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      expect(combinedVerseNote!.getAttribute('data-thread-id')).toEqual('dataid08');
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
        '--icon-file: url(/assets/icons/TagIcons/01flag1.png);'
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

      let doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const noteStart1 = env.component.target!.getSegmentRange('verse_1_1')!.index + doc.data!.position.start;
      doc = env.getNoteThreadDoc('project01', 'dataid02');
      const noteStart2 = env.component.target!.getSegmentRange('verse_1_3')!.index + doc.data!.position.start;
      doc = env.getNoteThreadDoc('project01', 'dataid03');
      // Add 1 for the one previous embed in the segment
      const noteStart3 = env.component.target!.getSegmentRange('verse_1_3')!.index + doc.data!.position.start + 1;
      doc = env.getNoteThreadDoc('project01', 'dataid04');
      // Add 2 for the two previous embeds
      const noteStart4 = env.component.target!.getSegmentRange('verse_1_3')!.index + doc.data!.position.start + 2;
      doc = env.getNoteThreadDoc('project01', 'dataid05');
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
      const note2Position = env.getNoteThreadEditorPosition('dataid02');
      expect(range.index).toEqual(note2Position);
      const noteThreadDoc3 = env.getNoteThreadDoc('project01', 'dataid03');
      const noteThread3StartPosition = 20;
      expect(noteThreadDoc3.data!.position).toEqual({ start: noteThread3StartPosition, length: 7 });
      const note3Position = env.getNoteThreadEditorPosition('dataid03');
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

      const note7Position = env.getNoteThreadEditorPosition('dataid07');
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
      env.reattachNote('project01', 'dataid04', 'MAT 1:4', position);

      // SUT
      env.wait();
      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_4')!;
      const note4Position: number = env.getNoteThreadEditorPosition('dataid04');
      const note4Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid04')!;
      const note4Anchor: TextAnchor = note4Doc.data!.position;
      expect(note4Anchor).toEqual(position);
      expect(note4Position).toEqual(range.index + position.start);
      // The original note thread was on verse 3
      expect(note4Doc.data!.verseRef.verseNum).toEqual(3);
      env.dispose();
    }));

    it('shows an invalid reattached note in original location', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      // invalid reattachment string
      env.reattachNote('project01', 'dataid04', 'MAT 1:4  invalid note  error', undefined, true);

      // SUT
      env.wait();
      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_3')!;
      const note4Position: number = env.getNoteThreadEditorPosition('dataid04');
      const note4Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid04')!;
      expect(note4Position).toEqual(range.index + 1);
      // The note thread is on verse 3
      expect(note4Doc.data!.verseRef.verseNum).toEqual(3);
      env.dispose();
    }));

    it('does not display conflict notes', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.convertToConflictNote('project01', 'dataid02');
      env.wait();

      expect(env.getNoteThreadIconElement('verse_1_3', 'dataid02')).toBeNull();
      env.dispose();
    }));

    it('shows note on verse with letter', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.addParatextNoteThread(6, 'LUK 1:6a', '', { start: 0, length: 0 }, ['user01']);
      env.addParatextNoteThread(7, 'LUK 1:6b', '', { start: 0, length: 0 }, ['user01']);
      env.wait();

      expect(env.getNoteThreadIconElement('verse_1_6a', 'dataid06')).not.toBeNull();
      expect(env.getNoteThreadIconElement('verse_1_6b', 'dataid07')).not.toBeNull();
      env.dispose();
    }));

    it('highlights note icons when new content is unread', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user02');
      env.setProjectUserConfig({ noteRefsRead: ['thread01_note0', 'thread02_note0'] });
      env.wait();

      expect(env.isNoteIconHighlighted('dataid01')).toBe(true);
      expect(env.isNoteIconHighlighted('dataid02')).toBe(false);
      expect(env.isNoteIconHighlighted('dataid03')).toBe(true);
      expect(env.isNoteIconHighlighted('dataid04')).toBe(true);
      expect(env.isNoteIconHighlighted('dataid05')).toBe(true);

      let puc: SFProjectUserConfigDoc = env.getProjectUserConfigDoc('user01');
      expect(puc.data!.noteRefsRead).not.toContain('thread01_note1');
      expect(puc.data!.noteRefsRead).not.toContain('thread01_note2');

      let iconElement: HTMLElement = env.getNoteThreadIconElement('verse_1_1', 'dataid01')!;
      iconElement.click();
      env.wait();
      puc = env.getProjectUserConfigDoc('user02');
      expect(puc.data!.noteRefsRead).toContain('thread01_note1');
      expect(puc.data!.noteRefsRead).toContain('thread01_note2');
      expect(env.isNoteIconHighlighted('dataid01')).toBe(false);

      expect(puc.data!.noteRefsRead).toContain('thread02_note0');
      iconElement = env.getNoteThreadIconElement('verse_1_3', 'dataid02')!;
      iconElement.click();
      env.wait();
      puc = env.getProjectUserConfigDoc('user02');
      expect(puc.data!.noteRefsRead).toContain('thread02_note0');
      expect(puc.data!.noteRefsRead.filter(ref => ref === 'thread02_note0').length).toEqual(1);
      expect(env.isNoteIconHighlighted('dataid02')).toBe(false);
      env.dispose();
    }));

    it('should update note position when inserting text', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();

      let noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // edit before start position
      env.targetEditor.setSelection(5, 0, 'user');
      const text = ' add text ';
      const length = text.length;
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 + length, length: 9 });

      // edit at note position
      let notePosition = env.getNoteThreadEditorPosition('dataid01');
      env.targetEditor.setSelection(notePosition, 0, 'user');
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: length * 2 + 8, length: 9 });

      // edit immediately after note
      notePosition = env.getNoteThreadEditorPosition('dataid01');
      env.targetEditor.setSelection(notePosition + 1, 0, 'user');
      env.typeCharacters(text);
      expect(noteThreadDoc.data!.position).toEqual({ start: length * 2 + 8, length: 9 + length });

      // edit immediately after verse note
      noteThreadDoc = env.getNoteThreadDoc('project01', 'dataid02');
      notePosition = env.getNoteThreadEditorPosition('dataid02');
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

      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // delete text before note
      const length = 3;
      const noteEmbedLength = 1;
      let notePosition = env.getNoteThreadEditorPosition('dataid01');
      env.targetEditor.setSelection(notePosition - length, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 - length, length: 9 });

      // delete text at the beginning of note text
      notePosition = env.getNoteThreadEditorPosition('dataid01');
      env.targetEditor.setSelection(notePosition + noteEmbedLength, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 8 - length, length: 9 - length });

      // delete text right after note text
      notePosition = env.getNoteThreadEditorPosition('dataid01');
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

      const priorThreadId = 'dataid02';
      const priorThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', priorThreadId);
      const laterThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid04');
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
      const noteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });
      env.typeCharacters('t');
      // 4 characters deleted and 1 character inserted
      expect(Array.from(env.component.target!.embeddedElements.values())).toEqual([10, 31, 52, 53, 91]);
      expect(noteThreadDoc.data!.position).toEqual({ start: 7, length: 7 });
      expect(textDoc.data!.ops![3].insert).toBe('targettapter 1, verse 1.');

      // switch to a different text
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      expect(noteThreadDoc.data!.position).toEqual({ start: 7, length: 7 });

      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(Array.from(env.component!.target!.embeddedElements.values())).toEqual([10, 31, 52, 53, 91]);
      env.dispose();
    }));

    it('should re-embed deleted note and allow user to open note dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const position: number = env.getNoteThreadEditorPosition('dataid03');
      const length = 9;
      // $target: chapter 1, |->$$verse 3<-|.
      env.targetEditor.setSelection(position, length, 'api');
      env.deleteCharacters();
      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_3')!;
      expect(env.getNoteThreadEditorPosition('dataid02')).toEqual(range.index);
      expect(env.getNoteThreadEditorPosition('dataid03')).toEqual(range.index + 1);
      expect(env.getNoteThreadEditorPosition('dataid04')).toEqual(range.index + 2);

      for (let i = 0; i <= 2; i++) {
        const noteThreadId: number = i + 2;
        const note: HTMLElement = env.getNoteThreadIconElement('verse_1_3', `dataid0${noteThreadId}`)!;
        note.click();
        env.wait();
        verify(mockedMatDialog.open(NoteDialogComponent, anything())).times(i + 1);
      }
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
      const note1 = env.getNoteThreadDoc('project01', 'dataid01');
      expect(note1.data!.position).toEqual({ start: 8, length: 7 });
      const note2 = env.getNoteThreadDoc('project01', 'dataid06');
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

      const noteThreadDoc = env.getNoteThreadDoc('project01', 'dataid05');
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

      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });
      // delete text that spans across the end boundary
      const notePosition = env.getNoteThreadEditorPosition('dataid01');
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

      const thread1Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const thread1Position = env.getNoteThreadEditorPosition('dataid01');
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
      const noteThread3Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid03');
      expect(noteThread3Doc.data!.position).toEqual({ start: 20, length: 7 });
      const index = env.getNoteThreadEditorPosition('dataid07');
      env.targetEditor.setSelection(index + 1, 0, 'user');
      env.typeCharacters('c');
      expect(noteThread3Doc.data!.position).toEqual({ start: 20, length: 7 });
      const noteThread7Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', `dataid07`);
      expect(noteThread7Doc.data!.position).toEqual({ start: 27, length: 1 + 'c'.length });

      env.dispose();
    }));

    it('should default a note to the beginning if all text is deleted', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      let noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // delete the entire text anchor
      let notePosition = env.getNoteThreadEditorPosition('dataid01');
      let length = 9;
      env.targetEditor.setSelection(notePosition + 1, length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });

      // delete text that includes the entire text anchor
      noteThreadDoc = env.getNoteThreadDoc('project01', 'dataid03');
      expect(noteThreadDoc.data!.position).toEqual({ start: 20, length: 7 });
      notePosition = env.getNoteThreadEditorPosition('dataid03');
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

      const thread3Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid03');
      const thread3AnchorLength = 7;
      const thread4AnchorLength = 5;
      expect(thread3Doc.data!.position).toEqual({ start: 20, length: thread3AnchorLength });
      const otherNoteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid04');
      expect(otherNoteThreadDoc.data!.position).toEqual({ start: 20, length: thread4AnchorLength });
      const verseNoteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid02');
      expect(verseNoteThreadDoc.data!.position).toEqual({ start: 0, length: 0 });
      // edit before paratext note
      let thread3Position = env.getNoteThreadEditorPosition('dataid03');
      env.targetEditor.setSelection(thread3Position, 0, 'user');
      env.wait();
      const textBeforeNote = 'add text before ';
      const length1 = textBeforeNote.length;
      env.typeCharacters(textBeforeNote);
      expect(thread3Doc.data!.position).toEqual({ start: 20 + length1, length: thread3AnchorLength });
      expect(otherNoteThreadDoc.data!.position).toEqual({ start: 20 + length1, length: thread4AnchorLength });

      // edit within note selection start
      thread3Position = env.getNoteThreadEditorPosition('dataid03');
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
      thread3Position = env.getNoteThreadEditorPosition('dataid03');
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

    it('update note thread anchors when multiple edits within a verse', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const origNoteAnchor: TextAnchor = { start: 8, length: 9 };
      expect(noteThreadDoc.data!.position).toEqual(origNoteAnchor);

      const notePosition: number = env.getNoteThreadEditorPosition('dataid01');
      const deleteStart: number = notePosition + 1;
      const text = 'chap';

      //  target: $chapter 1, verse 1.
      // move this ----    here ^
      const deleteOps: DeltaOperation[] = [{ retain: deleteStart }, { delete: text.length }];
      const deleteDelta: DeltaStatic = new Delta(deleteOps);
      env.targetEditor.setSelection(deleteStart, text.length);
      // simulate a drag and drop operation, which include a delete and an insert operation
      env.targetEditor.updateContents(deleteDelta, 'user');
      tick();
      env.fixture.detectChanges();
      const insertStart: number = notePosition + 'ter 1, ver'.length;
      const insertOps: DeltaOperation[] = [{ retain: insertStart }, { insert: text }];
      const insertDelta: DeltaStatic = new Delta(insertOps);
      env.targetEditor.updateContents(insertDelta, 'user');

      env.wait();
      const expectedNoteAnchor: TextAnchor = {
        start: origNoteAnchor.start,
        length: origNoteAnchor.length - text.length
      };
      expect(noteThreadDoc.data!.position).toEqual(expectedNoteAnchor);
      // SUT
      env.triggerUndo();
      // this triggers undoing the drag and drop in one delta
      expect(noteThreadDoc.data!.position).toEqual(origNoteAnchor);
      env.dispose();
    }));

    it('updates note anchor for non-verse segments', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      const origThread06Pos: TextAnchor = { start: 38, length: 7 };
      env.addParatextNoteThread(6, 'LUK 1:2-3', 'section', origThread06Pos, ['user01']);
      env.wait();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      const textBeforeNote = 'Text in ';
      let range: RangeStatic = env.component.target!.getSegmentRange('s_2')!;
      let notePosition: number = env.getNoteThreadEditorPosition('dataid06');
      expect(range.index + textBeforeNote.length).toEqual(notePosition);
      const thread06Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid06');
      let textAnchor: TextAnchor = thread06Doc.data!.position;
      expect(textAnchor).toEqual(origThread06Pos);

      const verse2_3Range: RangeStatic = env.component.target!.getSegmentRange('verse_1_2-3')!;
      env.targetEditor.setSelection(verse2_3Range.index + verse2_3Range.length);
      env.wait();
      env.typeCharacters('T');
      env.wait();
      textAnchor = thread06Doc.data!.position;
      expect(textAnchor).toEqual({ start: origThread06Pos.start + 1, length: origThread06Pos.length });
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
      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid05');
      expect(noteThreadDoc.data!.position).toEqual({ start: 28, length: 9 });
      let verse4p1Index = env.component.target!.getSegmentRange('verse_1_4/p_1')!.index;
      expect(env.getNoteThreadEditorPosition('dataid05')).toEqual(verse4p1Index);
      // user deletes all of the text in segment before
      const range = env.component.target!.getSegmentRange('verse_1_4')!;
      env.targetEditor.setSelection(range.index, range.length, 'user');
      env.deleteCharacters();
      expect(noteThreadDoc.data!.position).toEqual({ start: 2, length: 9 });

      // switch to a new book and back
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      let note5Index: number = env.getNoteThreadEditorPosition('dataid05');
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
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(noteThreadDoc.data!.position).toEqual({ start: nextSegmentLength + text.length, length: 9 });
      verse4p1Index = env.component.target!.getSegmentRange('verse_1_4/p_1')!.index;
      note5Index = env.getNoteThreadEditorPosition('dataid05');
      expect(note5Index).toEqual(verse4p1Index);
      env.dispose();
    }));

    it('remote edits correctly applied to editor', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      expect(noteThreadDoc.data!.position).toEqual({ start: 8, length: 9 });

      // The remote user inserts text after the thread01 note
      let notePosition: number = env.getNoteThreadEditorPosition('dataid01');
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
      notePosition = env.getNoteThreadEditorPosition('dataid02');
      // 1 note from verse 1, and 1 in verse 3 before the selection point
      noteCountBeforePosition = 2;
      remoteEditPositionAfterNote = 5;
      remoteEditTextPos = env.getRemoteEditPosition(notePosition, remoteEditPositionAfterNote, noteCountBeforePosition);
      const originalNotePosInVerse: number = env.getNoteThreadDoc('project01', 'dataid03').data!.position.start;
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
      expect(env.getNoteThreadDoc('project01', 'dataid03').data!.position.start).toEqual(originalNotePosInVerse);
      expect(env.getNoteThreadDoc('project01', 'dataid04').data!.position.start).toEqual(originalNotePosInVerse);
      const verse3Index: number = env.component.target!.getSegmentRange('verse_1_3')!.index;
      // The note is re-embedded at the position in the note thread doc.
      // Applying remote changes must not affect text anchors
      let notesBefore: number = 1;
      expect(env.getNoteThreadEditorPosition('dataid03')).toEqual(verse3Index + originalNotePosInVerse + notesBefore);
      notesBefore = 2;
      expect(env.getNoteThreadEditorPosition('dataid04')).toEqual(verse3Index + originalNotePosInVerse + notesBefore);
      env.dispose();
    }));

    it('remote edits do not affect note thread text anchors', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const noteThread1Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const noteThread4Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid04');
      const originalNoteThread1TextPos: TextAnchor = noteThread1Doc.data!.position;
      const originalNoteThread4TextPos: TextAnchor = noteThread4Doc.data!.position;
      expect(originalNoteThread1TextPos).toEqual({ start: 8, length: 9 });
      expect(originalNoteThread4TextPos).toEqual({ start: 20, length: 5 });

      // simulate text changes at current segment
      let notePosition: number = env.getNoteThreadEditorPosition('dataid04');
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
      notePosition = env.getNoteThreadEditorPosition('dataid01');
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
      const note1Doc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const anchor: TextAnchor = { start: 8 + insert.length, length: 12 };
      note1Doc.submitJson0Op(op => op.set(nt => nt.position, anchor));

      // SUT 3
      env.wait();
      expect(env.component.target!.getSegmentText('verse_1_1')).toEqual('target: ' + insert + 'cdefhapter 1, verse 1.');
      const range: RangeStatic = env.component.target!.getSegmentRange('verse_1_1')!;
      expect(env.getNoteThreadEditorPosition('dataid01')).toEqual(range.index + anchor.start);
      const contents = env.targetEditor.getContents(range.index, range.length);
      expect(contents.ops![0].insert).toEqual('target: ' + insert);
      expect(contents.ops![0].attributes!['text-anchor']).toBeUndefined();

      // simulate text changes just after a note embed
      notePosition = env.getNoteThreadEditorPosition('dataid01');
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
      expect(env.getNoteThreadEditorPosition('dataid01')).toEqual(notePosition);
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
      const notePosition: number = env.getNoteThreadEditorPosition('dataid02');
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
      expect(env.getNoteThreadEditorPosition('dataid02')).toEqual(notePosition);
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
      const noteThread1: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const noteThread1Anchor: TextAnchor = { start: 8, length: 9 };
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      expect(textDoc.data!.ops![3].insert).toEqual('target: chapter 1, verse 1.');
      const note1Position: number = env.getNoteThreadEditorPosition('dataid01');
      // target: |->$<-|chapter 1, $verse 1.
      env.targetEditor.setSelection(note1Position, 1, 'user');
      env.deleteCharacters();
      const positionAfterDelete: number = env.getNoteThreadEditorPosition('dataid01');
      expect(positionAfterDelete).toEqual(note1Position);
      env.triggerUndo();
      expect(env.getNoteThreadEditorPosition('dataid01')).toEqual(note1Position);
      expect(env.component.target!.getSegmentText('verse_1_1')).toBe('target: chapter 1, verse 1.');
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);

      // undo deleting note and context
      let deleteLength: number = 5;
      let beforeNoteLength: number = 2;
      // target|->: $ch<-|apter 1, $verse 1.
      env.targetEditor.setSelection(note1Position - beforeNoteLength, deleteLength, 'user');
      env.deleteCharacters();
      let newNotePosition: number = env.getNoteThreadEditorPosition('dataid01');
      expect(newNotePosition).toEqual(note1Position - beforeNoteLength);
      env.triggerUndo();
      expect(env.getNoteThreadEditorPosition('dataid01')).toEqual(note1Position);
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
      newNotePosition = env.getNoteThreadEditorPosition('dataid01');
      const range = env.component.target!.getSegmentRange('verse_1_1')!;
      // note moves to the beginning of the verse
      expect(newNotePosition).toEqual(range.index);
      env.triggerUndo();
      expect(noteThread1.data!.position).toEqual({ start: 8, length: 9 });

      // undo deleting a second note in verse does not affect first note
      const note6Position: number = env.getNoteThreadEditorPosition('dataid06');
      const noteThread6: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid06');
      deleteLength = 3;
      const text = 'abc';
      // target: $chapter 1, |->$ve<-|rse 1.
      env.targetEditor.setSelection(note6Position, deleteLength, 'api');
      env.typeCharacters(text);
      newNotePosition = env.getNoteThreadEditorPosition('dataid06');
      expect(newNotePosition).toEqual(note6Position + text.length);
      env.triggerUndo();
      expect(env.getNoteThreadEditorPosition('dataid06')).toEqual(note6Position);
      expect(noteThread6.data!.position).toEqual(noteThread6Anchor);
      expect(noteThread1.data!.position).toEqual(noteThread1Anchor);
      expect(textDoc.data!.ops![3].insert).toEqual('target: chapter 1, verse 1.');

      // undo deleting multiple notes
      const noteThread3: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid03');
      const noteThread4: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid04');
      const noteThread3Anchor: TextAnchor = { start: 20, length: 7 };
      const noteThread4Anchor: TextAnchor = { start: 20, length: 5 };
      expect(noteThread3.data!.position).toEqual(noteThread3Anchor);
      expect(noteThread4.data!.position).toEqual(noteThread4Anchor);
      expect(textDoc.data!.ops![8].insert).toEqual('target: chapter 1, verse 3.');
      const note3Position: number = env.getNoteThreadEditorPosition('dataid03');
      const note4Position: number = env.getNoteThreadEditorPosition('dataid04');
      deleteLength = 6;
      // $target: chapter 1|->, $$ve<-|rse 3.
      env.targetEditor.setSelection(note3Position - beforeNoteLength, deleteLength, 'api');
      env.deleteCharacters();
      newNotePosition = env.getNoteThreadEditorPosition('dataid03');
      expect(newNotePosition).toEqual(note3Position - beforeNoteLength);
      newNotePosition = env.getNoteThreadEditorPosition('dataid04');
      expect(newNotePosition).toEqual(note4Position - beforeNoteLength);
      env.triggerUndo();
      env.wait();
      expect(env.getNoteThreadEditorPosition('dataid03')).toEqual(note3Position);
      expect(env.getNoteThreadEditorPosition('dataid04')).toEqual(note4Position);
      expect(noteThread3.data!.position).toEqual(noteThread3Anchor);
      expect(noteThread4.data!.position).toEqual(noteThread4Anchor);
      expect(textDoc.data!.ops![8].insert).toEqual('target: chapter 1, verse 3.');
      env.dispose();
    }));

    it('note icon is changed after remote update', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const threadDataId: string = 'dataid01';
      const projectId: string = 'project01';
      const currentIconTag: string = '01flag1';
      const newIconTag: string = '02tag1';

      const verse1Segment: HTMLElement = env.getSegmentElement('verse_1_1')!;
      let verse1Note = verse1Segment.querySelector('display-note') as HTMLElement;
      expect(verse1Note).not.toBeNull();
      expect(verse1Note.getAttribute('style')).toEqual(
        `--icon-file: url(/assets/icons/TagIcons/${currentIconTag}.png);`
      );

      // Update the last note on the thread as that is the icon displayed
      const noteThread: NoteThreadDoc = env.getNoteThreadDoc(projectId, threadDataId);
      const index: number = noteThread.data!.notes.length - 1;
      const note: Note = noteThread.data!.notes[index];
      note.tagId = 2;
      noteThread.submitJson0Op(op => op.insert(nt => nt.notes, index, note), false);
      verse1Note = verse1Segment.querySelector('display-note') as HTMLElement;
      expect(verse1Note.getAttribute('style')).toEqual(`--icon-file: url(/assets/icons/TagIcons/${newIconTag}.png);`);
      env.dispose();
    }));

    it('note dialog appears after undo delete-a-note', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      let iconElement02: HTMLElement = env.getNoteThreadIconElement('verse_1_3', 'dataid02')!;
      iconElement02.click();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      let iconElement03: HTMLElement = env.getNoteThreadIconElement('verse_1_3', 'dataid03')!;
      iconElement03.click();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).twice();

      const notePosition: number = env.getNoteThreadEditorPosition('dataid02');
      const selectionIndex: number = notePosition + 1;
      env.targetEditor.setSelection(selectionIndex, 'user');
      env.wait();
      env.backspace();

      // SUT
      env.triggerUndo();
      iconElement02 = env.getNoteThreadIconElement('verse_1_3', 'dataid02')!;
      iconElement02.click();
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).thrice();
      expect(iconElement02.parentElement!.tagName.toLowerCase()).toBe('display-text-anchor');
      iconElement03 = env.getNoteThreadIconElement('verse_1_3', 'dataid03')!;
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
      const iconElement: HTMLElement = env.getNoteThreadIconElement(segmentRef, 'dataid02')!;
      iconElement.click();
      const element: HTMLElement = env.targetTextEditor.querySelector(
        'usx-segment[data-segment="' + segmentRef + '"]'
      )!;
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      env.wait();
      expect(env.activeElementTagName).toBe('DIV');
      expect(element.classList).withContext('dialog opened').toContain('highlight-segment');
      mockedMatDialog.closeAll();
      expect(element.classList).withContext('dialog closed').toContain('highlight-segment');
      env.dispose();
    }));

    it('shows only note threads published in Scripture Forge', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      const threadId: string = 'thread06';
      env.addParatextNoteThread(
        threadId,
        'MAT 1:4',
        'Paragraph break.',
        { start: 0, length: 0 },
        ['user05'],
        NoteStatus.Todo,
        '',
        true
      );
      env.wait();

      const noteThreadElem: HTMLElement | null = env.getNoteThreadIconElement('verse_1_1', 'dataid01');
      expect(noteThreadElem).toBeNull();
      const sfNoteElem: HTMLElement | null = env.getNoteThreadIconElement('verse_1_4', 'dataidthread06');
      expect(sfNoteElem).toBeTruthy();
      env.dispose();
    }));

    it('shows insert note button for users with permission', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      // user02 does not have read permission on the text
      const usersWhoCanInsertNotes = ['user01', 'user03', 'user04', 'user05'];
      for (const user of usersWhoCanInsertNotes) {
        env.setCurrentUser(user);
        tick();
        env.fixture.detectChanges();
        expect(env.insertNoteFab).toBeTruthy();
      }

      const usersWhoCannotInsertNotes = ['user06', 'user07'];
      for (const user of usersWhoCannotInsertNotes) {
        env.setCurrentUser(user);
        tick();
        env.fixture.detectChanges();
        expect(env.insertNoteFab).toBeNull();
      }
      env.dispose();
    }));

    it('shows insert note button using bottom sheet for mobile viewport', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.setCurrentUser('user05');
      env.wait();

      // Initial setup will state FALSE when checking for mobile viewports
      let verseSegment: HTMLElement = env.getSegmentElement('verse_1_3')!;
      verseSegment.click();
      env.wait();
      expect(env.insertNoteFabMobile).toBeNull();

      // Allow check for mobile viewports to return TRUE
      env.breakpointObserver.matchedResult = true;
      verseSegment = env.getSegmentElement('verse_1_2')!;
      verseSegment.click();
      env.wait();
      expect(env.insertNoteFabMobile).toBeTruthy();
      expect(env.mobileNoteTextArea).toBeFalsy();
      env.insertNoteFabMobile!.click();
      env.wait();
      expect(env.mobileNoteTextArea).toBeTruthy();
      // Close the bottom sheet
      verseSegment = env.getSegmentElement('verse_1_2')!;
      verseSegment.click();
      env.wait();

      env.dispose();
    }));

    it('shows insert new note from mobile viewport', fakeAsync(() => {
      const content: string = 'content in the thread';
      const userId: string = 'user05';
      const segmentRef: string = 'verse_1_2';
      const verseRef: VerseRef = new VerseRef('MAT', '1', '2');
      const env = new TestEnvironment();
      env.setProjectUserConfig({
        selectedBookNum: verseRef.bookNum,
        selectedChapterNum: verseRef.chapterNum,
        selectedSegment: 'verse_1_3'
      });
      env.setCurrentUser(userId);
      env.wait();

      // Allow check for mobile viewports to return TRUE
      env.breakpointObserver.matchedResult = true;
      env.clickSegmentRef(segmentRef);
      env.insertNoteFabMobile!.click();
      env.wait();
      env.component.mobileNoteControl.setValue(content);
      env.saveMobileNoteButton!.click();
      env.wait();
      const [, noteThread] = capture(mockedSFProjectService.createNoteThread).last();
      expect(noteThread.verseRef).toEqual(fromVerseRef(verseRef));
      expect(noteThread.publishedToSF).toBe(true);
      expect(noteThread.notes[0].ownerRef).toEqual(userId);
      expect(noteThread.notes[0].content).toEqual(content);

      env.dispose();
    }));

    it('shows fab for users with editing rights but uses bottom sheet for adding new notes on mobile viewport', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.setCurrentUser('user04');
      env.wait();

      // Allow check for mobile viewports to return TRUE
      env.breakpointObserver.matchedResult = true;
      env.clickSegmentRef('verse_1_2');
      expect(env.insertNoteFabMobile).toBeFalsy();
      expect(env.insertNoteFab).toBeTruthy();
      env.insertNoteFab.nativeElement.click();
      env.wait();
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('hidden');
      expect(env.mobileNoteTextArea).toBeTruthy();
      expect(env.component.currentSegmentReference).toEqual('Matthew 1:2');
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).never();
      // Close the bottom sheet
      env.bottomSheetCloseButton!.click();
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('visible');
      env.wait();

      env.dispose();
    }));

    it('shows current selected verse on bottom sheet', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();

      // Allow check for mobile viewports to return TRUE
      env.breakpointObserver.matchedResult = true;
      env.clickSegmentRef('verse_1_1');
      env.wait();
      expect(env.insertNoteFabMobile).toBeTruthy();
      env.insertNoteFabMobile!.click();
      expect(env.bottomSheetVerseReference?.textContent).toEqual('Luke 1:1');
      const content = 'commenter leaving mobile note';
      env.component.mobileNoteControl.setValue(content);
      env.saveMobileNoteButton!.click();
      env.wait();
      const [, noteThread] = capture(mockedSFProjectService.createNoteThread).last();
      expect(noteThread.verseRef).toEqual(fromVerseRef(new VerseRef('LUK 1:1')));
      expect(noteThread.notes[0].content).toEqual(content);
      env.dispose();
    }));

    it('can accept xml reserved symbols as note content', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();

      // Allow check for mobile viewports to return TRUE
      env.breakpointObserver.matchedResult = true;
      env.clickSegmentRef('verse_1_1');
      env.wait();
      expect(env.insertNoteFabMobile).toBeTruthy();
      env.insertNoteFabMobile!.click();
      expect(env.bottomSheetVerseReference?.textContent).toEqual('Luke 1:1');
      const content = 'mobile <note> with xml symbols';
      env.component.mobileNoteControl.setValue(content);
      env.saveMobileNoteButton!.click();
      env.wait();
      const [, noteThread] = capture(mockedSFProjectService.createNoteThread).last();
      expect(noteThread.verseRef).toEqual(fromVerseRef(new VerseRef('LUK 1:1')));
      expect(noteThread.notes[0].content).toEqual(XmlUtils.encodeForXml(content));
      env.dispose();
    }));

    it('can edit a note with xml reserved symbols as note content', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const projectId: string = 'project01';
      env.setSelectionAndInsertNote('verse_1_2');
      const content: string = 'content in the thread';
      env.mockNoteDialogRef.close({ noteContent: content });
      env.wait();
      verify(mockedSFProjectService.createNoteThread(projectId, anything())).once();
      const [, noteThread] = capture(mockedSFProjectService.createNoteThread).last();
      let noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc(projectId, noteThread.dataId);
      expect(noteThreadDoc.data!.notes[0].content).toEqual(content);

      const iconElement: HTMLElement = env.getNoteThreadIconElementAtIndex('verse_1_2', 0)!;
      iconElement.click();
      const editedContent = 'edited content & <xml> tags';
      env.mockNoteDialogRef.close({ noteDataId: noteThread.notes[0].dataId, noteContent: editedContent });
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).twice();
      noteThreadDoc = env.getNoteThreadDoc(projectId, noteThread.dataId);
      expect(noteThreadDoc.data!.notes[0].content).toEqual(XmlUtils.encodeForXml(editedContent));
      env.dispose();
    }));

    it('shows SF note with default icon', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.addParatextNoteThread(
        6,
        'MAT 1:4',
        'target: chapter 1, verse 4.',
        { start: 0, length: 0 },
        ['user01'],
        NoteStatus.Todo,
        undefined,
        true,
        true
      );
      env.wait();

      const sfNote = env.getNoteThreadIconElement('verse_1_4', 'dataid06')!;
      expect(sfNote.getAttribute('style')).toEqual('--icon-file: url(/assets/icons/TagIcons/' + SF_TAG_ICON + '.png);');
      env.dispose();
    }));

    it('cannot insert a note when editor content unavailable', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.onlineStatus = false;
      const textDoc: TextDoc = env.getTextDoc(new TextDocId('project01', 40, 1));
      const subject: Subject<void> = new Subject<void>();
      const promise = new Promise<TextDoc>(resolve => {
        subject.subscribe(() => resolve(textDoc));
      });
      when(mockedSFProjectService.getText(anything())).thenReturn(promise);
      env.wait();
      env.insertNoteFab.nativeElement.click();
      env.wait();
      verify(mockedNoticeService.show(anything())).once();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).never();
      subject.next();
      subject.complete();
      env.wait();
      env.insertNoteFab.nativeElement.click();
      env.wait();
      verify(mockedNoticeService.show(anything())).once();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      expect().nothing();
      env.dispose();
    }));

    it('can insert note on verse at cursor position', fakeAsync(() => {
      const projectId: string = 'project01';
      const userId: string = 'user01';
      const env = new TestEnvironment();
      env.setProjectUserConfig({ selectedBookNum: 40, selectedChapterNum: 1, selectedSegment: 'verse_1_1' });
      env.wait();
      expect(env.component.target!.segment!.ref).toBe('verse_1_1');
      env.setSelectionAndInsertNote('verse_1_4');

      const content: string = 'content in the thread';
      env.mockNoteDialogRef.close({ noteContent: content });
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      const [, config] = capture(mockedMatDialog.open).last();
      const noteVerseRef: VerseRef = (config as MatDialogConfig).data!.verseRef;
      expect(noteVerseRef.toString()).toEqual('MAT 1:4');

      verify(mockedSFProjectService.createNoteThread(projectId, anything())).once();
      const [, noteThread] = capture(mockedSFProjectService.createNoteThread).last();
      expect(noteThread.verseRef).toEqual(fromVerseRef(noteVerseRef));
      expect(noteThread.publishedToSF).toBe(true);
      expect(noteThread.notes[0].ownerRef).toEqual(userId);
      expect(noteThread.notes[0].content).toEqual(content);
      expect(noteThread.notes[0].tagId).toEqual(2);
      expect(env.isNoteIconHighlighted(noteThread.dataId)).toBeFalse();
      expect(env.component.target!.segment!.ref).toBe('verse_1_4');

      env.dispose();
    }));

    it('allows adding a note to an existing thread', fakeAsync(() => {
      const projectId: string = 'project01';
      const threadDataId: string = 'dataid04';
      const threadId: string = 'thread04';
      const segmentRef: string = 'verse_1_3';
      const env = new TestEnvironment();
      const content: string = 'content in the thread';
      let noteThread: NoteThreadDoc = env.getNoteThreadDoc(projectId, threadDataId);
      expect(noteThread.data!.notes.length).toEqual(1);

      env.setProjectUserConfig();
      env.wait();
      const noteThreadIconElem: HTMLElement = env.getNoteThreadIconElement(segmentRef, threadDataId)!;
      noteThreadIconElem.click();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      const [, noteDialogData] = capture(mockedMatDialog.open).last();
      expect((noteDialogData!.data as NoteDialogData).threadDataId).toEqual(threadDataId);
      env.mockNoteDialogRef.close({ noteContent: content });
      env.wait();
      noteThread = env.getNoteThreadDoc(projectId, threadDataId);
      expect(noteThread.data!.notes.length).toEqual(2);
      expect(noteThread.data!.notes[1].threadId).toEqual(threadId);
      expect(noteThread.data!.notes[1].content).toEqual(content);
      expect(noteThread.data!.notes[1].tagId).toBe(undefined);
      env.dispose();
    }));

    it('allows resolving a note', fakeAsync(() => {
      const projectId: string = 'project01';
      const threadDataId: string = 'dataid01';
      const content: string = 'This thread is resolved.';
      const env = new TestEnvironment();
      let noteThread: NoteThreadDoc = env.getNoteThreadDoc(projectId, threadDataId);
      expect(noteThread.data!.notes.length).toEqual(3);

      env.setProjectUserConfig();
      env.wait();
      let noteThreadIconElem: HTMLElement | null = env.getNoteThreadIconElement('verse_1_1', threadDataId);
      noteThreadIconElem!.click();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      env.mockNoteDialogRef.close({ noteContent: content, status: NoteStatus.Resolved });
      env.wait();
      noteThread = env.getNoteThreadDoc(projectId, threadDataId);
      expect(noteThread.data!.notes.length).toEqual(4);
      expect(noteThread.data!.notes[3].content).toEqual(content);
      expect(noteThread.data!.notes[3].status).toEqual(NoteStatus.Resolved);

      // the icon should be hidden from the editor
      noteThreadIconElem = env.getNoteThreadIconElement('verse_1_1', threadDataId);
      expect(noteThreadIconElem).toBeNull();
      env.dispose();
    }));

    it('can open dialog of the second note on the verse', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();
      expect(env.getNoteThreadIconElement('verse_1_3', 'dataid02')).not.toBeNull();
      env.setSelectionAndInsertNote('verse_1_3');
      const noteDialogResult: NoteDialogResult = { noteContent: 'newly created comment', noteDataId: 'notenew01' };
      env.mockNoteDialogRef.close(noteDialogResult);
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      env.wait();

      const noteElement: HTMLElement = env.getNoteThreadIconElementAtIndex('verse_1_3', 1)!;
      noteElement.click();
      tick();
      env.fixture.detectChanges();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).twice();

      // can open note on existing verse
      const existingNoteIcon: HTMLElement = env.getNoteThreadIconElement('verse_1_3', 'dataid03')!;
      existingNoteIcon.click();
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).thrice();
      env.mockNoteDialogRef.close();
      env.setSelectionAndInsertNote('verse_1_3');
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).times(4);
      env.dispose();
    }));

    it('commenters can click to select verse', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      env.wait();

      const hasSelectionAnchors = env.getSegmentElement('verse_1_1')!.querySelector('display-text-anchor');
      expect(hasSelectionAnchors).toBeNull();
      const verseElem: HTMLElement = env.getSegmentElement('verse_1_1')!;
      expect(verseElem.classList).not.toContain('commenter-selection');

      // select verse 1
      verseElem.click();
      env.wait();
      expect(verseElem.classList).toContain('commenter-selection');
      let verse2Elem: HTMLElement = env.getSegmentElement('verse_1_2')!;

      // select verse 2, deselect verse one
      verse2Elem.click();
      env.wait();
      expect(verse2Elem.classList).toContain('commenter-selection');
      expect(verseElem.classList).not.toContain('commenter-selection');

      // deselect verse 2
      verse2Elem.click();
      env.wait();
      expect(verse2Elem.classList).not.toContain('commenter-selection');

      // reselect verse 2, check that it is not selected when moving to a new book
      verse2Elem.click();
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
      env.wait();
      verse2Elem = env.getSegmentElement('verse_1_2')!;
      expect(verse2Elem.classList).not.toContain('commenter-selection');
      const verse3Elem: HTMLElement = env.getSegmentElement('verse_1_3')!;
      verse3Elem.click();
      expect(verse3Elem.classList).toContain('commenter-selection');
      expect(verse2Elem.classList).not.toContain('commenter-selection');
      env.dispose();
    }));

    it('does not select verse when opening a note thread', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      env.addParatextNoteThread(
        6,
        'MAT 1:1',
        '',
        { start: 0, length: 0 },
        ['user01'],
        NoteStatus.Todo,
        undefined,
        true
      );
      env.wait();

      const elem: HTMLElement = env.getNoteThreadIconElement('verse_1_1', 'dataid06')!;
      elem.click();
      env.mockNoteDialogRef.close();
      env.wait();
      const verse1Elem: HTMLElement = env.getSegmentElement('verse_1_1')!;
      expect(verse1Elem.classList).not.toContain('commenter-selection');

      // select verse 3 after closing the dialog
      const verse3Elem: HTMLElement = env.getSegmentElement('verse_1_3')!;
      verse3Elem.click();
      expect(verse1Elem.classList).not.toContain('commenter-selection');
      env.dispose();
    }));

    it('updates verse selection when opening a note dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const segmentRef = 'verse_1_1';
      env.clickSegmentRef(segmentRef);
      env.wait();
      const verse1Elem: HTMLElement = env.getSegmentElement(segmentRef)!;
      expect(verse1Elem.classList).toContain('commenter-selection');
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('visible');

      // simulate clicking the note icon on verse 3
      const segmentRef3 = 'verse_1_3';
      const thread2Position: number = env.getNoteThreadEditorPosition('dataid02');
      env.targetEditor.setSelection(thread2Position, 'user');
      const noteElem: HTMLElement = env.getNoteThreadIconElement('verse_1_3', 'dataid02')!;
      noteElem.click();
      env.wait();
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('hidden');
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      instance(mockedMatDialog).closeAll();
      env.wait();
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('visible');
      const verse3Elem: HTMLElement = env.getSegmentElement(segmentRef3)!;
      expect(verse3Elem.classList).toContain('commenter-selection');
      expect(verse1Elem.classList).not.toContain('commenter-selection');
      env.dispose();
    }));

    it('deselects a verse when bottom sheet is open and chapter changed', fakeAsync(() => {
      const env = new TestEnvironment();
      env.ngZone.run(() => {
        env.setProjectUserConfig();
        env.breakpointObserver.matchedResult = true;
        env.wait();

        const segmentRef = 'verse_1_1';
        env.setSelectionAndInsertNote(segmentRef);
        expect(env.mobileNoteTextArea).toBeTruthy();
        env.component.chapter = 2;
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '2' });
        env.wait();
        env.clickSegmentRef('verse_2_2');
        env.wait();
        const verse1Elem: HTMLElement = env.getSegmentElement('verse_2_1')!;
        expect(verse1Elem.classList).not.toContain('commenter-selection');
        const verse2Elem: HTMLElement = env.getSegmentElement('verse_2_2')!;
        expect(verse2Elem.classList).toContain('commenter-selection');
      });
      env.dispose();
    }));

    it('keeps insert note fab hidden for commenters on mobile devices', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.breakpointObserver.matchedResult = true;
      env.addParatextNoteThread(
        6,
        'MAT 1:1',
        '',
        { start: 0, length: 0 },
        ['user01'],
        NoteStatus.Todo,
        undefined,
        true
      );
      env.setCommenterUser();
      env.wait();

      env.clickSegmentRef('verse_1_3');
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('hidden');
      const noteElem: HTMLElement = env.getNoteThreadIconElement('verse_1_1', 'dataid06')!;
      noteElem.click();
      env.wait();
      env.mockNoteDialogRef.close();
      env.wait();
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('hidden');
      // clean up
      env.clickSegmentRef('verse_1_3');
      env.dispose();
    }));

    it('shows the correct combined verse ref for a new note', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();

      const segmentRef = 'verse_1_2-3';
      env.setSelectionAndInsertNote(segmentRef);
      const verseRef = new VerseRef('LUK', '1', '2-3');
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      const [, config] = capture(mockedMatDialog.open).last();
      expect((config!.data! as NoteDialogData).verseRef!.equals(verseRef)).toBeTrue();
      env.dispose();
    }));

    it('does not allow selecting section headings', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();

      let elem: HTMLElement = env.getSegmentElement('s_1')!;
      expect(elem.classList).not.toContain('commenter-selection');
      env.clickSegmentRef('s_1');
      expect(elem.classList).not.toContain('commenter-selection');
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('hidden');

      elem = env.getSegmentElement('s_2')!;
      expect(elem.classList).not.toContain('commenter-selection');
      env.clickSegmentRef('s_2');
      expect(elem.classList).not.toContain('commenter-selection');
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('hidden');

      const verseElem: HTMLElement = env.getSegmentElement('verse_1_2-3')!;
      expect(verseElem.classList).not.toContain('commenter-selection');
      env.clickSegmentRef('verse_1_2-3');
      expect(verseElem.classList).toContain('commenter-selection');
      expect(window.getComputedStyle(env.insertNoteFab.nativeElement)['visibility']).toBe('visible');
      expect(elem.classList).not.toContain('commenter-selection');
      env.dispose();
    }));

    it('commenters can create note on selected verse with FAB', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.setCommenterUser();
      env.wait();

      const verseSegment: HTMLElement = env.getSegmentElement('verse_1_5')!;
      verseSegment.click();
      env.wait();
      expect(verseSegment.classList).toContain('commenter-selection');

      // Change to a PT reviewer to assert they can also use the FAB
      verseSegment.click();
      expect(verseSegment.classList).not.toContain('commenter-selection');
      env.setParatextReviewerUser();
      env.wait();
      verseSegment.click();
      expect(verseSegment.classList).toContain('commenter-selection');

      // Click and open the dialog
      env.insertNoteFab.nativeElement.click();
      env.wait();
      verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
      const [, arg2] = capture(mockedMatDialog.open).last();
      const verseRef: VerseRef = (arg2 as MatDialogConfig).data.verseRef!;
      expect(verseRef.toString()).toEqual('MAT 1:5');
      env.dispose();
    }));

    it('should remove resolved notes after a remote update', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      let contents = env.targetEditor.getContents();
      let noteThreadEmbedCount = env.countNoteThreadEmbeds(contents.ops!);
      expect(noteThreadEmbedCount).toEqual(5);

      env.resolveNote('project01', 'dataid01');
      contents = env.targetEditor.getContents();
      noteThreadEmbedCount = env.countNoteThreadEmbeds(contents.ops!);
      expect(noteThreadEmbedCount).toEqual(4);
      env.dispose();
    }));

    it('should remove note thread icon from editor when thread is deleted', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const threadId = 'dataid02';
      const segmentRef = 'verse_1_3';
      let thread2Elem: HTMLElement | null = env.getNoteThreadIconElement(segmentRef, threadId);
      expect(thread2Elem).not.toBeNull();
      env.deleteMostRecentNote('project01', segmentRef, threadId);
      thread2Elem = env.getNoteThreadIconElement(segmentRef, threadId);
      expect(thread2Elem).toBeNull();

      // notes respond to edits after note icon removed
      const note1position: number = env.getNoteThreadEditorPosition('dataid01');
      env.targetEditor.setSelection(note1position + 2, 'user');
      const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('project01', 'dataid01');
      const originalPos: TextAnchor = { start: 8, length: 9 };
      expect(noteThreadDoc.data!.position).toEqual(originalPos);
      env.typeCharacters('t');
      expect(noteThreadDoc.data!.position).toEqual({ start: originalPos.start, length: originalPos.length + 1 });
      env.dispose();
    }));

    it('should position FAB beside selected segment', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      const segmentRef = 'verse_1_1';

      env.clickSegmentRef(segmentRef);
      env.wait();

      const segmentElRect = env.getSegmentElement(segmentRef)!.getBoundingClientRect();
      const fabRect = env.insertNoteFab.nativeElement.getBoundingClientRect();
      expect(segmentElRect.top).toBeCloseTo(fabRect.top, 0);

      env.dispose();
    }));

    it('should position FAB beside selected segment when scrolling segment in view', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      // Set window size to be narrow to test scrolling
      const contentContainer: HTMLElement = document.getElementsByClassName('content')[0] as HTMLElement;
      Object.assign(contentContainer.style, { width: '360px', height: '300px' });

      const segmentRef = 'verse_1_1';

      // Select segment
      env.clickSegmentRef(segmentRef);
      env.wait();

      // Scroll, keeping selected segment in view
      const scrollContainer: Element = env.component['targetScrollContainer'] as Element;
      scrollContainer.scrollTop = 20;
      scrollContainer.dispatchEvent(new Event('scroll'));

      const segmentElRect = env.getSegmentElement(segmentRef)!.getBoundingClientRect();
      const fabRect = env.insertNoteFab.nativeElement.getBoundingClientRect();
      expect(Math.ceil(fabRect.top)).toEqual(Math.ceil(segmentElRect.top));

      env.dispose();
    }));

    it('should position FAB within scroll container when scrolling segment above view', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      // Set window size to be narrow to test scrolling
      const contentContainer: HTMLElement = document.getElementsByClassName('content')[0] as HTMLElement;
      Object.assign(contentContainer.style, { width: '360px', height: '300px' });

      // Verse near top of scroll container
      const segmentRef = 'verse_1_1';

      // Select segment
      env.clickSegmentRef(segmentRef);
      env.wait();

      const scrollContainer: Element = env.component['targetScrollContainer'] as Element;
      const scrollContainerRect: DOMRect = scrollContainer.getBoundingClientRect();

      // Scroll segment above view
      scrollContainer.scrollTop = 200;
      scrollContainer.dispatchEvent(new Event('scroll'));

      const fabRect = env.insertNoteFab.nativeElement.getBoundingClientRect();
      expect(Math.ceil(fabRect.top)).toEqual(Math.ceil(scrollContainerRect.top + env.component.fabVerticalCushion));

      env.dispose();
    }));

    it('should position FAB within scroll container when scrolling segment below view', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setProjectUserConfig();
      env.wait();

      // Set window size to be narrow to test scrolling
      const contentContainer: HTMLElement = document.getElementsByClassName('content')[0] as HTMLElement;
      Object.assign(contentContainer.style, { width: '360px', height: '300px' });

      // Verse near bottom of scroll container
      const segmentRef = 'verse_1_6';

      // Select segment
      env.clickSegmentRef(segmentRef);
      env.wait();

      const scrollContainer: Element = env.component['targetScrollContainer'] as Element;
      const scrollContainerRect: DOMRect = scrollContainer.getBoundingClientRect();

      // Scroll segment below view
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event('scroll'));

      const fabRect = env.insertNoteFab.nativeElement.getBoundingClientRect();
      expect(Math.ceil(fabRect.bottom)).toEqual(
        Math.ceil(scrollContainerRect.bottom - env.component.fabVerticalCushion)
      );

      env.dispose();
    }));
  });

  describe('Translation Suggestions disabled', () => {
    it('start with no previous selection', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
      env.setProjectUserConfig();
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.bookName).toEqual('Luke');
      expect(env.component.chapter).toBe(2);
      expect(env.component.verse).toBe('1');
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
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
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
      when(mockedSFProjectService.getProfile('resource01')).thenResolve({
        id: 'resource01',
        data: createTestProjectProfile()
      } as SFProjectProfileDoc);

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
      env.routeWithParams({ projectId: 'project01', bookId: 'ACT' });
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
      env.routeWithParams({ projectId: 'project01', bookId: 'MRK' });
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

    it('first chapter is missing', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
      env.setProjectUserConfig();
      env.routeWithParams({ projectId: 'project01', bookId: 'ROM' });
      env.wait();
      expect(env.bookName).toEqual('Romans');
      expect(env.component.chapter).toBe(2);
      expect(env.component.sourceLabel).toEqual('SRC');
      expect(env.component.targetLabel).toEqual('TRG');
      expect(env.component.target!.segmentRef).toEqual('');
      const selection = env.targetEditor.getSelection();
      expect(selection).toBeNull();
      expect(env.component.canEdit).toBe(true);
      env.dispose();
    }));

    it('prevents editing and informs user when text doc is corrupted', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig });
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 3 });
      env.routeWithParams({ projectId: 'project01', bookId: 'LUK' });
      env.wait();
      expect(env.component.hasEditRight).toBe(true);
      expect(env.component.canEdit).toBe(false);
      expect(env.corruptedWarning).not.toBeNull();
      env.dispose();
    }));

    it('shows translator settings when suggestions are enabled for the project and user can edit project', fakeAsync(() => {
      const projectConfig = {
        translateConfig: { ...defaultTranslateConfig, translationSuggestionsEnabled: true }
      };
      const navigationParams: Params = { projectId: 'project01', bookId: 'MRK' };

      const env = new TestEnvironment();
      env.setupProject(projectConfig);
      env.setProjectUserConfig();
      env.routeWithParams(navigationParams);
      env.wait();
      expect(env.suggestionsSettingsButton).toBeTruthy();
      env.dispose();
    }));

    it('hides translator settings when suggestions are enabled for the project but user cant edit', fakeAsync(() => {
      const projectConfig = {
        translateConfig: { ...defaultTranslateConfig, translationSuggestionsEnabled: true }
      };
      const navigationParams: Params = { projectId: 'project01', bookId: 'MRK' };

      const env = new TestEnvironment();
      env.setCurrentUser('user06'); //has read but not edit
      env.setupProject(projectConfig);
      env.setProjectUserConfig();
      env.routeWithParams(navigationParams);
      env.wait();
      expect(env.suggestionsSettingsButton).toBeFalsy();
      env.dispose();
    }));

    it('hides translator settings when suggestions are disabled for the project', fakeAsync(() => {
      const projectConfig = {
        translateConfig: { ...defaultTranslateConfig, translationSuggestionsEnabled: false }
      };
      const navigationParams: Params = { projectId: 'project01', bookId: 'MRK' };

      const env = new TestEnvironment();
      env.setupProject(projectConfig);
      env.setProjectUserConfig();
      env.routeWithParams(navigationParams);
      env.wait();
      expect(env.suggestionsSettingsButton).toBeFalsy();
      env.dispose();
    }));

    it('shows the copyright banner', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig, copyrightBanner: 'banner text' });
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 3 });
      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();
      expect(env.copyrightBanner).not.toBeNull();
      env.dispose();
    }));

    it('shows the copyright notice dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({ translateConfig: defaultTranslateConfig, copyrightBanner: 'banner text' });
      env.setProjectUserConfig({ selectedBookNum: 42, selectedChapterNum: 3 });
      env.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
      env.wait();

      // SUT
      const dialogMessage = spyOn((env.component as any).dialogService, 'openGenericDialog').and.callThrough();
      expect(env.copyrightBanner).not.toBeNull();
      env.copyrightMoreInfo.nativeElement.click();
      tick();
      env.fixture.detectChanges();
      expect(dialogMessage).toHaveBeenCalledTimes(1);

      env.dispose();
    }));
  });

  it('sets book and chapter according to route', fakeAsync(() => {
    const navigationParams: Params = { projectId: 'project01', bookId: 'MRK', chapter: '2' };
    const env = new TestEnvironment();

    env.setProjectUserConfig();
    env.routeWithParams(navigationParams);
    env.wait();

    expect(env.bookName).toEqual('Mark');
    expect(env.component.chapter).toBe(2);

    env.dispose();
  }));

  it('should navigate to "projects" route if url book is not in project', fakeAsync(() => {
    const navigationParams: Params = { projectId: 'project01', bookId: 'GEN', chapter: '2' };
    const env = new TestEnvironment();
    flush();
    const spyRouterNavigate = spyOn(env.router, 'navigateByUrl');

    env.routeWithParams(navigationParams);
    env.wait();

    expect(spyRouterNavigate).toHaveBeenCalledWith('projects', jasmine.any(Object));
    discardPeriodicTasks();
  }));

  describe('tabs', () => {
    describe('tab group consolidation', () => {
      it('should call consolidateTabGroups for small screen widths once editor is loaded and tab state is initialized', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        const spyConsolidate = spyOn(env.component.tabState, 'consolidateTabGroups');

        expect(spyConsolidate).not.toHaveBeenCalled();
        env.breakpointObserver.emitObserveValue(true);
        env.component['tabStateInitialized$'].next(true);
        expect(spyConsolidate).not.toHaveBeenCalled();
        env.component['targetEditorLoaded$'].next();
        env.wait();
        expect(spyConsolidate).toHaveBeenCalled();
        expect(env.component.source?.id?.toString()).toEqual('project02:MAT:1:target');
        discardPeriodicTasks();
      }));

      it('should call deconsolidateTabGroups for large screen widths once editor is loaded and tab state is initialized', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        const spyDeconsolidate = spyOn(env.component.tabState, 'deconsolidateTabGroups');
        expect(spyDeconsolidate).not.toHaveBeenCalled();
        env.breakpointObserver.emitObserveValue(false);
        env.component['tabStateInitialized$'].next(true);
        expect(spyDeconsolidate).not.toHaveBeenCalled();
        env.component['targetEditorLoaded$'].next();
        env.wait();
        expect(spyDeconsolidate).toHaveBeenCalled();
        expect(env.component.source?.id?.toString()).toEqual('project02:MAT:1:target');
        discardPeriodicTasks();
      }));

      it('should not set id on source tab if user does not have permission', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          env.setCurrentUser('user05');
          env.setupUsers(['project01']);
          env.setupProject({ userRoles: { user05: SFProjectRole.None } }, 'project02');
        });
        expect(env.component.source?.id?.toString()).toBeUndefined();
        const spyConsolidate = spyOn(env.component.tabState, 'consolidateTabGroups');

        expect(spyConsolidate).not.toHaveBeenCalled();
        env.component['tabStateInitialized$'].next(true);
        expect(spyConsolidate).not.toHaveBeenCalled();
        env.component['targetEditorLoaded$'].next();
        env.wait();
        expect(spyConsolidate).not.toHaveBeenCalled();
        expect(env.component.source?.id?.toString()).toBeUndefined();
        discardPeriodicTasks();
      }));

      it('should not consolidate if showSource is false', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => false });
        });
        const spyConsolidate = spyOn(env.component.tabState, 'consolidateTabGroups');

        env.component['tabStateInitialized$'].next(true);
        env.component['targetEditorLoaded$'].next();
        expect(spyConsolidate).not.toHaveBeenCalled();
        flush();
      }));

      it('should not consolidate on second editor load', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });

        env.component['tabStateInitialized$'].next(true);
        env.component['targetEditorLoaded$'].next();

        const spyConsolidate = spyOn(env.component.tabState, 'consolidateTabGroups');

        env.component['targetEditorLoaded$'].next();
        expect(spyConsolidate).not.toHaveBeenCalled();
        flush();
      }));
    });

    describe('initEditorTabs', () => {
      it('should add source tab when source is defined and viewable', fakeAsync(() => {
        const env = new TestEnvironment();
        const projectDoc = env.getProjectDoc('project01');
        const spyCreateTab = spyOn(env.tabFactory, 'createTab').and.callThrough();
        env.wait();
        expect(spyCreateTab).toHaveBeenCalledWith('project-source', {
          projectId: projectDoc.data?.translateConfig.source?.projectRef,
          headerText: projectDoc.data?.translateConfig.source?.shortName,
          tooltip: projectDoc.data?.translateConfig.source?.name
        });
        discardPeriodicTasks();
      }));

      it('should not add source tab when source is defined but not viewable', fakeAsync(() => {
        const env = new TestEnvironment();
        when(mockedPermissionsService.isUserOnProject('project02')).thenResolve(false);
        const projectDoc = env.getProjectDoc('project01');
        const spyCreateTab = spyOn(env.tabFactory, 'createTab').and.callThrough();
        env.wait();
        expect(spyCreateTab).not.toHaveBeenCalledWith('project-source', {
          projectId: projectDoc.data?.translateConfig.source?.projectRef,
          headerText: projectDoc.data?.translateConfig.source?.shortName,
          tooltip: projectDoc.data?.translateConfig.source?.name
        });
        discardPeriodicTasks();
      }));

      it('should not add source tab when source is undefined', fakeAsync(() => {
        const env = new TestEnvironment();
        const spyCreateTab = spyOn(env.tabFactory, 'createTab').and.callThrough();
        delete env.testProjectProfile.translateConfig.source;
        env.setupProject();
        env.wait();
        expect(spyCreateTab).not.toHaveBeenCalledWith('project-source', jasmine.any(Object));
        discardPeriodicTasks();
      }));

      it('should add target tab', fakeAsync(() => {
        const env = new TestEnvironment();
        const projectDoc = env.getProjectDoc('project01');
        const spyCreateTab = spyOn(env.tabFactory, 'createTab').and.callThrough();
        env.wait();
        expect(spyCreateTab).toHaveBeenCalledWith('project-target', {
          projectId: projectDoc.id,
          headerText: projectDoc.data?.shortName,
          tooltip: projectDoc.data?.name
        });
        discardPeriodicTasks();
      }));

      it('should add source and target groups', fakeAsync(() => {
        const env = new TestEnvironment();
        const spyCreateTab = spyOn(env.component.tabState, 'setTabGroups').and.callThrough();
        env.wait();
        expect(spyCreateTab).toHaveBeenCalledWith(
          jasmine.arrayWithExactContents([
            jasmine.any(TabGroup<EditorTabGroupType, EditorTabInfo>),
            jasmine.any(TabGroup<EditorTabGroupType, EditorTabInfo>)
          ])
        );
        discardPeriodicTasks();
      }));

      it('should not add the biblical terms tab if the project does not have biblical terms enabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: false } });
        env.setProjectUserConfig({ editorTabsOpen: [{ tabType: 'biblical-terms', groupId: 'source' }] });
        const spyCreateTab = spyOn(env.tabFactory, 'createTab').and.callThrough();
        env.wait();
        expect(spyCreateTab).not.toHaveBeenCalledWith('biblical-terms', jasmine.any(Object));
        discardPeriodicTasks();
      }));

      it('should add the biblical terms tab if the project has biblical terms enabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: true } });
        env.setProjectUserConfig({ editorTabsOpen: [{ tabType: 'biblical-terms', groupId: 'source' }] });
        const spyCreateTab = spyOn(env.tabFactory, 'createTab').and.callThrough();
        env.wait();
        expect(spyCreateTab).toHaveBeenCalledWith('biblical-terms', jasmine.any(Object));
        discardPeriodicTasks();
      }));

      it('should exclude deleted resource tabs (tabs that have "projectDoc" but not "projectDoc.data")', fakeAsync(async () => {
        const absentProjectId = 'absentProjectId';
        when(mockedSFProjectService.getProfile(absentProjectId)).thenResolve({ data: null } as SFProjectProfileDoc);
        const env = new TestEnvironment();
        env.setProjectUserConfig({
          editorTabsOpen: [{ tabType: 'project-resource', groupId: 'target', projectId: absentProjectId }]
        });
        env.routeWithParams({ projectId: 'project01', bookId: 'GEN', chapter: '1' });
        env.wait();

        const tabs = await firstValueFrom(env.component.tabState.tabs$);
        expect(tabs.find(t => t.projectId === absentProjectId)).toBeUndefined();
        env.dispose();
      }));
    });

    describe('updateAutoDraftTabVisibility', () => {
      it('should add auto draft tab to source when available and "showSource" is true', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        when(mockedPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
        env.wait();
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        const tabGroup = env.component.tabState.getTabGroup('source');
        expect(tabGroup?.tabs[1].type).toEqual('draft');

        const targetTabGroup = env.component.tabState.getTabGroup('target');
        expect(targetTabGroup?.tabs[1]).toBeUndefined();

        env.dispose();
      }));

      it('should add auto draft tab to target when available and "showSource" is false', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => false });
        });
        when(mockedPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
        env.wait();
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        const targetTabGroup = env.component.tabState.getTabGroup('target');
        expect(targetTabGroup?.tabs[1].type).toEqual('draft');

        const sourceTabGroup = env.component.tabState.getTabGroup('source');
        expect(sourceTabGroup?.tabs[1]).toBeUndefined();

        env.dispose();
      }));

      it('should hide source auto draft tab when switching to chapter with no draft', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        when(mockedPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        const sourceTabGroup = env.component.tabState.getTabGroup('source');
        expect(sourceTabGroup?.tabs[1].type).toEqual('draft');
        expect(env.component.chapter).toBe(1);

        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '2' });
        env.wait();

        expect(sourceTabGroup?.tabs[1]).toBeUndefined();
        expect(env.component.chapter).toBe(2);

        env.dispose();
      }));

      it('should hide auto draft tab when user is commenter', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        env.setCommenterUser();
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        const targetTabGroup = env.component.tabState.getTabGroup('target');
        expect(targetTabGroup?.tabs[1]).toBeUndefined();
        expect(env.component.chapter).toBe(1);

        env.dispose();
      }));

      it('should hide target auto draft tab when switching to chapter with no draft', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => false });
        });
        when(mockedPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        const targetTabGroup = env.component.tabState.getTabGroup('target');
        expect(targetTabGroup?.tabs[1].type).toEqual('draft');
        expect(env.component.chapter).toBe(1);

        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '2' });
        env.wait();

        expect(targetTabGroup?.tabs[1]).toBeUndefined();
        expect(env.component.chapter).toBe(2);

        env.dispose();
      }));

      it('should not add draft tab if draft exists and draft tab is already present', fakeAsync(async () => {
        const env = new TestEnvironment();
        env.wait();

        env.component.tabState.addTab('target', await env.tabFactory.createTab('draft'));
        const addTab = spyOn(env.component.tabState, 'addTab');

        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        expect(addTab).not.toHaveBeenCalled();
        env.dispose();
      }));

      it('should select the draft tab if url query param is set', fakeAsync(() => {
        const env = new TestEnvironment();
        when(mockedActivatedRoute.snapshot).thenReturn({ queryParams: { 'draft-active': 'true' } } as any);
        when(mockedPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
        env.wait();
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        env.component.tabState.tabs$.pipe(take(1)).subscribe(tabs => {
          expect(tabs.find(tab => tab.type === 'draft')?.isSelected).toBe(true);
          env.dispose();
        });
      }));

      it('should not select the draft tab if url query param is not set', fakeAsync(() => {
        const env = new TestEnvironment();
        when(mockedActivatedRoute.snapshot).thenReturn({ queryParams: {} } as any);
        when(mockedPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
        env.wait();
        env.routeWithParams({ projectId: 'project01', bookId: 'LUK', chapter: '1' });
        env.wait();

        env.component.tabState.tabs$.pipe(take(1)).subscribe(tabs => {
          expect(tabs.find(tab => tab.type === 'draft')?.isSelected).toBe(false);
          env.dispose();
        });
      }));

      it('should not throw exception on remote change when source is undefined', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setProjectUserConfig();
        env.wait();

        env.component.source = undefined;

        expect(() => env.updateFontSize('project01', 24)).not.toThrow();

        env.dispose();
      }));
    });

    describe('updateBiblicalTermsTabVisibility', () => {
      it('should add biblical terms tab to source when enabled and "showSource" is true', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: true } });
        env.setProjectUserConfig({ biblicalTermsEnabled: true });
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '1' });
        env.wait();

        const sourceTabGroup = env.component.tabState.getTabGroup('source');
        expect(sourceTabGroup?.tabs[1].type).toEqual('biblical-terms');

        const targetTabGroup = env.component.tabState.getTabGroup('target');
        expect(targetTabGroup?.tabs[1]).toBeUndefined();

        env.dispose();
      }));

      it('should add biblical terms tab to target when available and "showSource" is false', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => false });
        });
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: true } });
        env.setProjectUserConfig({ biblicalTermsEnabled: true });
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '1' });
        env.wait();

        const targetTabGroup = env.component.tabState.getTabGroup('target');
        expect(targetTabGroup?.tabs[1].type).toEqual('biblical-terms');

        const sourceTabGroup = env.component.tabState.getTabGroup('source');
        expect(sourceTabGroup?.tabs[1]).toBeUndefined();

        env.dispose();
      }));

      it('should not add the biblical terms tab when opening project with biblical terms disabled', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: false } });
        env.setProjectUserConfig({ biblicalTermsEnabled: true });
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '1' });
        env.wait();

        const sourceTabGroup = env.component.tabState.getTabGroup('source');
        expect(sourceTabGroup?.tabs[1]).toBeUndefined();
        expect(env.component.chapter).toBe(1);

        env.dispose();
      }));

      it('should not add the biblical terms tab if the user had biblical terms disabled', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => true });
        });
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: true } });
        env.setProjectUserConfig({ biblicalTermsEnabled: false });
        env.routeWithParams({ projectId: 'project01', bookId: 'MAT', chapter: '1' });
        env.wait();

        const sourceTabGroup = env.component.tabState.getTabGroup('source');
        expect(sourceTabGroup?.tabs[1]).toBeUndefined();
        expect(env.component.chapter).toBe(1);

        env.dispose();
      }));

      it('should keep source pane open if biblical tab has been opened in it', fakeAsync(() => {
        const env = new TestEnvironment(env => {
          Object.defineProperty(env.component, 'showSource', { get: () => false });
        });
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: true } });
        env.setProjectUserConfig({
          biblicalTermsEnabled: true,
          editorTabsOpen: [{ tabType: 'biblical-terms', groupId: 'source' }]
        });
        env.routeWithParams({ projectId: 'project01', bookId: 'GEN', chapter: '1' });
        env.wait();

        expect(env.component.showSource).toBe(false);
        expect(env.component.showPersistedTabsOnSource).toBe(true);
        expect(env.fixture.debugElement.query(By.css('.biblical-terms'))).not.toBeNull();

        env.dispose();
      }));
    });

    describe('tab header tooltips', () => {
      it('should show source tab header tooltip', fakeAsync(async () => {
        const env = new TestEnvironment();
        const tooltipHarness = await env.harnessLoader.getHarness(
          MatTooltipHarness.with({ selector: '#source-text-area .tab-header-content' })
        );
        const sourceProjectDoc = env.getProjectDoc('project02');
        env.wait();
        await tooltipHarness.show();
        expect(await tooltipHarness.getTooltipText()).toBe(sourceProjectDoc.data?.translateConfig.source?.name!);
        tooltipHarness.hide();
        env.dispose();
      }));

      it('should show target tab header tooltip', fakeAsync(async () => {
        const env = new TestEnvironment();
        const tooltipHarness = await env.harnessLoader.getHarness(
          MatTooltipHarness.with({ selector: '#target-text-area .tab-header-content' })
        );

        const targetProjectDoc = env.getProjectDoc('project01');
        env.wait();
        await tooltipHarness.show();
        expect(await tooltipHarness.getTooltipText()).toBe(targetProjectDoc.data?.name!);
        tooltipHarness.hide();
        env.dispose();
      }));
    });
  });
});

const defaultTranslateConfig = {
  translationSuggestionsEnabled: false
};

class TestEnvironment {
  readonly component: EditorComponent;
  readonly fixture: ComponentFixture<EditorComponent>;
  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);
  readonly activatedProjectService: ActivatedProjectService;
  readonly router: Router;
  readonly location: Location;
  readonly mockNoteDialogRef;
  readonly mockedDialogRef = mock<MatDialogRef<GenericDialogComponent<any>, GenericDialogOptions<any>>>(MatDialogRef);
  readonly ngZone: NgZone;
  readonly tabFactory: EditorTabFactoryService;
  readonly harnessLoader: HarnessLoader;
  readonly testOnlineStatusService: TestOnlineStatusService;
  readonly breakpointObserver: TestBreakpointObserver = TestBed.inject(BreakpointObserver) as TestBreakpointObserver;

  private userRolesOnProject = {
    user01: SFProjectRole.ParatextTranslator,
    user02: SFProjectRole.ParatextConsultant,
    user03: SFProjectRole.ParatextTranslator,
    user04: SFProjectRole.ParatextAdministrator,
    user05: SFProjectRole.Commenter,
    user06: SFProjectRole.ParatextObserver,
    user07: SFProjectRole.Viewer
  };
  private paratextUsersOnProject = paratextUsersFromRoles(this.userRolesOnProject);
  private tokenizer = new LatinWordTokenizer();
  private detokenizer = new LatinWordDetokenizer();
  private readonly realtimeService: TestRealtimeService;
  private readonly params$: BehaviorSubject<Params>;
  private trainingProgress$ = new Subject<ProgressStatus>();
  private textInfoPermissions = {
    user01: TextInfoPermission.Write,
    user02: TextInfoPermission.None,
    user03: TextInfoPermission.Read,
    user04: TextInfoPermission.Write,
    user05: TextInfoPermission.Read,
    user06: TextInfoPermission.Read,
    user07: TextInfoPermission.Read
  };
  private openNoteDialogs: MockNoteDialogRef[] = [];
  private noteTags: NoteTag[] = [
    { tagId: 1, name: 'PT Translation Note 1', icon: '01flag1', creatorResolve: false },
    { tagId: 2, name: 'PT Translation Note 2', icon: '02tag1', creatorResolve: false },
    { tagId: 3, name: 'SF Note Tag', icon: SF_TAG_ICON, creatorResolve: false }
  ];

  testProjectProfile: SFProjectProfile = createTestProjectProfile({
    shortName: 'TRG',
    isRightToLeft: false,
    userRoles: this.userRolesOnProject,
    translateConfig: {
      translationSuggestionsEnabled: true,
      defaultNoteTagId: 2,
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
      checkingEnabled: false
    },
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
            permissions: this.textInfoPermissions,
            hasDraft: true
          },
          {
            number: 2,
            lastVerse: 3,
            isValid: true,
            permissions: {
              user01: TextInfoPermission.Write,
              user02: TextInfoPermission.None,
              user03: TextInfoPermission.Write
            },
            hasDraft: false
          },
          {
            number: 3,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions,
            hasDraft: false
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
      },
      {
        bookNum: 45,
        chapters: [
          {
            number: 2,
            lastVerse: 3,
            isValid: true,
            permissions: this.textInfoPermissions
          }
        ],
        hasSource: false,
        permissions: this.textInfoPermissions
      }
    ],
    noteTags: this.noteTags
  });

  constructor(preInit?: (env: TestEnvironment) => void) {
    this.params$ = new BehaviorSubject<Params>({ projectId: 'project01', bookId: 'MAT' });

    when(mockedActivatedRoute.params).thenReturn(this.params$);
    when(mockedActivatedRoute.snapshot).thenReturn({ queryParams: {} } as any);
    when(mockedTranslationEngineService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    when(mockedTranslationEngineService.createTranslationEngine('project02')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    when(mockedTranslationEngineService.createInteractiveTranslatorFactory(anything())).thenReturn(
      new InteractiveTranslatorFactory(instance(this.mockedRemoteTranslationEngine), this.tokenizer, this.detokenizer)
    );
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
      isParatextRole(role) ? this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id) : undefined
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
    when(mockedSFProjectService.queryNoteThreads(anything(), anything(), anything())).thenCall(
      (id, bookNum, chapterNum, _) =>
        this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, {
          [obj<NoteThread>().pathStr(t => t.projectRef)]: id,
          [obj<NoteThread>().pathStr(t => t.status)]: NoteStatus.Todo,
          [obj<NoteThread>().pathStr(t => t.verseRef.bookNum)]: bookNum,
          [obj<NoteThread>().pathStr(t => t.verseRef.chapterNum)]: chapterNum
        })
    );
    when(mockedSFProjectService.queryBiblicalTermNoteThreads(anything())).thenCall(id =>
      this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, {
        [obj<NoteThread>().pathStr(t => t.projectRef)]: id,
        [obj<NoteThread>().pathStr(t => t.biblicalTermId)]: { $ne: null }
      })
    );
    when(mockedSFProjectService.queryBiblicalTerms(anything())).thenCall(id =>
      this.realtimeService.subscribeQuery(BiblicalTermDoc.COLLECTION, {
        [obj<BiblicalTerm>().pathStr(t => t.projectRef)]: id
      })
    );
    when(mockedSFProjectService.createNoteThread(anything(), anything())).thenCall(
      (projectId: string, noteThread: NoteThread) => {
        this.realtimeService.create(
          NoteThreadDoc.COLLECTION,
          getNoteThreadDocId(projectId, noteThread.dataId),
          noteThread
        );
        tick();
      }
    );

    when(mockedMatDialog.openDialogs).thenCall(() => this.openNoteDialogs);
    when(mockedMatDialog.open(NoteDialogComponent, anything())).thenCall(() => {
      this.openNoteDialogs.push(this.mockNoteDialogRef);
      return this.mockNoteDialogRef;
    });
    when(mockedMatDialog.closeAll()).thenCall(() => {
      this.openNoteDialogs.forEach(dialog => dialog.close());
      this.openNoteDialogs = [];
    });
    when(mockedMatDialog.open(GenericDialogComponent, anything())).thenReturn(instance(this.mockedDialogRef));
    when(this.mockedDialogRef.afterClosed()).thenReturn(of());
    this.breakpointObserver.matchedResult = false;

    when(mockedSFProjectService.getNoteThread(anything())).thenCall((id: string) => {
      const [projectId, threadId] = id.split(':');
      return this.getNoteThreadDoc(projectId, threadId);
    });
    when(mockedDraftGenerationService.getLastCompletedBuild(anything())).thenReturn(of({} as any));
    when(mockedDraftGenerationService.getGeneratedDraft(anything(), anything(), anything())).thenReturn(of({}));
    when(mockedDraftGenerationService.getGeneratedDraftDeltaOperations(anything(), anything(), anything())).thenReturn(
      of([])
    );
    when(mockedDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockedPermissionsService.isUserOnProject(anything())).thenResolve(true);

    this.realtimeService = TestBed.inject(TestRealtimeService);

    this.addTextDoc(new TextDocId('project02', 40, 1, 'target'), 'source', false, true);
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'), 'target', false, true);
    this.addTextDoc(new TextDocId('project02', 40, 2, 'target'), 'source');
    this.addTextDoc(new TextDocId('project01', 40, 2, 'target'));
    this.addTextDoc(new TextDocId('project02', 41, 1, 'target'), 'source');
    this.addTextDoc(new TextDocId('project01', 41, 1, 'target'));
    this.addCombinedVerseTextDoc(new TextDocId('project01', 42, 1, 'target'));
    this.addCombinedVerseTextDoc(new TextDocId('project01', 42, 2, 'target'));
    this.addTextDoc(new TextDocId('project01', 42, 3, 'target'), 'target', true);
    this.addEmptyTextDoc(new TextDocId('project01', 43, 1, 'target'));

    this.setupUsers();
    this.setCurrentUser('user01');
    this.setupProject();
    this.addParatextNoteThread(1, 'MAT 1:1', 'chapter 1', { start: 8, length: 9 }, ['user01', 'user02', 'user03']);
    this.addParatextNoteThread(2, 'MAT 1:3', 'target: chapter 1, verse 3.', { start: 0, length: 0 }, ['user01']);
    this.addParatextNoteThread(3, 'MAT 1:3', 'verse 3', { start: 20, length: 7 }, ['user01']);
    this.addParatextNoteThread(4, 'MAT 1:3', 'verse', { start: 20, length: 5 }, ['user01']);
    this.addParatextNoteThread(5, 'MAT 1:4', 'Paragraph', { start: 28, length: 9 }, ['user01']);
    this.addParatextNoteThread(6, 'MAT 1:5', 'resolved note', { start: 0, length: 0 }, ['user01'], NoteStatus.Resolved);

    this.activatedProjectService = TestBed.inject(ActivatedProjectService);
    this.tabFactory = TestBed.inject(EditorTabFactoryService);
    this.testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    this.router = TestBed.inject(Router);
    this.location = TestBed.inject(Location);
    this.ngZone = TestBed.inject(NgZone);

    this.fixture = TestBed.createComponent(EditorComponent);
    this.harnessLoader = TestbedHarnessEnvironment.loader(this.fixture);
    this.mockNoteDialogRef = new MockNoteDialogRef(this.fixture.nativeElement);
    this.component = this.fixture.componentInstance;

    if (preInit) {
      preInit(this);
    }

    this.routeWithParams({ projectId: 'project01', bookId: 'MAT' });
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
    return this.fixture.debugElement.query(By.css('#settings-btn'));
  }

  get insertNoteFab(): DebugElement {
    return this.fixture.debugElement.query(By.css('.insert-note-fab'));
  }

  get bottomSheetCloseButton(): HTMLButtonElement | null {
    return document.querySelector('.fab-bottom-sheet .close-button');
  }

  get bottomSheetVerseReference(): HTMLElement | null {
    return document.querySelector('.fab-bottom-sheet > b');
  }

  get insertNoteFabMobile(): HTMLButtonElement | null {
    return document.querySelector('.fab-bottom-sheet button');
  }

  get mobileNoteTextArea(): HTMLTextAreaElement | null {
    return document.querySelector('.fab-bottom-sheet form textarea');
  }

  get saveMobileNoteButton(): HTMLButtonElement | null {
    return document.querySelector('.fab-bottom-sheet .save-button');
  }

  get sharingButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-share-button'));
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

  get copyrightBanner(): DebugElement {
    return this.fixture.debugElement.query(By.css('.copyright-banner'));
  }

  get showWritingSystemWarningBanner(): DebugElement {
    return this.fixture.debugElement.query(By.css('.writing-system-warning-banner'));
  }

  get copyrightMoreInfo(): DebugElement {
    return this.fixture.debugElement.query(By.css('.copyright-banner .copyright-more-info'));
  }

  get isSourceAreaHidden(): boolean {
    return window.getComputedStyle(this.sourceTextArea.nativeElement).display === 'none';
  }

  get targetEditor(): Quill {
    return this.component.target!.editor!;
  }

  set onlineStatus(value: boolean) {
    this.testOnlineStatusService.setIsOnline(value);
  }

  clickSegmentRef(segmentRef: string): void {
    const range = this.component.target!.getSegmentRange(segmentRef);
    this.targetEditor.setSelection(range!.index, 0, 'user');
    this.getSegmentElement(segmentRef)!.click();
    this.wait();
  }

  deleteText(textId: string): void {
    this.ngZone.run(() => {
      const textDoc = this.realtimeService.get(TextDoc.COLLECTION, textId);
      textDoc.delete();
    });
    this.wait();
  }

  setCurrentUser(userId: string): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() => this.realtimeService.subscribe(UserDoc.COLLECTION, userId));
  }

  setParatextReviewerUser(): void {
    this.setCommenterUser('user02');
  }
  setCommenterUser(userId: 'user02' | 'user05' = 'user05'): void {
    this.setCurrentUser(userId);
    when(mockedSFProjectService.queryNoteThreads('project01', anything(), anything())).thenCall(
      (id, bookNum, chapterNum, _) =>
        this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, {
          [obj<NoteThread>().pathStr(t => t.publishedToSF)]: userId === 'user05',
          [obj<NoteThread>().pathStr(t => t.status)]: NoteStatus.Todo,
          [obj<NoteThread>().pathStr(t => t.projectRef)]: id,
          [obj<NoteThread>().pathStr(t => t.verseRef.bookNum)]: bookNum,
          [obj<NoteThread>().pathStr(t => t.verseRef.chapterNum)]: chapterNum
        })
    );
  }

  setupUsers(projects?: string[]): void {
    for (const user of Object.keys(this.userRolesOnProject)) {
      const i: number = parseInt(user.substring(user.length - 2));
      this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
        id: user,
        data: createTestUser(
          {
            sites: {
              sf: {
                projects: projects ?? ['project01', 'project02', 'project03']
              }
            }
          },
          i
        )
      });
    }
  }

  setupProject(data: RecursivePartial<SFProject> = {}, id?: string): void {
    const projectProfileData = cloneDeep(this.testProjectProfile);
    const projectData: SFProject = createTestProject({
      ...this.testProjectProfile,
      paratextUsers: this.paratextUsersOnProject
    });
    if (data.writingSystem != null) {
      projectProfileData.writingSystem = data.writingSystem as WritingSystem;
    }
    if (data.translateConfig?.translationSuggestionsEnabled != null) {
      projectProfileData.translateConfig.translationSuggestionsEnabled =
        data.translateConfig.translationSuggestionsEnabled;
    }
    if (data.translateConfig?.preTranslate != null) {
      projectProfileData.translateConfig.preTranslate = data.translateConfig.preTranslate;
    }
    if (data.translateConfig?.source !== undefined) {
      projectProfileData.translateConfig.source = merge(
        projectProfileData.translateConfig.source,
        data.translateConfig?.source
      );
    }
    if (data.biblicalTermsConfig !== undefined) {
      projectProfileData.biblicalTermsConfig = merge(projectProfileData.biblicalTermsConfig, data.biblicalTermsConfig);
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
    if (data.copyrightBanner != null) {
      projectProfileData.copyrightBanner = data.copyrightBanner;
    }
    if (data.copyrightNotice != null) {
      projectProfileData.copyrightNotice = data.copyrightNotice;
    }
    if (data.texts != null) {
      projectProfileData.texts = merge(projectProfileData.texts, data.texts);
    }
    if (data.userRoles != null) {
      for (const [userId, role] of Object.entries(data.userRoles)) {
        projectProfileData.userRoles[userId] = role!;
      }
    }
    if (id !== undefined) {
      this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
        id: id,
        data: projectProfileData
      });
    } else {
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
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    userConfig.editorTabsOpen = userConfig.editorTabsOpen ?? [];
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
    const user5Config = cloneDeep(userConfig);
    user5Config.ownerRef = 'user05';
    this.addProjectUserConfig(user5Config as SFProjectUserConfig);
  }

  getProjectUserConfigDoc(userId: string = 'user01'): SFProjectUserConfigDoc {
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      getSFProjectUserConfigDocId('project01', userId)
    );
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

  getNoteThreadDoc(projectId: string, threadDataId: string): NoteThreadDoc {
    const docId: string = projectId + ':' + threadDataId;
    return this.realtimeService.get<NoteThreadDoc>(NoteThreadDoc.COLLECTION, docId);
  }

  getNoteThreadIconElement(segmentRef: string, threadDataId: string): HTMLElement | null {
    return this.fixture.nativeElement.querySelector(
      `usx-segment[data-segment=${segmentRef}] display-note[data-thread-id=${threadDataId}]`
    );
  }

  getNoteThreadIconElementAtIndex(segmentRef: string, index: number): HTMLElement | null {
    const iconElements: HTMLElement[] | null = this.fixture.nativeElement.querySelectorAll(
      `usx-segment[data-segment=${segmentRef}] display-note`
    );
    return iconElements![index];
  }

  /** Editor position of note thread. */
  getNoteThreadEditorPosition(threadDataId: string): number {
    return this.component.target!.embeddedElements.get(threadDataId)!;
  }

  getRemoteEditPosition(notePosition: number, positionAfter: number, noteCount: number): number {
    return notePosition + 1 + positionAfter - noteCount;
  }

  isNoteIconHighlighted(threadDataId: string): boolean {
    const thread: HTMLElement | null = this.targetTextEditor.querySelector(
      `usx-segment display-note[data-thread-id='${threadDataId}']`
    );
    expect(thread).withContext('note thread highlight').not.toBeNull();
    return thread!.classList.contains('note-thread-highlight');
  }

  setDataInSync(projectId: string, isInSync: boolean, source?: any): void {
    const projectDoc: SFProjectProfileDoc = this.getProjectDoc(projectId);
    projectDoc.submitJson0Op(op => op.set(p => p.sync.dataInSync!, isInSync), source);
    tick();
    this.fixture.detectChanges();
  }

  setSelectionAndInsertNote(segmentRef: string): void {
    if (segmentRef != null) {
      this.clickSegmentRef(segmentRef);
    }
    this.wait();
    this.insertNoteFab.nativeElement.click();
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

  waitForPresenceTimer(): void {
    tick(PRESENCE_EDITOR_ACTIVE_TIMEOUT);
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

  routeWithParams(params: Params): void {
    this.ngZone.run(() => {
      // Need to both update ActivatedRoute params and navigate route because ActivatedRoute
      // provided by the RouterTestingModule is not the same instance that the component under test injects.
      this.params$.next(params);

      // ActivatedProjectService checks router event, not ActivatedRoute,
      // so trigger route change in addition to ActivatedRoute change.
      this.router.navigateByUrl(`/projects/${params.projectId}/translate/${params.bookId}/${params.chapter ?? ''}`);
    });

    this.fixture.detectChanges();
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

  typeCharacters(str: string, attributes?: StringMap): number {
    const selection = this.targetEditor.getSelection()!;
    const delta = new Delta().retain(selection.index).insert(str, attributes).delete(selection.length);
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
    this.component.metricsSession?.dispose();
    this.waitForPresenceTimer();
  }

  addTextDoc(id: TextDocId, textType: TextType = 'target', corrupt: boolean = false, tooLong: boolean = false): void {
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
    if (tooLong) {
      delta.insert({ verse: { number: '6', style: 'v' } });
      switch (textType) {
        case 'source':
          delta.insert('this verse is long '.repeat(100), { segment: `verse_${id.chapterNum}_6` });
          break;
        case 'target':
          delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 6`, { segment: `verse_${id.chapterNum}_6` });
          break;
      }
    }
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }

  addParatextNoteThread(
    threadNum: number | string,
    verseStr: string,
    selectedText: string,
    position: TextAnchor,
    userIds: string[],
    status: NoteStatus = NoteStatus.Todo,
    assignedSFUserRef?: string,
    publishedToSF?: boolean,
    setTagIdUndefined?: boolean
  ): void {
    const threadId: string = typeof threadNum === 'string' ? threadNum : `thread0${threadNum}`;
    const dataId: string = typeof threadNum === 'string' ? `dataid${threadNum}` : `dataid0${threadNum}`;
    const assignedUser: ParatextUserProfile | undefined = this.paratextUsersOnProject.find(
      u => u.sfUserId === assignedSFUserRef
    );
    const noteTagId: number | undefined = setTagIdUndefined === true ? undefined : 1;
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
        deleted: false,
        status: NoteStatus.Todo,
        tagId: noteTagId,
        assignment: assignedUser?.opaqueUserId
      };
      notes.push(note);
    }

    const verseRef: VerseRef = new VerseRef(verseStr);
    this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
      id: `project01:${dataId}`,
      data: {
        projectRef: 'project01',
        dataId,
        threadId,
        verseRef: fromVerseRef(verseRef),
        ownerRef: 'user01',
        originalSelectedText: selectedText,
        notes,
        originalContextBefore: '\\v 1 target: ',
        originalContextAfter: ', verse 1.',
        position,
        status: status,
        assignment: assignedUser?.opaqueUserId,
        publishedToSF
      }
    });
  }

  reattachNote(
    projectId: string,
    threadDataId: string,
    verseStr: string,
    position?: TextAnchor,
    doNotParseReattachedVerseStr: boolean = false
  ): void {
    const noteThreadDoc: NoteThreadDoc = this.getNoteThreadDoc(projectId, threadDataId);
    const template: Note = noteThreadDoc.data!.notes[0];
    let reattached: string;
    if (doNotParseReattachedVerseStr || position == null) {
      reattached = verseStr;
    } else {
      const verseRef: VerseRef = new VerseRef(verseStr);
      const contextAfter: string = ` ${verseRef.verseNum}.`;
      const reattachParts: string[] = [
        verseStr,
        'verse',
        position.start.toString(),
        'target: chapter 1, ',
        contextAfter
      ];
      reattached = reattachParts.join(REATTACH_SEPARATOR);
    }
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
    const note: Note = {
      dataId: 'reattach01',
      type,
      conflictType,
      threadId: template.threadId,
      content: template.content,
      deleted: false,
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

  convertToConflictNote(projectId: string, threadDataId: string): void {
    const noteThreadDoc: NoteThreadDoc = this.getNoteThreadDoc(projectId, threadDataId);
    noteThreadDoc.submitJson0Op(op => {
      op.set<string>(nt => nt.notes[0].conflictType, NoteConflictType.VerseTextConflict);
      op.set<string>(nt => nt.notes[0].type, NoteType.Conflict);
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

  resolveNote(projectId: string, threadId: string): void {
    const noteDoc: NoteThreadDoc = this.getNoteThreadDoc(projectId, threadId);
    noteDoc.submitJson0Op(op => op.set(n => n.status, NoteStatus.Resolved));
    this.realtimeService.updateAllSubscribeQueries();
    this.wait();
  }

  deleteMostRecentNote(projectId: string, segmentRef: string, threadId: string): void {
    const noteThreadIconElem: HTMLElement = this.getNoteThreadIconElement(segmentRef, threadId)!;
    noteThreadIconElem.click();
    this.wait();
    const noteDoc: NoteThreadDoc = this.getNoteThreadDoc(projectId, threadId);
    noteDoc.submitJson0Op(op => op.set(d => d.notes[0].deleted, true));
    this.mockNoteDialogRef.close({ deleted: true });
    this.realtimeService.updateAllSubscribeQueries();
    this.wait();
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

  private createWordGraph(segment: string): WordGraph {
    const segments = Array.from(this.tokenizer.tokenize(segment));
    const arcs: WordGraphArc[] = [];
    for (let i = 0; i < segments.length; i++) {
      let targetWord = segments[i];
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
    return new WordGraph(segments, arcs, [segments.length - 1]);
  }
}

export class MockNoteDialogRef {
  close$ = new Subject<NoteDialogResult | void>();
  onClose: () => void = () => {};

  constructor(element: Element) {
    // steal the focus to simulate a dialog stealing the focus
    element.appendChild(document.createElement('input')).focus();
  }

  close(result?: NoteDialogResult): void {
    this.onClose();
    this.close$.next(result);
    this.close$.complete();
    // reset the subject so that the mocked note dialog can be reopened
    this.close$ = new Subject<NoteDialogResult | void>();
  }

  afterClosed(): Observable<NoteDialogResult | void> {
    return this.close$;
  }
}
