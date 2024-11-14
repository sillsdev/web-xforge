import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Location } from '@angular/common';
import { DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, ActivatedRouteSnapshot, Params, Route, Router, RouterModule } from '@angular/router';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { ngfModule } from 'angular-file';
import { AngularSplitModule } from 'angular-split';
import { cloneDeep } from 'lodash-es';
import clone from 'lodash-es/clone';
import { CookieService } from 'ngx-cookie-service';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { AnswerStatus } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { Question, getQuestionDocId } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  SFProjectUserConfig,
  getSFProjectUserConfigDocId
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { TextData, getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import * as RichText from 'rich-text';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { first } from 'rxjs/operators';
import { anyString, anything, instance, mock, reset, resetCalls, spy, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { FileOfflineData, FileType, createStorageFileData } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { Snapshot } from 'xforge-common/models/snapshot';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { TestTranslocoModule, configureTestingModule, getAudioBlob } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextAudioDoc } from '../../core/models/text-audio-doc';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { AudioRecorderDialogComponent } from '../../shared/audio-recorder-dialog/audio-recorder-dialog.component';
import { AudioPlayerComponent } from '../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../shared/audio/audio-time-pipe';
import { SharedModule } from '../../shared/shared.module';
import { TextChooserDialogComponent, TextSelection } from '../../text-chooser-dialog/text-chooser-dialog.component';
import { AttachAudioComponent } from '../attach-audio/attach-audio.component';
import { ChapterAudioDialogService } from '../chapter-audio-dialog/chapter-audio-dialog.service';
import { QuestionScope } from '../checking.utils';
import { QuestionDialogData } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';
import { AnswerAction, CheckingAnswersComponent } from './checking-answers/checking-answers.component';
import { CheckingCommentsComponent } from './checking-answers/checking-comments/checking-comments.component';
import {
  CheckingInput,
  CheckingInputFormComponent
} from './checking-answers/checking-input-form/checking-input-form.component';
import { AudioAttachment, CheckingAudioPlayerComponent } from './checking-audio-player/checking-audio-player.component';
import { CheckingQuestionsService, QuestionFilter } from './checking-questions.service';
import { CheckingQuestionsComponent } from './checking-questions/checking-questions.component';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player/checking-scripture-audio-player.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';
import { CheckingComponent } from './checking.component';
import { FontSizeComponent } from './font-size/font-size.component';

const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);
const mockedTranslationEngineService = mock(TranslationEngineService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedDialogService = mock(DialogService);
const mockedTextChooserDialogComponent = mock(TextChooserDialogComponent);
const mockedQuestionDialogService = mock(QuestionDialogService);
const mockedChapterAudioDialogService = mock(ChapterAudioDialogService);
const mockedMediaBreakpointService = mock(MediaBreakpointService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedFileService = mock(FileService);
const mockedPermissions = mock(PermissionsService);

function createUser(idSuffix: number, role: string, nameConfirmed: boolean = true): UserInfo {
  return {
    id: 'user' + idSuffix,
    user: createTestUser(
      {
        isDisplayNameConfirmed: nameConfirmed
      },
      idSuffix
    ),
    role
  };
}

const ADMIN_USER: UserInfo = createUser(1, SFProjectRole.ParatextAdministrator);
const CHECKER_USER: UserInfo = createUser(2, SFProjectRole.CommunityChecker);
const CLEAN_CHECKER_USER: UserInfo = createUser(3, SFProjectRole.CommunityChecker, false);
const OBSERVER_USER: UserInfo = createUser(4, SFProjectRole.ParatextObserver);
const TRANSLATOR_USER: UserInfo = createUser(5, SFProjectRole.ParatextTranslator);
const CONSULTANT_USER: UserInfo = createUser(6, SFProjectRole.ParatextTranslator);

class MockComponent {}

const ROUTES: Route[] = [
  { path: 'projects/:projectId/checking/:bookId/:chapter', component: MockComponent },
  { path: 'projects/:projectId/checking/:bookId', component: MockComponent },
  { path: 'projects/:projectId/translate/:bookId', component: MockComponent },
  { path: 'projects/:projectId', component: MockComponent }
];

describe('CheckingComponent', () => {
  configureTestingModule(() => ({
    declarations: [
      AudioTimePipe,
      AudioPlayerComponent,
      CheckingAnswersComponent,
      CheckingAudioPlayerComponent,
      CheckingInputFormComponent,
      CheckingCommentsComponent,
      CheckingComponent,
      CheckingScriptureAudioPlayerComponent,
      OwnerComponent,
      CheckingQuestionsComponent,
      CheckingTextComponent,
      TextAndAudioComponent,
      FontSizeComponent,
      AttachAudioComponent
    ],
    imports: [
      AngularSplitModule,
      ngfModule,
      NoopAnimationsModule,
      RouterModule.forRoot(ROUTES),
      SharedModule,
      UICommonModule,
      AvatarComponent,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: UserService, useMock: mockedUserService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: TextChooserDialogComponent, useMock: mockedTextChooserDialogComponent },
      { provide: QuestionDialogService, useMock: mockedQuestionDialogService },
      { provide: ChapterAudioDialogService, useMock: mockedChapterAudioDialogService },
      { provide: MediaBreakpointService, useMock: mockedMediaBreakpointService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: FileService, useMock: mockedFileService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: PermissionsService, useMock: mockedPermissions }
    ]
  }));

  describe('Interface', () => {
    it('can navigate using next button', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(1);
      env.clickButton(env.nextButton);
      tick(env.questionReadTimer);
      const nextQuestion = env.currentQuestion;
      expect(nextQuestion).toEqual(2);
    }));

    it('can navigate using previous button', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(2);
      env.clickButton(env.previousButton);
      tick(env.questionReadTimer);
      const nextQuestion = env.currentQuestion;
      expect(nextQuestion).toEqual(1);
    }));

    it('should display books in canonical order', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.waitForSliderUpdate();
      expect(env.component.books).toEqual([40, 43]);
      discardPeriodicTasks();
    }));

    it('should re-calculate scripture slide position on drag end', fakeAsync(() => {
      const testProject: SFProject = TestEnvironment.generateTestProject();
      const env = new TestEnvironment({ user: CHECKER_USER, testProject });
      env.waitForSliderUpdate();
      env.component.splitComponent?.setVisibleAreaSizes(['*', 1]);
      expect(env.component.splitComponent?.getVisibleAreaSizes()[1]).toEqual(1);
      env.component.checkSliderPosition({ sizes: ['*', 20] });
      env.waitForSliderUpdate();
      expect(env.component.splitComponent?.getVisibleAreaSizes()[1]).toBeGreaterThan(1);
      flush();
      discardPeriodicTasks();
    }));

    describe('Prev/Next question buttons', () => {
      it('prev/next disabled state based on existence of prev/next question', fakeAsync(() => {
        const env = new TestEnvironment({ user: ADMIN_USER, projectBookRoute: 'JHN', projectChapterRoute: 1 });
        const prev = env.previousButton;
        const next = env.nextButton;
        env.component.prevQuestion = {} as QuestionDoc;
        env.component.nextQuestion = {} as QuestionDoc;
        env.fixture.detectChanges();
        expect(prev.nativeElement.disabled).toBe(false);
        expect(next.nativeElement.disabled).toBe(false);
        env.component.prevQuestion = undefined;
        env.component.nextQuestion = undefined;
        env.fixture.detectChanges();
        expect(prev.nativeElement.disabled).toBe(true);
        expect(next.nativeElement.disabled).toBe(true);
        env.component.prevQuestion = undefined;
        env.component.nextQuestion = {} as QuestionDoc;
        env.fixture.detectChanges();
        expect(prev.nativeElement.disabled).toBe(true);
        expect(next.nativeElement.disabled).toBe(false);
        env.component.prevQuestion = {} as QuestionDoc;
        env.component.nextQuestion = undefined;
        env.fixture.detectChanges();
        expect(prev.nativeElement.disabled).toBe(false);
        expect(next.nativeElement.disabled).toBe(true);
        env.waitForAudioPlayer();
        discardPeriodicTasks();
        flush();
      }));
    });

    it('should open question dialog', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.clickButton(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect().nothing();
      flush();
      discardPeriodicTasks();
    }));

    it('hides add question button for community checker', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      expect(env.addQuestionButton).toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('hides add audio button for community checker', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      expect(env.addAudioButton).toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('shows add audio and shows add question button for paratext administrator', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      expect(env.addAudioButton).not.toBeNull();
      expect(env.addQuestionButton).not.toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('shows add audio and hides add question button for paratext translator (includes consultant, reviewer, archivist, and typesetter) based on user permissions', fakeAsync(() => {
      const env = new TestEnvironment({ user: TRANSLATOR_USER });
      env.fixture.detectChanges();
      expect(env.addAudioButton).not.toBeNull();
      expect(env.addQuestionButton).toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('hides add audio and shows add question button for paratext consultant (includes translator, reviewer, archivist, and typesetter) based on user permissions', fakeAsync(() => {
      const env = new TestEnvironment({ user: CONSULTANT_USER });
      env.fixture.detectChanges();
      expect(env.addAudioButton).toBeNull();
      expect(env.addQuestionButton).not.toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('responds to remote removed from project', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      env.selectQuestion(1);
      expect(env.component.questionDocs.length).toEqual(14);
      env.component.projectDoc!.submitJson0Op(op => op.unset<string>(p => p.userRoles[CHECKER_USER.id]), false);
      env.waitForSliderUpdate();
      expect(env.component.projectDoc).toBeUndefined();
      expect(env.component.questionDocs.length).toEqual(0);
      env.waitForSliderUpdate();
    }));

    it('responds to remote community checking disabled when checker', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(1);
      const projectUserConfig = env.component.projectUserConfigDoc!.data!;
      expect(projectUserConfig.selectedTask).toEqual('checking');
      expect(projectUserConfig.selectedQuestionRef).not.toBeNull();
      env.setCheckingEnabled(false);
      expect(env.component.projectDoc).toBeUndefined();
      env.waitForSliderUpdate();
    }));

    it('responds to remote community checking disabled when observer', fakeAsync(() => {
      // User with access to translate app should get redirected there
      const env = new TestEnvironment({ user: OBSERVER_USER, projectBookRoute: 'MAT', projectChapterRoute: 1 });
      env.selectQuestion(1);
      env.setCheckingEnabled(false);
      expect(env.component.projectDoc).toBeUndefined();
      expect(env.component.questionDocs.length).toEqual(0);
      env.waitForSliderUpdate();
    }));
  });

  describe('Questions', () => {
    it('questions are displaying and audio is cached', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, anything(), anything())).times(
        29
      );
      // Question 5 has been stored as the last question to start at
      expect(env.component.questionsList!.activeQuestionDoc!.data!.dataId).toBe('q5Id');
      // A sixteenth question is archived
      expect(env.questions.length).toEqual(14);
      const question = env.selectQuestion(14);
      expect(env.getQuestionText(question)).toBe('John 1, Q14 text');
      env.waitForAudioPlayer();
    }));

    it('questions are displaying for all books', fakeAsync(async () => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'all'
      });
      // Question 5 has been stored as the question to start at
      expect(env.component.questionsList!.activeQuestionDoc!.data!.dataId).toBe('q5Id');
      expect(env.questions.length).toEqual(16);

      let question = env.selectQuestion(1);
      // Trigger route change that should happen when activating question from a different book/chapter
      env.setBookChapter('MAT', 1);
      expect(env.getQuestionText(question)).toBe('Matthew question relating to chapter 1');
      expect(await env.getCurrentBookAndChapter()).toBe('Matthew 1');

      question = env.selectQuestion(16);
      env.setBookChapter('JHN', 2);
      expect(env.getQuestionText(question)).toBe('John 2');
      expect(await env.getCurrentBookAndChapter()).toBe('John 2');
    }));

    it('start question respects route book/chapter', fakeAsync(async () => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'MAT',
        projectChapterRoute: 1,
        questionScope: 'all'
      });

      // Question 5 has been stored as the question to start at, but route book/chapter is forced to MAT 1,
      // so active question must be from MAT 1
      expect(env.component.questionsList!.activeQuestionDoc!.data!.dataId).toBe('q16Id');
      flush();
      discardPeriodicTasks();
    }));

    it('can select a question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const question = env.selectQuestion(1);
      expect(question.classes['selected']).toBe(true);
    }));

    it('question status change to read', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      let question = env.selectQuestion(2, false);
      expect(question.classes['question-read']).toBeUndefined();
      question = env.selectQuestion(3);
      expect(question.classes['question-read']).toBe(true);
    }));

    it('question status change to answered', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const question = env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      tick(100);
      env.fixture.detectChanges();
      expect(question.classes['question-answered']).toBe(true);
      tick();
      flush();
    }));

    it('question shows answers icon and total', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const question = env.selectQuestion(6, false);
      expect(env.getUnread(question)).toEqual(1);
      tick(env.questionReadTimer);
      env.fixture.detectChanges();
      expect(env.getUnread(question)).toEqual(0);
      env.waitForAudioPlayer();
    }));

    it('allows admin to archive a question', fakeAsync(async () => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      env.selectQuestion(1);
      const question = env.component.answersPanel!.questionDoc!.data!;
      expect(question.isArchived).toBe(false);
      expect(env.component.questionDocs.length).toEqual(14);
      expect(env.component.questionVerseRefs.length).toEqual(14);

      env.archiveQuestionButton.nativeElement.click();
      env.waitForQuestionTimersToComplete();

      expect(question.isArchived).toBe(true);
      expect(env.component.questionDocs.length).toEqual(13);
      expect(env.component.questionVerseRefs.length).toEqual(13);
    }));

    it('opens a dialog when edit question is clicked', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 2,
        questionScope: 'chapter'
      });
      env.selectQuestion(1);
      when(mockedQuestionDialogService.questionDialog(anything())).thenResolve(
        env.component.questionsList!.activeQuestionDoc
      );
      const questionId = 'q15Id';
      verify(
        mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, questionId, 'audioFile.mp3')
      ).times(3);
      env.clickButton(env.editQuestionButton);
      verify(mockedDialogService.confirm(anything(), anything())).never();
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      tick(env.questionReadTimer);
      verify(
        mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, questionId, 'audioFile.mp3')
      ).times(4);
      expect().nothing();
    }));

    it('removes audio player when question audio deleted', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 2,
        questionScope: 'chapter'
      });
      const questionId = 'q15Id';
      const questionDoc = cloneDeep(env.getQuestionDoc(questionId));
      questionDoc.submitJson0Op(op => {
        op.unset(qd => qd.audioUrl!);
      });
      when(mockedQuestionDialogService.questionDialog(anything())).thenResolve(questionDoc);
      env.selectQuestion(1);
      expect(env.audioPlayerOnQuestion).not.toBeNull();
      verify(
        mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, questionId, 'audioFile.mp3')
      ).times(3);
      env.clickButton(env.editQuestionButton);
      env.waitForSliderUpdate();
      expect(env.audioPlayerOnQuestion).toBeNull();
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, questionId, undefined)).times(
        5
      );
      flush();
    }));

    it('uploads audio then updates audio url', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'book',
        hasConnection: false
      });
      env.selectQuestion(14);
      const questionId = 'q14Id';
      const questionDoc = cloneDeep(env.getQuestionDoc(questionId));
      expect(env.component.answersPanel?.getFileSource(questionDoc.data?.audioUrl)).toBeUndefined();
      questionDoc.submitJson0Op(op => {
        op.set<string>(qd => qd.audioUrl!, 'anAudioFile.mp3');
      });
      when(mockedQuestionDialogService.questionDialog(anything())).thenResolve(questionDoc);
      env.clickButton(env.editQuestionButton);
      // Simulate going online after the answer is edited
      resetCalls(mockedFileService);
      env.onlineStatus = true;
      env.fileSyncComplete.next();
      tick();
      env.fixture.detectChanges();
      expect(env.component.answersPanel?.getFileSource(questionDoc.data?.audioUrl)).toBeDefined();
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, 'questions', questionId, 'anAudioFile.mp3')).once();
      env.waitForAudioPlayer();
      flush();
      discardPeriodicTasks();
    }));

    it('user must confirm question answered dialog before question dialog appears', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      when(mockedDialogService.confirm(anything(), anything())).thenResolve(false);
      // Edit a question with answers
      env.selectQuestion(6);
      env.clickButton(env.editQuestionButton);
      verify(mockedDialogService.confirm(anything(), anything())).once();
      when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
      env.clickButton(env.editQuestionButton);
      verify(mockedDialogService.confirm(anything(), anything())).twice();
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect().nothing();
    }));

    it('should move highlight and question icon when question is edited to move verses', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(1);
      env.waitForSliderUpdate();
      expect(env.segmentHasQuestion(1, 1)).toBe(true);
      expect(env.isSegmentHighlighted(1, 1)).toBe(true);
      expect(env.segmentHasQuestion(1, 5)).toBe(false);
      expect(env.isSegmentHighlighted(1, 5)).toBe(false);
      when(mockedQuestionDialogService.questionDialog(anything())).thenCall((config: QuestionDialogData) => {
        config.questionDoc!.submitJson0Op(op =>
          op.set(q => q.verseRef, { bookNum: 43, chapterNum: 1, verseNum: 5, verse: '5' })
        );
        return config.questionDoc;
      });

      env.clickButton(env.editQuestionButton);
      env.realtimeService.updateAllSubscribeQueries();
      tick(100);
      env.fixture.detectChanges();

      expect(env.segmentHasQuestion(1, 1)).toBe(true);
      expect(env.isSegmentHighlighted(1, 1)).toBe(false);
      expect(env.isSegmentHighlighted(1, 5)).toBe(true);
      expect(env.segmentHasQuestion(1, 5)).toBe(true);
      expect(env.component.questionVerseRefs.some(verseRef => verseRef.equals(new VerseRef('JHN 1:5')))).toBe(true);
      tick();
      flush();
    }));

    it('records audio for question when button clicked', fakeAsync(() => {
      const mockedDialogRef = mock(MatDialogRef);
      when(mockedDialogRef.afterClosed()).thenReturn(
        of({ audio: { fileName: 'audio.mp3', status: 'processed', blob: new Blob() } as AudioAttachment })
      );
      when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(mockedDialogRef));
      const env = new TestEnvironment({ user: ADMIN_USER });
      expect(env.recordQuestionButton).not.toBeNull();
      env.clickButton(env.recordQuestionButton);
      verify(mockedDialogService.openMatDialog(AudioRecorderDialogComponent, anything())).once();
      verify(
        mockedFileService.uploadFile(
          FileType.Audio,
          'project01',
          QuestionDoc.COLLECTION,
          'q1Id',
          getQuestionDocId('project01', 'q1Id'),
          anything(),
          'audio.mp3',
          anything()
        )
      ).once();
      flush();
      discardPeriodicTasks();
    }));

    it('hides record question button when question has audio', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(15);
      expect(env.recordQuestionButton).toBeNull();
    }));

    it('unread answers badge is only visible when the setting is ON to see other answers', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      expect(env.getUnread(env.questions[5])).toEqual(1);
      env.setSeeOtherUserResponses(false);
      expect(env.getUnread(env.questions[5])).toEqual(0);
      flush();
      discardPeriodicTasks();
    }));

    it('unread answers badge always hidden from community checkers', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      // One unread answer and three comments are hidden
      expect(env.getUnread(env.questions[6])).toEqual(0);
      env.setSeeOtherUserResponses(false);
      expect(env.getUnread(env.questions[6])).toEqual(0);
      flush();
      discardPeriodicTasks();
    }));

    it('responds to remote question added', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      const questionId = env.component.questionsList!.activeQuestionDoc!.id;
      expect(env.questions.length).toEqual(14);
      const dateNow = new Date();
      const newQuestion: Question = {
        dataId: objectId(),
        ownerRef: ADMIN_USER.id,
        projectRef: 'project01',
        text: 'Admin just added a question.',
        answers: [],
        verseRef: { bookNum: 43, chapterNum: 1, verseNum: 10, verse: '10-11' },
        isArchived: false,
        dateCreated: dateNow.toJSON(),
        dateModified: dateNow.toJSON()
      };
      env.insertQuestion(newQuestion);
      env.waitForSliderUpdate();
      env.waitForAudioPlayer();
      expect(env.component.questionsList!.activeQuestionDoc!.id).toBe(questionId);
      expect(env.questions.length).toEqual(15);
      let question = env.selectQuestion(15);
      expect(env.getQuestionText(question)).toBe('Admin just added a question.');
    }));

    it('question with audio and no text should display book/chapter as a reference', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      const dateNow = new Date();
      const newQuestion: Question = {
        dataId: objectId(),
        ownerRef: ADMIN_USER.id,
        projectRef: 'project01',
        text: '',
        audioUrl: 'audioFile.mp3',
        answers: [],
        verseRef: { bookNum: 43, chapterNum: 1, verseNum: 10 },
        isArchived: false,
        dateCreated: dateNow.toJSON(),
        dateModified: dateNow.toJSON()
      };
      tick(3000);
      env.insertQuestion(newQuestion);
      env.waitForSliderUpdate();
      env.waitForAudioPlayer();

      const question = env.selectQuestion(15);
      expect(env.getQuestionText(question)).toBe('John 1:10');
      env.waitForAudioPlayer();
    }));

    it('respond to remote question audio added or removed', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(1);
      expect(env.audioPlayerOnQuestion).toBeNull();
      env.simulateRemoteEditQuestionAudio('filename.mp3');
      expect(env.audioPlayerOnQuestion).not.toBeNull();
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, 'q1Id', 'filename.mp3')).times(
        8
      );
      resetCalls(mockedFileService);
      env.simulateRemoteEditQuestionAudio(undefined);
      expect(env.audioPlayerOnQuestion).toBeNull();
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, 'q1Id', undefined)).times(8);
      env.selectQuestion(2);
      env.simulateRemoteEditQuestionAudio('filename2.mp3');
      env.waitForSliderUpdate();
      verify(
        mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, 'q2Id', 'filename2.mp3')
      ).times(8);
      flush();
    }));

    it('question added to another book changes the route to that book and activates the question', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const dateNow = new Date();
      const newQuestion: Question = {
        dataId: objectId(),
        ownerRef: ADMIN_USER.id,
        projectRef: 'project01',
        text: 'Admin just added a question.',
        answers: [],
        verseRef: { bookNum: 40, chapterNum: 1, verseNum: 10, verse: '10' },
        isArchived: false,
        dateCreated: dateNow.toJSON(),
        dateModified: dateNow.toJSON()
      };
      env.insertQuestion(newQuestion);
      env.activateQuestion(newQuestion.dataId);
      expect(env.location.path()).toEqual('/projects/project01/checking/MAT/1?scope=book');
      env.activateQuestion('q1Id');
      expect(env.location.path()).toEqual('/projects/project01/checking/JHN/1?scope=book');
    }));

    it('admin can see appropriate filter options', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      expect(env.component.questionFilters.has(QuestionFilter.None)).withContext('All').toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.HasAnswers)).withContext('HasAnswers').toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.NoAnswers)).withContext('NoAnswers').toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.StatusExport)).withContext('StatusExport').toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.StatusResolved))
        .withContext('StatusResolved')
        .toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.StatusNone)).withContext('StatusNone').toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.CurrentUserHasAnswered))
        .withContext('CurrentUserHasAnswered')
        .toEqual(false);
      expect(env.component.questionFilters.has(QuestionFilter.CurrentUserHasNotAnswered))
        .withContext('CurrentUserHasNotAnswered')
        .toEqual(false);
      flush();
      discardPeriodicTasks();
    }));

    it('non-admin can see appropriate filter options', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      expect(env.component.questionFilters.has(QuestionFilter.None)).withContext('All').toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.HasAnswers)).withContext('HasAnswers').toEqual(false);
      expect(env.component.questionFilters.has(QuestionFilter.NoAnswers)).withContext('NoAnswers').toEqual(false);
      expect(env.component.questionFilters.has(QuestionFilter.StatusExport)).withContext('StatusExport').toEqual(false);
      expect(env.component.questionFilters.has(QuestionFilter.StatusResolved))
        .withContext('StatusResolved')
        .toEqual(false);
      expect(env.component.questionFilters.has(QuestionFilter.StatusNone)).withContext('StatusNone').toEqual(false);
      expect(env.component.questionFilters.has(QuestionFilter.CurrentUserHasAnswered))
        .withContext('CurrentUserHasAnswered')
        .toEqual(true);
      expect(env.component.questionFilters.has(QuestionFilter.CurrentUserHasNotAnswered))
        .withContext('CurrentUserHasNotAnswered')
        .toEqual(true);
      flush();
      discardPeriodicTasks();
    }));

    it('can filter questions', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      const totalQuestions = env.questions.length;
      const expectedQuestionCounts: { filter: QuestionFilter; total: number }[] = [
        { filter: QuestionFilter.None, total: 14 },
        { filter: QuestionFilter.HasAnswers, total: 4 },
        { filter: QuestionFilter.NoAnswers, total: 10 },
        { filter: QuestionFilter.StatusExport, total: 2 },
        { filter: QuestionFilter.StatusResolved, total: 1 },
        { filter: QuestionFilter.StatusNone, total: 3 },
        { filter: QuestionFilter.CurrentUserHasAnswered, total: 2 },
        { filter: QuestionFilter.CurrentUserHasNotAnswered, total: 12 }
      ];
      expectedQuestionCounts.forEach(expected => {
        env.setQuestionFilter(expected.filter);
        expect(env.questions.length)
          .withContext(env.component.appliedQuestionFilterKey ?? '')
          .toEqual(expected.total);
        const expectedVisibleQuestionTotal =
          expected.total + (expected.total < totalQuestions ? '/' + totalQuestions : '');
        expect(env.questionFilterTotal)
          .withContext(env.component.appliedQuestionFilterKey ?? '')
          .toEqual(`(${expectedVisibleQuestionTotal})`);
      });
    }));

    it('show no questions message for filter', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'MAT',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      expect(env.questions.length).toEqual(1);
      env.setQuestionFilter(QuestionFilter.StatusExport);
      expect(env.questions.length).toEqual(0);
      expect(env.noQuestionsFound).not.toBeNull();
    }));

    it('should update question summary when filtered', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      expect(env.questions.length).toEqual(14);
      // Wait for the first question to be read
      tick(2000);
      // Admin has already read 2 questions and the 3rd is read on load
      expect(env.component.summary.unread).toEqual(11);
      env.setQuestionFilter(QuestionFilter.NoAnswers);
      expect(env.questions.length).toEqual(10);
      // The first question after filter has now been read
      expect(env.component.summary.unread).toEqual(9);
      flush();
    }));

    it('should reset filtering after a new question is added', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      expect(env.questions.length).toEqual(14);
      env.setQuestionFilter(QuestionFilter.StatusResolved);
      expect(env.questions.length).toEqual(1);

      // Technically this is an existing question returned but the test is to confirm the filter reset
      const questionDoc = env.getQuestionDoc('q5Id');
      when(mockedQuestionDialogService.questionDialog(anything())).thenResolve(questionDoc);
      env.clickButton(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect(env.component.activeQuestionFilter).toEqual(QuestionFilter.None);
      expect(env.questions.length).toEqual(14);
      env.waitForQuestionTimersToComplete();
    }));

    it('can narrow questions scope', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'all'
      });
      expect(env.questions.length).toEqual(16);
      env.setQuestionScope('book');
      tick(100);
      env.fixture.detectChanges();
      expect(env.questions.length).toEqual(15);
      env.setQuestionScope('chapter');
      tick(100);
      env.fixture.detectChanges();
      expect(env.questions.length).toEqual(14);
      tick();
      flush();
      discardPeriodicTasks();
    }));

    it('can expand questions scope', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });
      expect(env.questions.length).toEqual(14);
      env.setQuestionScope('book');
      tick(100);
      env.fixture.detectChanges();
      expect(env.questions.length).toEqual(15);
      env.setQuestionScope('all');
      tick(100);
      env.fixture.detectChanges();
      expect(env.questions.length).toEqual(16);
      tick();
      flush();
      discardPeriodicTasks();
    }));

    it('questions display when offline', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        hasConnection: false
      });

      expect(env.questions.length).toBeGreaterThan(0);
      flush();
      discardPeriodicTasks();
    }));

    it('should update question refs and question donut summary when archiving the last remaining visible question', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'MAT',
        projectChapterRoute: 1,
        questionScope: 'chapter'
      });

      env.selectQuestion(1);
      env.archiveQuestionButton.nativeElement.click();

      const spyUpdateQuestionRefs = spyOn<any>(env.component, 'updateQuestionRefs');
      const spyRefreshSummary = spyOn<any>(env.component, 'refreshSummary');

      env.waitForQuestionTimersToComplete();

      expect(spyUpdateQuestionRefs).toHaveBeenCalledTimes(1);
      expect(spyRefreshSummary).toHaveBeenCalledTimes(1);
    }));
  });

  describe('Answers', () => {
    it('answer panel is initiated and shows the first question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      expect(env.answerPanel).not.toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('can answer a question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(2);
      // Checker user already has an answer on question 6 and 9
      expect(env.component.summary.answered).toEqual(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answer question 2');
      expect(env.component.summary.answered).toEqual(3);
      flush();
    }));

    it('opens edit display name dialog if answering a question for the first time', fakeAsync(() => {
      const env = new TestEnvironment({ user: CLEAN_CHECKER_USER });
      env.selectQuestion(2);
      env.answerQuestion('Answering question 2 should pop up a dialog');
      verify(mockedUserService.editDisplayName(true)).once();
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answering question 2 should pop up a dialog');
      flush();
    }));

    it('does not open edit display name dialog if offline', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CLEAN_CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'book',
        hasConnection: false
      });
      env.selectQuestion(2);
      env.answerQuestion('Answering question 2 offline');
      verify(mockedUserService.editDisplayName(anything())).never();
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answering question 2 offline');
      flush();
    }));

    it('inserts newer answer above older answers', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      env.answerQuestion('Just added answer');
      expect(env.answers.length).toEqual(2);
      expect(env.getAnswerText(0)).toBe('Just added answer');
      expect(env.getAnswerText(1)).toBe('Answer 7 on question');
      flush();
    }));

    it('saves the location of the last visited question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const projectUserConfigDoc = env.component.projectUserConfigDoc!.data!;
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).once();
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q5Id');
      env.component.projectDoc!.submitJson0Op(op => {
        op.set<boolean>(p => p.translateConfig.translationSuggestionsEnabled, false);
      });
      env.waitForSliderUpdate();
      env.selectQuestion(4);
      expect(projectUserConfigDoc.selectedTask).toBe('checking');
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q4Id');
      expect(projectUserConfigDoc.selectedBookNum).toBe(43);
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).once();
    }));

    it('saves the last visited question in all question context', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'all'
      });
      const projectUserConfigDoc = env.component.projectUserConfigDoc!.data!;
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).once();
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q5Id');
      env.selectQuestion(4);
      expect(projectUserConfigDoc.selectedTask).toBe('checking');
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q3Id');
      expect(projectUserConfigDoc.selectedBookNum).toBe(43);
      expect(projectUserConfigDoc.selectedChapterNum).toBe(1);
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).twice();
    }));

    it('can cancel answering a question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).not.toBeNull();
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).toBeNull();
      expect(env.addAnswerButton).not.toBeNull();
      flush();
    }));

    it('does not save the answer when storage quota exceeded', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      when(
        mockedFileService.uploadFile(
          FileType.Audio,
          'project01',
          QuestionDoc.COLLECTION,
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenResolve(undefined);

      env.selectQuestion(1);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      expect(env.saveAnswerButton).not.toBeNull();
      const answerAction: AnswerAction = {
        action: 'save',
        text: 'answer 01',
        verseRef: fromVerseRef(new VerseRef('JHN 1:1')),
        audio: {
          status: 'processed',
          fileName: 'audioFile.mp3',
          blob: getAudioBlob()
        }
      };
      env.component.answerAction(answerAction);
      env.waitForSliderUpdate();
      const questionDoc = env.component.questionsList!.activeQuestionDoc!;
      expect(questionDoc.data!.answers.length).toEqual(0);
      expect(env.saveAnswerButton).not.toBeNull();
      flush();
    }));

    it('check answering validation', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.answerFormErrors[0].classes['visible']).toBe(true);
      flush();
    }));

    it('can edit a new answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      env.answerQuestion('Answer question 7');
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      env.clickButton(env.getAnswerEditButton(myAnswerIndex));
      env.setTextFieldValue(env.yourAnswerField, 'Edited question 7 answer');
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(0)).toBe('Edited question 7 answer');
      flush();
    }));

    it('can edit an existing answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      // Open up question where user already has an answer
      env.selectQuestion(9);
      expect(env.answers.length).withContext('setup problem').toBeGreaterThan(1);
      expect(env.component.answersPanel!.answers.some(answer => answer.ownerRef === CHECKER_USER.id))
        .withContext('setup problem')
        .toBe(true);
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswerText(myAnswerIndex)).withContext('setup problem').toEqual('Answer 0 on question');
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswer(otherAnswerIndex).classes['attention'])
        .withContext('have already read this answer')
        .toBeUndefined();

      // Edit, save
      env.clickButton(env.getAnswerEditButton(myAnswerIndex));
      env.setTextFieldValue(env.yourAnswerField, 'Edited answer');
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(myAnswerIndex)).toEqual('Edited answer');

      // Edit, cancel
      env.clickButton(env.getAnswerEditButton(myAnswerIndex));
      env.setTextFieldValue(env.yourAnswerField, 'Different edit, to cancel');
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention'])
        .withContext("don't spotlight own answer on cancelled edit")
        .toBeUndefined();
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(myAnswerIndex)).withContext('should not have been changed').toEqual('Edited answer');
      flush();
    }));

    it('highlights remotely edited answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(9);
      const otherAnswerIndex = 1;
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(otherAnswerIndex)).toBe('Answer 1 on question');

      env.simulateRemoteEditAnswer(otherAnswerIndex, 'Question 9 edited answer');
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswerText(otherAnswerIndex)).toBe('Question 9 edited answer');
      flush();
    }));

    it('does not highlight upon sync', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(9);
      const answerIndex = 1;
      expect(env.getAnswer(answerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(answerIndex)).toBe('Answer 1 on question');

      env.simulateSync(answerIndex);
      expect(env.getAnswer(answerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(answerIndex)).toBe('Answer 1 on question');
      flush();
    }));

    it('still shows answers as read after canceling an edit', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      env.answerQuestion('Answer question 7');
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      env.clickButton(env.getAnswerEditButton(0));
      env.setTextFieldValue(env.yourAnswerField, 'Edited question 7 answer');
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(0)).toEqual('Answer question 7');
      flush();
    }));

    it('only my answer is highlighted after I add an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      env.answerQuestion('My answer');
      expect(env.answers.length).withContext('setup problem').toBeGreaterThan(1);
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      flush();
    }));

    it('can remove audio from answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const data: FileOfflineData = { id: 'a6Id', dataCollection: 'questions', blob: getAudioBlob() };
      when(mockedFileService.findOrUpdateCache(FileType.Audio, 'questions', 'a6Id', '/audio.mp3')).thenResolve(data);
      env.selectQuestion(6);
      env.clickButton(env.getAnswerEditButton(0));
      env.waitForSliderUpdate();
      env.component.answersPanel.submit({ text: 'Answer 6 on question', audio: { status: 'reset' } });
      env.waitForSliderUpdate();
      verify(
        mockedFileService.deleteFile(FileType.Audio, 'project01', QuestionDoc.COLLECTION, 'a6Id', CHECKER_USER.id)
      ).once();
      expect().nothing();
      flush();
    }));

    it('saves audio answer offline and plays from cache', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'JHN',
        projectChapterRoute: 1,
        questionScope: 'book',
        hasConnection: false
      });
      const resolveUpload$: Subject<void> = env.resolveFileUploadSubject('blob://audio');
      env.answerQuestion('An offline answer', 'audioFile.mp3');
      resolveUpload$.next();
      env.waitForSliderUpdate();
      verify(
        mockedFileService.uploadFile(
          FileType.Audio,
          'project01',
          'questions',
          anything(),
          anything(),
          anything(),
          'audioFile.mp3',
          anything()
        )
      ).once();
      expect(env.component.answersPanel?.answers.length).toEqual(1);
      const newAnswer = env.component.answersPanel!.answers[0];
      expect(newAnswer.audioUrl).toEqual('blob://audio');
      expect(env.component.answersPanel?.getFileSource(newAnswer.audioUrl)).toBeDefined();
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, 'questions', anything(), 'blob://audio'));
      flush();
      discardPeriodicTasks();
    }));

    it('saves the answer to the correct question when active question changed', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const resolveUpload$: Subject<void> = env.resolveFileUploadSubject('uploadedFile.mp3');
      env.selectQuestion(1);
      env.answerQuestion('Answer with audio', 'audioFile.mp3');
      expect(env.answers.length).toEqual(0);
      const question = env.getQuestionDoc('q1Id');
      expect(env.saveAnswerButton).not.toBeNull();
      env.selectQuestion(2);
      resolveUpload$.next();
      env.waitForSliderUpdate();
      expect(question.data!.answers.length).toEqual(1);
      flush();
    }));

    it('can delete an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      env.clickButton(env.answerDeleteButton(0));
      env.waitForSliderUpdate();
      expect(env.answers.length).toEqual(0);
      verify(
        mockedFileService.deleteFile(FileType.Audio, 'project01', QuestionDoc.COLLECTION, 'a6Id', CHECKER_USER.id)
      ).once();
      flush();
    }));

    it('can delete correct answer after changing chapters', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      env.component.chapter!++;
      env.clickButton(env.answerDeleteButton(0));
      env.waitForSliderUpdate();
      expect(env.answers.length).toEqual(0);
      flush();
    }));

    it('answers reset when changing questions', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      env.selectQuestion(1);
      expect(env.answers.length).toEqual(0);
    }));

    it("checker user can like and unlike another's answer", fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      env.answerQuestion('Answer question 7');
      expect(env.getAnswerText(1)).toBe('Answer 7 on question');
      expect(env.getLikeTotal(1)).toBe(0);
      env.clickButton(env.likeButtons[1]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(1)).toBe(1);
      expect(env.likeButtons[1].classes.liked).toBe(true);
      env.clickButton(env.likeButtons[1]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(1)).toBe(0);
      expect(env.likeButtons[1].classes.like).toBeUndefined();
      flush();
    }));

    it('cannot like your own answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(1);
      env.answerQuestion('Answer question to be liked');
      expect(env.getLikeTotal(0)).toBe(0);
      env.clickButton(env.likeButtons[0]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(0)).toBe(0);
      verify(mockedNoticeService.show('You cannot like your own answer.')).once();
      flush();
    }));

    it('observer cannot like an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: OBSERVER_USER });
      env.selectQuestion(7);
      expect(env.getAnswerText(0)).toBe('Answer 7 on question');
      expect(env.getLikeTotal(0)).toBe(0);
      env.clickButton(env.likeButtons[0]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(0)).toBe(0);
      verify(mockedNoticeService.show("You don't have permission to like answers.")).once();
    }));

    it("admin user can like and unlike another's answer", fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(9);
      expect(env.getAnswerText(0)).toBe('Answer 0 on question');
      expect(env.getAnswerText(1)).toBe('Answer 1 on question');
      expect(env.getLikeTotal(0)).toBe(0);
      expect(env.getLikeTotal(1)).toBe(0);
      env.clickButton(env.likeButtons[0]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(0)).toBe(1);
      expect(env.getLikeTotal(1)).toBe(0);
      expect(env.likeButtons[0].classes.liked).toBe(true);
      expect(env.likeButtons[1].classes.liked).toBeUndefined();
      env.clickButton(env.likeButtons[0]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(0)).toBe(0);
      expect(env.getLikeTotal(1)).toBe(0);
      expect(env.likeButtons[0].classes.like).toBeUndefined();
      expect(env.likeButtons[1].classes.like).toBeUndefined();
      flush();
    }));

    it('hides the like icon if see other users responses is disabled', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      expect(env.likeButtons.length).toEqual(1);
      env.setSeeOtherUserResponses(false);
      expect(env.likeButtons.length).toEqual(0);
      env.setSeeOtherUserResponses(true);
      expect(env.likeButtons.length).toEqual(1);
    }));

    it('do not show answers until current user has submitted an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      expect(env.getUnread(env.questions[6])).toEqual(0);
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      env.answerQuestion('Answer from checker');
      expect(env.answers.length).toBe(2);
      flush();
    }));

    it('checker can only see their answers when the setting is OFF to see other answers', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.setSeeOtherUserResponses(false);
      env.selectQuestion(6);
      expect(env.answers.length).toBe(1);
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      env.answerQuestion('Answer from checker');
      expect(env.answers.length).toBe(1);
      flush();
    }));

    it('can add scripture to an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const selection: TextSelection = {
        verses: { bookNum: 43, chapterNum: 2, verseNum: 2, verse: '2-5' },
        text: 'The selected text',
        startClipped: true,
        endClipped: false
      };
      when(env.mockedTextChooserDialogComponent.afterClosed()).thenReturn(of(selection));
      env.selectQuestion(1);
      env.clickButton(env.addAnswerButton);
      env.setTextFieldValue(env.yourAnswerField, 'Answer question');
      expect(env.scriptureText).toBeFalsy();
      // Add scripture
      env.clickButton(env.selectVersesButton);
      expect(env.scriptureText).toBe('John 2:2-5');
      env.clickButton(env.saveAnswerButton);
      expect(env.getAnswerScriptureText(0)).toBe('…The selected text(John 2:2-5)');
      flush();
      discardPeriodicTasks();
    }));

    it('can remove scripture from an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(6);
      expect(env.getAnswerScriptureText(0)).toBe('Quoted scripture(John 1:1)');
      env.clickButton(env.getAnswerEditButton(0));
      env.waitForSliderUpdate();
      env.clickButton(env.clearScriptureButton);
      expect(env.selectVersesButton).not.toBeNull();
      flush();
      discardPeriodicTasks();
    }));

    it('observer cannot answer a question', fakeAsync(() => {
      const env = new TestEnvironment({ user: OBSERVER_USER });
      env.selectQuestion(2);
      expect(env.addAnswerButton).toBeNull();
    }));

    it('project admins can only edit own answers', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerEditButton(0)).toBeNull();
      env.selectQuestion(7);
      expect(env.getAnswerEditButton(0)).not.toBeNull();
    }));

    it('new remote answers from other users are not displayed until requested', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });

      env.selectQuestion(7);
      expect(env.totalAnswersMessageCount).withContext('setup').toBeNull();
      env.answerQuestion('New answer from current user');

      // Answers count as displayed in HTML.
      expect(env.totalAnswersMessageCount).toEqual(2);
      // Individual answers in HTML.
      expect(env.answers.length).withContext('setup').toEqual(2);
      // Answers in code.
      expect(env.component.answersPanel!.answers.length).withContext('setup').toEqual(2);

      expect(env.showUnreadAnswersButton).toBeNull();

      env.simulateNewRemoteAnswer();

      // The new answer does not show up yet.
      expect(env.answers.length).toEqual(2);
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      expect(env.component.answersPanel!.projectUserConfigDoc!.data!.answerRefsRead.length).toEqual(3);
      expect(env.totalAnswersMessageCount).toEqual(3);

      // But a show-unread-answers control appears.
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.unreadAnswersBannerCount).toEqual(1);

      // Clicking makes the answer appear and the control go away.
      env.clickButton(env.showUnreadAnswersButton);
      tick(env.questionReadTimer);
      expect(env.answers.length).toEqual(3);
      expect(env.component.answersPanel!.answers.length).toEqual(3);
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.component.answersPanel!.projectUserConfigDoc!.data!.answerRefsRead.length).toEqual(4);
      expect(env.totalAnswersMessageCount).toEqual(3);
    }));

    it('new remote answers from other users are not displayed to proj admin until requested', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      // Select a question with at least one answer, but with no answers
      // authored by the project admin since that was hindering this test.
      env.selectQuestion(6);

      expect(env.answers.length).withContext('setup').toEqual(1);
      expect(env.component.answersPanel!.answers.length).withContext('setup').toEqual(1);
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.totalAnswersMessageCount).toEqual(1);

      env.simulateNewRemoteAnswer();

      // New remote answer is buffered rather than shown immediately.
      expect(env.answers.length).toEqual(1);
      expect(env.component.answersPanel!.answers.length).toEqual(1);
      expect(env.totalAnswersMessageCount).toEqual(2);

      // show-unread-answers banner appears.
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.unreadAnswersBannerCount).toEqual(1);

      // clicking on the unread answer badge and waiting 2s does not show the unread answer
      expect(env.getUnread(env.selectQuestion(6))).toEqual(1);
      expect(env.showUnreadAnswersButton).not.toBeNull();

      // Clicking makes the answer appear and the control go away.
      env.clickButton(env.showUnreadAnswersButton);
      tick(env.questionReadTimer);
      expect(env.answers.length).toEqual(2);
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.totalAnswersMessageCount).toEqual(2);
    }));

    it('proj admin sees total answer count if >0 answers', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      // Select a question with at least one answer, but with no answers
      // authored by the project admin, in case that hinders this test.
      env.selectQuestion(6);

      expect(env.answers.length).withContext('setup').toEqual(1);
      expect(env.component.answersPanel!.answers.length).withContext('setup').toEqual(1);
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.totalAnswersMessageCount).toEqual(1);
      // Delete only answer on question.
      env.deleteAnswer('a6Id');

      // Total answers header goes away.
      expect(env.totalAnswersMessageCount).toBeNull();

      // A remote answer is added
      env.simulateNewRemoteAnswer('remoteAnswerId123');
      // The total answers header comes back.
      expect(env.totalAnswersMessageCount).toEqual(1);
      flush();
    }));

    it("new remote answers and banner don't show, if user has not yet answered the question", fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      expect(env.answers.length).withContext('setup (no answers in DOM yet)').toEqual(0);
      expect(env.component.answersPanel!.answers.length).withContext('setup').toEqual(1);
      expect(env.totalAnswersMessageCount).toBeNull();

      // Another user adds an answer, but with no impact on the current user's screen yet.
      env.simulateNewRemoteAnswer();
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.answers.length).withContext('broken unrelated functionality').toEqual(0);
      // Incoming remote answer should have been absorbed into the set of
      // answers pending to show, since user was looking at the Add Answer button
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      // We don't show the total answer count in the heading until the user adds her answer.
      expect(env.totalAnswersMessageCount).toBeNull();

      // Current user adds her answer, and all answers show.
      env.answerQuestion('New answer from current user');
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.answers.length).toEqual(3);
      expect(env.component.answersPanel!.answers.length).toEqual(3);
      flush();
    }));

    it('show-remote-answer banner disappears if user deletes their answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.answers.length).withContext('setup').toEqual(2);
      expect(env.component.answersPanel!.answers.length).withContext('setup').toEqual(2);
      expect(env.showUnreadAnswersButton).toBeNull();

      // A remote answer is added, but the current user does not click the banner to show the remote answer.
      env.simulateNewRemoteAnswer();
      expect(env.answers.length).toEqual(2);
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.unreadAnswersBannerCount).toEqual(1);
      expect(env.totalAnswersMessageCount).toEqual(3);

      // The current user deletes her own answer, which puts her back to just seeing the Add answer button. She
      // should not see any other answers or the show-remote banner.
      // This spec is not concerning itself with other interesting ways for the current user's answer to be deleted,
      // other than them deleting their own answer on the current checking-answers.component.
      env.deleteAnswerOwnedBy();
      expect(env.addAnswerButton).not.toBeNull();
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.answers.length).toEqual(0);
      // Behind the scenes, the showable answer list should have absorbed any pending remote answers, but also lost the
      // current users answer. So it was 2, lost 1 (deleted), and gained 1 (which was pending), and so stayed at 2.
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      // Total answers heading is not shown if user deleted her answer.
      expect(env.totalAnswersMessageCount).toBeNull();

      // Adding an answer should result in seeing all answers, and no banner.
      env.answerQuestion('New/replaced answer from current user');
      expect(env.answers.length).toEqual(3);
      expect(env.component.answersPanel!.answers.length).toEqual(3);
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.totalAnswersMessageCount).toEqual(3);

      // A remote answer at this point makes the banner show, tho.
      env.simulateNewRemoteAnswer('answerId12345', 'another remote answer');
      expect(env.answers.length).toEqual(3);
      expect(env.component.answersPanel!.answers.length).toEqual(3);
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.unreadAnswersBannerCount).toEqual(1);
      expect(env.totalAnswersMessageCount).toEqual(4);
      flush();
    }));

    it('show-remote-answer banner disappears if the un-shown remote answer is deleted', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.answers.length).withContext('setup').toEqual(2);
      expect(env.component.answersPanel!.answers.length).withContext('setup').toEqual(2);
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.totalAnswersMessageCount).toEqual(2);

      // A remote answer is added and then deleted, before the current user clicks the banner to show the remote answer.
      env.simulateNewRemoteAnswer('remoteAnswerId123');
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.totalAnswersMessageCount).toEqual(3);
      env.deleteAnswer('remoteAnswerId123');
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.answers.length).toEqual(2);
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      expect(env.totalAnswersMessageCount).toEqual(2);
      flush();
      discardPeriodicTasks();
    }));

    it('show-remote-answer banner not shown if user is editing their answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.showUnreadAnswersButton).withContext('setup').toBeNull();
      expect(env.answers.length).withContext('setup').toEqual(2);
      // A remote answer is added, but the current user does not click the banner to show the remote answer.
      env.simulateNewRemoteAnswer();
      expect(env.showUnreadAnswersButton).withContext('setup').not.toBeNull();
      // The current user edits their own answer.
      env.clickButton(env.getAnswerEditButton(0));
      //  They should not see the show-more banner.
      expect(env.showUnreadAnswersButton).toBeNull();

      env.setTextFieldValue(env.yourAnswerField, 'edited answer value');
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      // After done editing their answer, they should see the banner
      // again. And buffered answers should not have been released.
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.answers.length).toEqual(2);
      expect(env.totalAnswersMessageCount).toEqual(3);
      expect(env.unreadAnswersBannerCount).toEqual(1);
      flush();
    }));

    it('show-remote-answer banner not shown to user if see-others-answers is disabled', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.setSeeOtherUserResponses(false);
      expect(env.component.projectDoc!.data!.checkingConfig.usersSeeEachOthersResponses)
        .withContext('setup')
        .toBe(false);
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.totalAnswersMessageText).withContext('setup').toEqual('Your answer');

      // A remote answer is added.
      env.simulateNewRemoteAnswer();
      expect(env.totalAnswersMessageText).toEqual('Your answer');
      // Banner is not shown
      expect(env.showUnreadAnswersButton).toBeNull();
      flush();
    }));

    it('show-remote-answer banner still shown to proj admin if see-others-answers is disabled', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.setSeeOtherUserResponses(false);
      expect(env.component.projectDoc!.data!.checkingConfig.usersSeeEachOthersResponses)
        .withContext('setup')
        .toBe(false);
      // Select a question with no answers authored by the project admin, in case that hinders this test.
      env.selectQuestion(6);
      expect(env.totalAnswersMessageCount).withContext('setup').toEqual(1);

      // A remote answer is added.
      env.simulateNewRemoteAnswer();
      expect(env.totalAnswersMessageCount).toEqual(2);
      // Banner is shown
      expect(env.showUnreadAnswersButton).not.toBeNull();
      flush();
    }));

    describe('Comments', () => {
      it('can comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(1);
        flush();
      }));

      it('can edit comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        // Answer a question in a chapter where chapters previous also have comments
        env.selectQuestion(14);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        env.waitForSliderUpdate();
        env.commentOnAnswer(0, 'Second comment to answer');
        env.waitForSliderUpdate();
        env.clickButton(env.getEditCommentButton(0, 0));
        expect(env.getYourCommentField(0)).not.toBeNull();
        env.setTextFieldValue(env.getYourCommentField(0), 'Edited comment');
        env.clickButton(env.getSaveCommentButton(0));
        env.waitForSliderUpdate();
        expect(env.getAnswerCommentText(0, 0)).toBe('Edited comment');
        expect(env.getAnswerCommentText(0, 1)).toBe('Second comment to answer');
        expect(env.getAnswerComments(0).length).toBe(2);
        flush();
      }));

      it('can delete comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(1);
        env.clickButton(env.getDeleteCommentButton(0, 0));
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(0);
        flush();
      }));

      it('can record audio for a comment', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        const resolveUpload$: Subject<void> = env.resolveFileUploadSubject('blob://audio');
        env.commentOnAnswer(0, '', 'audioFile.mp3');
        resolveUpload$.next();
        env.waitForSliderUpdate();
        expect(env.component.answersPanel!.answers[0].comments[0].audioUrl).toEqual('blob://audio');
        env.waitForSliderUpdate();
        expect(env.getAnswerCommentAudio(0, 0)).not.toBeNull();
        expect(env.getAnswerCommentText(0, 0)).toBe('');
      }));

      it('can remove audio from a comment', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        const resolveUpload$: Subject<void> = env.resolveFileUploadSubject('blob://audio');
        env.commentOnAnswer(0, 'comment with audio', 'audioFile.mp3');
        resolveUpload$.next();
        env.waitForSliderUpdate();
        expect(env.component.answersPanel!.answers[0].comments[0].audioUrl).toEqual('blob://audio');
        env.waitForSliderUpdate();
        expect(env.getAnswerCommentText(0, 0)).toContain('comment with audio');
        expect(env.getAnswerCommentAudio(0, 0)).not.toBeNull();
        env.clickButton(env.getEditCommentButton(0, 0));
        env.clickButton(env.getSaveCommentButton(0));
        env.waitForSliderUpdate();
        verify(
          mockedFileService.deleteFile(FileType.Audio, 'project01', QuestionDoc.COLLECTION, anything(), anything())
        ).once();
      }));

      it('will delete comment audio when comment is deleted', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        const resolveUpload$: Subject<void> = env.resolveFileUploadSubject('blob://audio');
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'comment with audio', 'audioFile.mp3');
        resolveUpload$.next();
        env.waitForSliderUpdate();
        expect(env.component.answersPanel!.answers[0].comments[0].audioUrl).toEqual('blob://audio');
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(1);
        expect(env.getAnswerCommentAudio(0, 0)).not.toBeNull();
        env.clickButton(env.getDeleteCommentButton(0, 0));
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(0);
        verify(
          mockedFileService.deleteFile(FileType.Audio, 'project01', QuestionDoc.COLLECTION, anything(), anything())
        ).once();
        flush();
      }));

      it('comments only appear on the relevant answer', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'First comment');
        env.commentOnAnswer(0, 'Second comment');
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(2);
        env.selectQuestion(2);
        env.answerQuestion('Second answer question to be commented on');
        env.commentOnAnswer(0, 'Third comment');
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(1);
        expect(env.getAnswerCommentText(0, 0)).toBe('Third comment');
        env.selectQuestion(1);
        expect(env.getAnswerCommentText(0, 0)).toBe('First comment');
      }));

      it('comments display show more button', fakeAsync(() => {
        const env = new TestEnvironment({ user: ADMIN_USER });
        // Show maximum of 3 comments before displaying 'show all' button
        env.selectQuestion(7);
        expect(env.getAnswerComments(0).length).toBe(3);
        expect(env.getShowAllCommentsButton(0)).toBeFalsy();
        expect(env.getAddCommentButton(0)).toBeTruthy();
        // If more than 3 comments then only show 2 initially along with `show all` button
        env.selectQuestion(8);
        expect(env.getAnswerComments(0).length).toBe(2);
        expect(env.getShowAllCommentsButton(0)).toBeTruthy();
        expect(env.getAddCommentButton(0)).toBeFalsy();
        env.clickButton(env.getShowAllCommentsButton(0));
        env.waitForSliderUpdate();
        // Once 'show all' button has been clicked then show all comments
        expect(env.getAnswerComments(0).length).toBe(4);
        expect(env.getShowAllCommentsButton(0)).toBeFalsy();
        expect(env.getAddCommentButton(0)).toBeTruthy();
        flush();
      }));

      it('comments unread only mark as read when the show more button is clicked', fakeAsync(() => {
        const env = new TestEnvironment({ user: ADMIN_USER });
        const question = env.selectQuestion(8, false);
        expect(env.getUnread(question)).toEqual(4);
        tick(env.questionReadTimer);
        env.fixture.detectChanges();
        expect(env.getUnread(question)).toEqual(2);
        env.clickButton(env.getShowAllCommentsButton(0));
        env.waitForSliderUpdate();
        expect(env.getUnread(question)).toEqual(0);
        flush();
      }));

      it('displays comments in real-time', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Admin will add a comment to this');
        expect(env.getAnswerComments(0).length).toEqual(0);
        const commentId: string = env.commentOnAnswerRemotely(
          'Comment left by admin',
          env.component.questionsList!.activeQuestionDoc!
        );
        tick(env.questionReadTimer);
        env.fixture.detectChanges();
        tick();
        expect(env.getAnswerComments(0).length).toEqual(1);
        expect(env.component.projectUserConfigDoc!.data!.commentRefsRead.includes(commentId)).toBe(true);
        flush();
      }));

      it('does not mark third comment read if fourth comment also added', fakeAsync(() => {
        const env = new TestEnvironment({ user: CHECKER_USER });
        env.selectQuestion(1);
        env.answerQuestion('Admin will add four comments');
        env.commentOnAnswer(0, 'First comment');
        const questionDoc: QuestionDoc = clone(env.component.questionsList!.activeQuestionDoc!);
        env.selectQuestion(2);
        env.commentOnAnswerRemotely('Comment #2', questionDoc);
        env.commentOnAnswerRemotely('Comment #3', questionDoc);
        env.commentOnAnswerRemotely('Comment #4', questionDoc);
        env.selectQuestion(1);
        expect(env.component.answersPanel!.answers.length).toEqual(1);
        expect(env.component.answersPanel!.answers[0].comments.length).toEqual(4);
        expect(env.getAnswerComments(0).length).toEqual(2);
        expect(env.getShowAllCommentsButton(0)).not.toBeNull();
        expect(env.component.projectUserConfigDoc!.data!.commentRefsRead.length).toEqual(1);
        env.clickButton(env.getShowAllCommentsButton(0));
        expect(env.component.projectUserConfigDoc!.data!.commentRefsRead.length).toEqual(3);
        expect(env.getAnswerComments(0).length).toEqual(4);
        flush();
      }));

      it('observer cannot comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment({ user: OBSERVER_USER });
        env.selectQuestion(6);
        expect(env.getAddCommentButton(0)).toBeNull();
        env.waitForAudioPlayer();
      }));

      it('project admins can only edit own comments', fakeAsync(() => {
        const env = new TestEnvironment({ user: ADMIN_USER });
        env.selectQuestion(7);
        expect(env.getEditCommentButton(0, 0)).not.toBeNull();
        env.selectQuestion(8);
        expect(env.getAnswerComments(0).length).toEqual(2);
        expect(env.getEditCommentButton(0, 0)).toBeNull();
      }));
    });

    it('update answer audio cache when activating a question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const questionDoc = spy(env.getQuestionDoc('q5Id'));
      verify(questionDoc!.updateAnswerFileCache()).never();
      env.selectQuestion(5);
      verify(questionDoc!.updateAnswerFileCache()).once();
      expect().nothing();
    }));

    it('update answer audio cache after save', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const questionDoc = spy(env.getQuestionDoc('q6Id'));
      env.selectQuestion(6);
      env.clickButton(env.getAnswerEditButton(0));
      env.waitForSliderUpdate();
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      verify(questionDoc!.updateAnswerFileCache()).times(2);
      expect().nothing();
      tick();
      flush();
    }));

    it('update answer audio cache on remote update to question', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      const questionDoc = spy(env.getQuestionDoc('q6Id'));
      env.selectQuestion(6);
      env.simulateRemoteEditAnswer(0, 'Question 6 edited answer');
      verify(questionDoc!.updateAnswerFileCache()).times(3);
      expect().nothing();
      tick();
      flush();
    }));

    it('update answer audio cache on remote removal of an answer', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const questionDoc = spy(env.getQuestionDoc('q6Id'));
      env.selectQuestion(6);
      env.simulateRemoteDeleteAnswer('q6Id', 0);
      verify(questionDoc!.updateAnswerFileCache()).times(3);
      expect().nothing();
      tick();
      flush();
    }));

    it('only admins can change answer export status', fakeAsync(() => {
      [OBSERVER_USER, CHECKER_USER, ADMIN_USER].forEach(USER => {
        const env = new TestEnvironment({ user: USER });

        env.selectQuestion(6);
        if (USER === ADMIN_USER) {
          expect(env.getExportAnswerButton(0)).withContext(`${USER.role} can see export button`).not.toBeNull();
          expect(env.getResolveAnswerButton(0)).withContext(`${USER.role} can see resolve button`).not.toBeNull();
        } else {
          expect(env.getExportAnswerButton(0)).withContext(`${USER.role} can not see export button`).toBeNull();
          expect(env.getResolveAnswerButton(0)).withContext(`${USER.role} can not see resolve button`).toBeNull();
        }
        env.waitForAudioPlayer();
      });
    }));

    it('can mark answer ready for export', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(6);
      const buttonIndex = 0;

      expect(env.getExportAnswerButton(buttonIndex).classes['status-exportable']).toBeUndefined();
      env.clickButton(env.getExportAnswerButton(buttonIndex));
      expect(env.getExportAnswerButton(buttonIndex).classes['status-exportable']).toBe(true);
      const questionDoc = env.component.questionsList!.activeQuestionDoc!;
      expect(questionDoc.data!.answers[0].status).toEqual(AnswerStatus.Exportable);
      flush();
      discardPeriodicTasks();
    }));

    it('can mark answer as resolved', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(6);
      const buttonIndex = 0;

      expect(env.getResolveAnswerButton(buttonIndex).classes['status-resolved']).toBeUndefined();
      env.clickButton(env.getResolveAnswerButton(buttonIndex));
      expect(env.getResolveAnswerButton(buttonIndex).classes['status-resolved']).toBe(true);
      const questionDoc = env.component.questionsList!.activeQuestionDoc!;
      expect(questionDoc.data!.answers[0].status).toEqual(AnswerStatus.Resolved);
      flush();
      discardPeriodicTasks();
    }));

    it('can change between different answer statuses', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.selectQuestion(6);
      const buttonIndex = 0;

      expect(env.getResolveAnswerButton(buttonIndex).classes['status-resolved']).toBeUndefined();
      expect(env.getResolveAnswerButton(buttonIndex).classes['status-exportable']).toBeUndefined();

      env.clickButton(env.getResolveAnswerButton(buttonIndex));
      expect(env.getResolveAnswerButton(buttonIndex).classes['status-resolved']).toBe(true);
      expect(env.getResolveAnswerButton(buttonIndex).classes['status-exportable']).toBeUndefined();
      let questionDoc = env.component.questionsList!.activeQuestionDoc!;
      expect(questionDoc.data!.answers[0].status).toEqual(AnswerStatus.Resolved);

      env.clickButton(env.getExportAnswerButton(buttonIndex));
      expect(env.getExportAnswerButton(buttonIndex).classes['status-resolved']).toBeUndefined();
      expect(env.getExportAnswerButton(buttonIndex).classes['status-exportable']).toBe(true);
      questionDoc = env.component.questionsList!.activeQuestionDoc!;
      expect(questionDoc.data!.answers[0].status).toEqual(AnswerStatus.Exportable);

      env.clickButton(env.getExportAnswerButton(buttonIndex));
      expect(env.getExportAnswerButton(buttonIndex).classes['status-resolved']).toBeUndefined();
      expect(env.getExportAnswerButton(buttonIndex).classes['status-exportable']).toBeUndefined();
      questionDoc = env.component.questionsList!.activeQuestionDoc!;
      expect(questionDoc.data!.answers[0].status).toEqual(AnswerStatus.None);
      flush();
      discardPeriodicTasks();
    }));
  });

  describe('Text', () => {
    it('can increase and decrease font size', fakeAsync(async () => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const editor = env.quillEditor;
      expect(editor.style.fontSize).toBe('1rem');
      await (await env.getIncreaseFontSizeButton()).click();
      expect(editor.style.fontSize).toBe('1.1rem');
      await (await env.getDecreaseFontSizeButton()).click();
      expect(editor.style.fontSize).toBe('1rem');
      await (await env.getFontSizeMenu()).close();
      discardPeriodicTasks();
    }));

    it('can select a question from the text', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.getVerse(1, 3).dispatchEvent(new Event('click'));
      env.waitForSliderUpdate();
      tick(env.questionReadTimer);
      env.fixture.detectChanges();
      expect(env.currentQuestion).toBe(4);
    }));

    it('quill editor element lang attribute is set from project language', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.waitForAudioPlayer();
      const quillElementLang = env.quillEditorElement.getAttribute('lang');
      expect(quillElementLang).toEqual(TestEnvironment.project01WritingSystemTag);
      flush();
      discardPeriodicTasks();
    }));

    it('adds question count attribute to element', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const segment = env.quillEditor.querySelector('usx-segment[data-segment=verse_1_1]')!;
      expect(segment.hasAttribute('data-question-count')).toBe(true);
      expect(segment.getAttribute('data-question-count')).toBe('13');
      flush();
      discardPeriodicTasks();
    }));

    it('updates question highlight when verse ref changes', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      env.selectQuestion(4);
      expect(env.getVerse(1, 3)).not.toBeNull();
      let segment = env.getVerse(1, 3);
      expect(segment.classList.contains('question-segment')).toBe(true);
      expect(segment.classList.contains('highlight-segment')).toBe(true);
      expect(fromVerseRef(env.component.activeQuestionVerseRef!).verseNum).toEqual(3);
      env.component.questionsList!.activeQuestionDoc!.submitJson0Op(op => {
        op.set(qd => qd.verseRef, fromVerseRef(new VerseRef('JHN 1:5')));
      }, false);
      env.waitForSliderUpdate();
      tick();
      env.fixture.detectChanges();
      segment = env.getVerse(1, 3);
      expect(segment.classList.contains('question-segment')).toBe(false);
      expect(segment.classList.contains('highlight-segment')).toBe(false);
      expect(fromVerseRef(env.component.activeQuestionVerseRef!).verseNum).toEqual(5);
      segment = env.getVerse(1, 5);
      expect(segment.classList.contains('question-segment')).toBe(true);
      expect(segment.classList.contains('highlight-segment')).toBe(true);
      tick();
      flush();
    }));

    it('is not hidden when project setting did not specify to hide it', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      expect(env.component.projectDoc!.data!.checkingConfig.hideCommunityCheckingText).withContext('setup').toBe(false);

      // SUT 1
      expect(env.component.hideChapterText)
        .withContext('component should specify in accordance with project setting')
        .toBe(false);

      // SUT 2
      expect(env.appCheckingTextElement.classes.hidden ?? false)
        .withContext('Scripture text should be shown since the project is set not to hide it')
        .toBe(false);

      flush();
      discardPeriodicTasks();
    }));

    it('is hidden when project setting specified', fakeAsync(() => {
      const testProject: SFProject = TestEnvironment.generateTestProject();
      testProject.checkingConfig.hideCommunityCheckingText = true;
      const env = new TestEnvironment({ user: CHECKER_USER, testProject });
      expect(env.component.projectDoc!.data!.checkingConfig.hideCommunityCheckingText).withContext('setup').toBe(true);

      // SUT 1
      expect(env.component.hideChapterText)
        .withContext('component should specify in accordance with project setting')
        .toBe(true);

      // SUT 2
      expect(env.appCheckingTextElement.classes.hidden ?? false)
        .withContext('Scripture text should be hidden when project setting')
        .toBe(true);

      flush();
      discardPeriodicTasks();
    }));

    it('dynamically hides when project setting changes to specify hide text', fakeAsync(() => {
      const env = new TestEnvironment({ user: CHECKER_USER });
      // Starts off not hiding text.
      expect(env.component.projectDoc!.data!.checkingConfig.hideCommunityCheckingText).withContext('setup').toBe(false);

      // After the page was originally set up, now set project setting to hide community checking text
      const changeOriginatesLocally: boolean = false;
      env.component.projectDoc?.submitJson0Op(op => {
        op.set(proj => proj.checkingConfig.hideCommunityCheckingText, true);
      }, changeOriginatesLocally);
      env.fixture.detectChanges();
      expect(env.component.projectDoc!.data!.checkingConfig.hideCommunityCheckingText).withContext('setup').toBe(true);
      env.waitForSliderUpdate();

      // SUT 1
      expect(env.component.hideChapterText)
        .withContext('component should specify in accordance with project setting')
        .toBe(true);

      // SUT 2
      expect(env.appCheckingTextElement.classes.hidden ?? false)
        .withContext('Scripture text should be hidden when project setting')
        .toBe(true);

      // And now set project setting NOT to hide community checking text
      env.component.projectDoc?.submitJson0Op(op => {
        op.set(proj => proj.checkingConfig.hideCommunityCheckingText, false);
      }, changeOriginatesLocally);
      env.fixture.detectChanges();
      expect(env.component.projectDoc!.data!.checkingConfig.hideCommunityCheckingText).withContext('setup').toBe(false);
      env.waitForSliderUpdate();

      // SUT 3
      expect(env.component.hideChapterText)
        .withContext('component should specify in accordance with project setting')
        .toBe(false);

      // SUT 4
      expect(env.appCheckingTextElement.classes.hidden ?? false)
        .withContext('Scripture text should not be hidden')
        .toBe(false);

      flush();
      discardPeriodicTasks();
    }));
  });

  describe('Chapter Audio', () => {
    it('can open chapter audio', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.fixture.detectChanges();

      expect(env.component.showScriptureAudioPlayer).toBe(false);

      env.component.toggleAudio();
      env.fixture.detectChanges();

      expect(env.component.showScriptureAudioPlayer).toBe(true);
      flush();
      expect(env.audioCheckingWarning).toBeNull();
      expect(env.questionNoAudioWarning).toBeNull();
      discardPeriodicTasks();
    }));

    it('can close chapter audio', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.component.toggleAudio();
      env.fixture.detectChanges();

      expect(env.component.showScriptureAudioPlayer).toBe(true);

      env.component.hideChapterAudio();
      env.fixture.detectChanges();

      expect(env.component.showScriptureAudioPlayer).toBe(false);
      flush();
      discardPeriodicTasks();
    }));

    it('stops audio when changing chapter', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const audio = env.mockScriptureAudioAndPlay();

      env.component.chapter = 2;

      verify(audio.stop()).once();
      expect(env.component).toBeDefined();
      flush();
      discardPeriodicTasks();
    }));

    it('audio stops when changing question on the same chapter', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const audio = env.mockScriptureAudioAndPlay();

      env.selectQuestion(4);

      verify(audio.stop()).once();
      expect(env.component).toBeDefined();
      flush();
    }));

    it('pauses chapter audio when adding a question', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const audio = env.mockScriptureAudioAndPlay();

      env.clickButton(env.addQuestionButton);
      env.waitForQuestionTimersToComplete();
      verify(audio.pause()).once();
      expect(env.component).toBeDefined();
    }));

    it('pauses audio when question is archived', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      const audio = env.mockScriptureAudioAndPlay();

      env.selectQuestion(1);
      const question = env.component.answersPanel!.questionDoc!.data!;
      expect(question.isArchived).toBe(false);

      env.archiveQuestionButton.nativeElement.click();
      env.waitForQuestionTimersToComplete();

      expect(question.isArchived).toBe(true);

      verify(audio.pause()).once();
      expect(env.component).toBeDefined();
    }));

    it('hides chapter audio if chapter audio is absent', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.component.toggleAudio();
      env.fixture.detectChanges();

      expect(env.component.showScriptureAudioPlayer).toBe(true);

      env.component.chapter = 99;
      env.fixture.detectChanges();
      flush();

      expect(env.component.showScriptureAudioPlayer).toBe(false);
      discardPeriodicTasks();
    }));

    it('keeps chapter audio if chapter audio is present', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER });
      env.component.toggleAudio();
      env.fixture.detectChanges();

      expect(env.component.showScriptureAudioPlayer).toBe(true);

      env.component.chapter = 2;
      env.fixture.detectChanges();
      flush();

      expect(env.component.showScriptureAudioPlayer).toBe(true);
      discardPeriodicTasks();
    }));

    it('notifies admin if chapter audio is absent and hide scripture text is enabled', fakeAsync(() => {
      const env = new TestEnvironment({
        user: ADMIN_USER,
        projectBookRoute: 'MAT',
        questionScope: 'book'
      });
      env.setHideScriptureText(true);
      expect(env.component.hideChapterText).toBe(true);
      env.waitForQuestionTimersToComplete();
      env.fixture.detectChanges();

      expect(env.audioCheckingWarning).not.toBeNull();
      expect(env.questionNoAudioWarning).not.toBeNull();

      when(mockedChapterAudioDialogService.openDialog(anything())).thenCall(() => {
        env.component.projectDoc!.submitJson0Op(op => {
          const matTextIndex: number = env.component.projectDoc!.data!.texts.findIndex(t => t.bookNum === 40);
          op.set(p => p.texts[matTextIndex].chapters[0].hasAudio, true);
        });
      });

      env.component.addAudioTimingData();
      env.waitForQuestionTimersToComplete();
      env.fixture.detectChanges();

      expect(env.audioCheckingWarning).toBeNull();
      expect(env.questionNoAudioWarning).toBeNull();
    }));

    it('notifies community checker if chapter audio is absent and hide scripture text is enabled', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER,
        projectBookRoute: 'MAT',
        questionScope: 'book'
      });
      env.setHideScriptureText(true);
      expect(env.component.hideChapterText).toBe(true);
      env.waitForQuestionTimersToComplete();
      env.fixture.detectChanges();

      // do not show the project level warning to users without permission to upload audio
      expect(env.audioCheckingWarning).toBeNull();
      expect(env.questionNoAudioWarning).not.toBeNull();
    }));

    it('can highlight segments of varying formats', fakeAsync(() => {
      const env = new TestEnvironment({
        user: CHECKER_USER
      });
      env.selectQuestion(1);

      env.component.toggleAudio();
      env.mockScriptureAudioAndPlay();
      env.fixture.detectChanges();
      expect(env.component.isAudioPlaying()).toBe(true);

      env.component.highlightSegments('verse_1_2-3');
      env.waitForSliderUpdate();
      env.fixture.detectChanges();
      expect(env.isSegmentHighlighted(1, 1)).toBe(false);
      expect(env.isSegmentHighlighted(1, 2)).toBe(true);
      expect(env.isSegmentHighlighted(1, 3)).toBe(true);

      env.component.highlightSegments('verse_1_4a');
      env.waitForSliderUpdate();
      env.fixture.detectChanges();
      expect(env.isSegmentHighlighted(1, 1)).toBe(false);
      expect(env.isSegmentHighlighted(1, 2)).toBe(false);
      expect(env.isSegmentHighlighted(1, 3)).toBe(false);
      expect(env.isSegmentHighlighted(1, '4/p_1')).toBe(false);

      env.component.highlightSegments('verse_1_5,6');
      env.waitForSliderUpdate();
      env.fixture.detectChanges();
      expect(env.isSegmentHighlighted(1, 1)).toBe(false);
      expect(env.isSegmentHighlighted(1, 2)).toBe(false);
      expect(env.isSegmentHighlighted(1, 3)).toBe(false);
      expect(env.isSegmentHighlighted(1, '4/p_1')).toBe(false);
      expect(env.isSegmentHighlighted(1, 5)).toBe(true);
      expect(env.isSegmentHighlighted(1, 6)).toBe(true);
    }));

    // TODO: Get this test working
    xit('pauses audio on reload (changing book)', fakeAsync(() => {
      const env = new TestEnvironment({ user: ADMIN_USER, questionScope: 'book' });
      env.component.toggleAudio();
      env.fixture.detectChanges();

      const chapterAudio = mock(CheckingScriptureAudioPlayerComponent);
      env.component.scriptureAudioPlayer = instance(chapterAudio);

      env.setBookChapter('MAT', 1);
      env.waitForQuestionTimersToComplete();

      verify(chapterAudio.pause()).once();
      expect(env.component.showScriptureAudioPlayer).toBe(true);
    }));
  });
});

interface UserInfo {
  id: string;
  user: User;
  role: string;
}

class TestEnvironment {
  static project01WritingSystemTag = 'en';

  readonly component: CheckingComponent;
  readonly fixture: ComponentFixture<CheckingComponent>;
  readonly loader: HarnessLoader;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly realtimeService: TestRealtimeService = TestBed.inject(TestRealtimeService);
  readonly mockedTextChooserDialogComponent = mock<MatDialogRef<TextChooserDialogComponent>>(MatDialogRef);
  readonly location: Location;
  readonly router: Router;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  questionReadTimer: number = 2000;
  fileSyncComplete: Subject<void> = new Subject();

  private readonly params$: BehaviorSubject<Params>;
  private readonly queryParams$: BehaviorSubject<Params>;
  private readonly adminProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: ADMIN_USER.id,
    isTargetTextRight: true
  });

  private readonly checkerProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: CHECKER_USER.id,
    isTargetTextRight: true,
    selectedQuestionRef: 'project01:q5Id',
    answerRefsRead: ['a0Id', 'a1Id']
  });

  private readonly cleanCheckerProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: CLEAN_CHECKER_USER.id,
    isTargetTextRight: true
  });

  private readonly observerProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: OBSERVER_USER.id,
    isTargetTextRight: true,
    selectedQuestionRef: 'project01:q5Id'
  });

  private readonly translatorProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: TRANSLATOR_USER.id
  });

  private readonly consultantProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: CONSULTANT_USER.id
  });

  private readonly testProject: SFProject = TestEnvironment.generateTestProject();

  constructor({
    user,
    projectBookRoute = 'JHN',
    projectChapterRoute = 1,
    questionScope = 'book',
    hasConnection = true,
    testProject = undefined
  }: {
    user: UserInfo;
    projectBookRoute?: string;
    projectChapterRoute?: number;
    questionScope?: QuestionScope;
    hasConnection?: boolean;
    testProject?: SFProject;
  }) {
    this.params$ = new BehaviorSubject<Params>({
      projectId: 'project01',
      bookId: projectBookRoute,
      chapter: projectChapterRoute
    });
    this.queryParams$ = new BehaviorSubject<Params>({
      scope: questionScope
    });

    reset(mockedFileService);

    if (testProject != null) {
      this.testProject = testProject;
    }

    when(mockedUserService.editDisplayName(true)).thenResolve();
    this.testOnlineStatusService.setIsOnline(hasConnection);
    when(
      mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, anything(), anyString())
    ).thenResolve(createStorageFileData(QuestionDoc.COLLECTION, 'anyId', 'filename.mp3', getAudioBlob()));
    when(
      mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, anything(), undefined)
    ).thenResolve(undefined);
    when(mockedFileService.fileSyncComplete$).thenReturn(this.fileSyncComplete);

    const query = mock(RealtimeQuery<TextAudioDoc>) as RealtimeQuery<TextAudioDoc>;
    when(query.remoteChanges$).thenReturn(new BehaviorSubject<void>(undefined));
    when(query.localChanges$).thenReturn(new BehaviorSubject<void>(undefined));
    const doc = mock(TextAudioDoc);
    const textAudio = mock<TextAudio>();
    when(textAudio.audioUrl).thenReturn('test-audio-short.webm');
    when(textAudio.timings).thenReturn([]);
    when(doc.id).thenReturn('project01:43:1:target');
    when(doc.data).thenReturn(instance(textAudio));
    when(query.docs).thenReturn([instance(doc)]);
    when(mockedProjectService.queryAudioText('project01')).thenResolve(instance(query));
    when(mockedMediaBreakpointService.width(anything(), anything())).thenReturn('(width < 576px)');
    when(mockedMediaBreakpointService.width(anything(), anything(), anything())).thenReturn('(width > 576px)');

    this.fixture = TestBed.createComponent(CheckingComponent);
    this.component = this.fixture.componentInstance;
    this.location = TestBed.inject(Location);
    this.router = TestBed.inject(Router);
    this.loader = TestbedHarnessEnvironment.loader(this.fixture);

    this.setRouteSnapshot(projectBookRoute, projectChapterRoute.toString(), questionScope);
    this.setupDefaultProjectData(user);

    // 'ready$' from SharedbRealtimeQueryAdapter (not the MemoryRealtimeQueryAdapter used in tests)
    // does not emit when offline, so simulate this behavior by causing the RealtimeQuery.ready$
    // to emit 'false' once (due to it being a BehaviorSubject) and then complete
    if (!hasConnection) {
      const checkingQuestionsService = TestBed.inject(CheckingQuestionsService);

      // Store original function to call inside callFake
      const realQueryQuestions = checkingQuestionsService.queryQuestions;

      spyOn(checkingQuestionsService, 'queryQuestions').and.callFake((...args: any[]) =>
        // Call real function
        realQueryQuestions.apply(checkingQuestionsService, args as [projectId: string, options?: any]).then(
          // Then alter `query.ready$` to emit false and complete
          (query: RealtimeQuery<QuestionDoc>) => {
            Object.assign(query.ready$, of(false));
            return query;
          }
        )
      );
    }

    // Need to wait for questions, text promises, and slider position calculations to finish
    this.fixture.detectChanges();
    tick(1);
    this.fixture.detectChanges();
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
    this.waitForSliderUpdate();
  }

  get answerPanel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-panel'));
  }

  /** Answers rendered in the DOM. */
  get answers(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#answer-panel .answers-container .answer'));
  }

  get addAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#add-answer'));
  }

  get addQuestionButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.add-question-button'));
  }

  get addAudioButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.add-audio-button'));
  }

  get archiveQuestionButton(): DebugElement {
    return this.answerPanel.query(By.css('.archive-question-button'));
  }

  get audioPlayerOnQuestion(): DebugElement {
    return this.answerPanel.query(By.css('#questionAudio'));
  }

  get chapterAudio(): DebugElement {
    return this.fixture.debugElement.query(By.css('.scripture-audio-player-wrapper'))?.children[0];
  }

  get cancelAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#cancel-response'));
  }

  async getCurrentBookAndChapter(): Promise<string> {
    // Get value from MatSelect whose css class is 'book-select-menu'
    const matSelectHarnessBook = await this.loader.getHarness<MatSelectHarness>(
      MatSelectHarness.with({ selector: '[panelClass=book-select-menu]' })
    );
    const matSelectHarnessChapter = await this.loader.getHarness<MatSelectHarness>(
      MatSelectHarness.with({ selector: '[panelClass=chapter-select-menu]' })
    );
    const bookName = await matSelectHarnessBook.getValueText();
    const chapter = await matSelectHarnessChapter.getValueText();

    return `${bookName} ${chapter}`;
  }

  get commentFormTextFields(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('[formControlName="commentText"]'));
  }

  get currentQuestion(): number {
    const questions = this.questions;
    for (const questionNumber in questions) {
      if (
        questions[questionNumber].classes.hasOwnProperty('selected') &&
        questions[questionNumber].classes['selected']
      ) {
        // Need to add one as css selector nth-child starts index from 1 instead of zero
        return Number(questionNumber) + 1;
      }
    }
    return -1;
  }

  async getFontSizeMenu(): Promise<MatMenuHarness> {
    return this.loader.getHarness(MatMenuHarness.with({ selector: '.font-size-menu-trigger' }));
  }

  async getDecreaseFontSizeButton(): Promise<MatButtonHarness> {
    const menu = await this.getFontSizeMenu();
    await menu.open();
    return menu.getHarness(MatButtonHarness.with({ selector: '.button-group button:nth-of-type(1)' }));
  }

  async getIncreaseFontSizeButton(): Promise<MatButtonHarness> {
    const menu = await this.getFontSizeMenu();
    await menu.open();
    return menu.getHarness(MatButtonHarness.with({ selector: '.button-group button:nth-of-type(2)' }));
  }

  get editQuestionButton(): DebugElement {
    return this.answerPanel.query(By.css('.edit-question-button'));
  }

  get likeButtons(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.like-answer'));
  }

  get nextButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#question-nav .next-question'));
  }

  get noQuestionsFound(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-checking-questions .no-questions-found'));
  }

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  get previousButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#question-nav .prev-question'));
  }

  get questionFilterTotal(): string {
    return this.fixture.debugElement.query(By.css('#questions-panel header h2 span')).nativeElement.textContent.trim();
  }

  get questions(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('app-checking-questions .mdc-list-item'));
  }

  get quillEditor(): HTMLElement {
    return document.getElementsByClassName('ql-container')[0] as HTMLElement;
  }

  get quillEditorElement(): HTMLElement {
    return document.getElementsByTagName('quill-editor')[0] as HTMLElement;
  }

  get paragraphs(): HTMLElement[] {
    return this.fixture.debugElement.nativeElement.querySelectorAll('usx-para');
  }

  get recordQuestionButton(): DebugElement {
    return this.answerPanel.query(By.css('.record-question-button'));
  }

  get saveAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#save-response'));
  }

  get yourAnswerContainer(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-form .mat-mdc-form-field'));
  }

  get yourAnswerField(): DebugElement {
    return this.fixture.debugElement.query(By.css('textarea[formControlName="text"]'));
  }

  get answerFormErrors(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#answer-form .form-helper-text'));
  }

  get scriptureText(): string | null {
    const scriptureText = document.querySelector('.answer-scripture-verse');
    return scriptureText == null ? null : scriptureText.textContent!.trim();
  }

  get clearScriptureButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.answer-scripture-clear'));
  }

  get selectVersesButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#select-scripture'));
  }

  get showUnreadAnswersButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#show-unread-answers-button'));
  }

  get totalAnswersMessageText(): string | null {
    const element = document.querySelector('#totalAnswersMessage');
    if (element == null) {
      return null;
    }
    return element.textContent;
  }

  get totalAnswersMessageCount(): number | null {
    return this.getFirstNumberFromElementText('#totalAnswersMessage');
  }

  get unreadAnswersBannerCount(): number | null {
    return this.getFirstNumberFromElementText('#show-unread-answers-button');
  }

  get appCheckingTextElement(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-checking-text'));
  }

  get audioCheckingWarning(): DebugElement {
    return this.fixture.debugElement.query(By.css('.audio-checking-warning'));
  }

  get questionNoAudioWarning(): DebugElement {
    return this.fixture.debugElement.query(By.css('.no-audio-message'));
  }

  static generateTestProject(): SFProject {
    let audioPermissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Create)];
    let questionPermissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create)];
    let userPermissions = {
      [TRANSLATOR_USER.id]: audioPermissions,
      [CONSULTANT_USER.id]: questionPermissions
    };
    return createTestProject({
      name: 'project01',
      paratextId: 'project01',
      shortName: 'project01',
      writingSystem: {
        tag: TestEnvironment.project01WritingSystemTag
      },
      translateConfig: {
        translationSuggestionsEnabled: true,
        source: {
          paratextId: 'project02',
          projectRef: 'project02',
          name: 'Source',
          shortName: 'SRC',
          writingSystem: { tag: 'qaa' }
        }
      },
      texts: [
        {
          bookNum: 43,
          hasSource: false,
          chapters: [
            { number: 1, lastVerse: 18, isValid: true, permissions: {}, hasAudio: true },
            { number: 2, lastVerse: 25, isValid: true, permissions: {}, hasAudio: true }
          ],
          permissions: {}
        },
        {
          bookNum: 40,
          hasSource: false,
          chapters: [{ number: 1, lastVerse: 28, isValid: true, permissions: {} }],
          permissions: {}
        }
      ],
      userPermissions,
      userRoles: {
        [ADMIN_USER.id]: ADMIN_USER.role,
        [CHECKER_USER.id]: CHECKER_USER.role,
        [CLEAN_CHECKER_USER.id]: CLEAN_CHECKER_USER.role,
        [OBSERVER_USER.id]: OBSERVER_USER.role,
        [TRANSLATOR_USER.id]: TRANSLATOR_USER.role,
        [CONSULTANT_USER.id]: CONSULTANT_USER.role
      },
      paratextUsers: [
        { sfUserId: ADMIN_USER.id, username: ADMIN_USER.user.name, opaqueUserId: `opaque${ADMIN_USER.id}` },
        { sfUserId: OBSERVER_USER.id, username: OBSERVER_USER.user.name, opaqueUserId: `opaque${OBSERVER_USER.id}` },
        {
          sfUserId: TRANSLATOR_USER.id,
          username: TRANSLATOR_USER.user.name,
          opaqueUserId: `opaque${TRANSLATOR_USER.id}`
        },
        {
          sfUserId: CONSULTANT_USER.id,
          username: CONSULTANT_USER.user.name,
          opaqueUserId: `opaque${CONSULTANT_USER.id}`
        }
      ]
    });
  }

  activateQuestion(dataId: string): void {
    const questionDoc = this.getQuestionDoc(dataId);
    this.ngZone.run(() => this.component.questionsList!.activateQuestion(questionDoc));
    tick();
    this.waitForQuestionTimersToComplete();
    const bookId: string = Canon.bookNumberToId(questionDoc.data!.verseRef.bookNum);
    const chapter: string = questionDoc.data!.verseRef.chapterNum.toString();
    this.setRouteSnapshot(bookId, chapter, this.queryParams$.value.scope);
    this.params$.next({ projectId: 'project01', bookId, chapter });
    this.waitForQuestionTimersToComplete();
  }

  getExportAnswerButton(index: number): DebugElement {
    return this.getAnswer(index).query(By.css('.answer-status.answer-export'));
  }

  getResolveAnswerButton(index: number): DebugElement {
    return this.getAnswer(index).query(By.css('.answer-status.answer-resolve'));
  }

  /** Fetch first sequence of numbers (without spaces between) from an element's text. */
  getFirstNumberFromElementText(selector: string): number | null {
    const element = document.querySelector(selector);
    if (element == null || element.textContent == null) {
      return null;
    }
    const numberMatches = element.textContent.match(/\d+/);
    if (numberMatches == null || numberMatches.length === 0) {
      return null;
    }
    return parseInt(numberMatches[0], 10);
  }

  getLikeTotal(index: number): number {
    return parseInt(
      this.fixture.debugElement.queryAll(By.css('.answers-container .answer .like-count'))[index].nativeElement
        .textContent,
      10
    );
  }

  answerQuestion(answer: string, audioFilename?: string): void {
    this.clickButton(this.addAnswerButton);
    const response: CheckingInput = { text: answer };
    const audio: AudioAttachment = { status: 'processed', blob: getAudioBlob(), fileName: audioFilename };
    if (audioFilename != null) {
      response.audio = audio;
    }
    this.component.answersPanel?.submit(response);
    tick();
    this.fixture.detectChanges();
    this.waitForSliderUpdate();
  }

  setBookChapter(bookId: string, chapter: number): void {
    this.setRouteSnapshot(bookId, chapter.toString(), this.queryParams$.value.scope);
    this.params$.next({ projectId: 'project01', bookId, chapter: chapter.toString() });
    tick();
  }

  setQuestionScope(scope: QuestionScope): void {
    const { bookId, chapter } = this.params$.value;
    this.setRouteSnapshot(bookId, chapter, scope);
    this.queryParams$.next({ scope });
    tick();
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    tick();
    this.fixture.detectChanges();
    tick();
  }

  commentOnAnswer(answerIndex: number, comment: string, audioFilename?: string): void {
    this.clickButton(this.getAddCommentButton(answerIndex));
    if (this.getYourCommentField(answerIndex) == null) return;
    this.setTextFieldValue(this.getYourCommentField(answerIndex), comment);
    let commentAudio: AudioAttachment | undefined;
    if (audioFilename != null) {
      commentAudio = { status: 'processed', blob: getAudioBlob(), fileName: audioFilename };
    }
    const commentsComponent = this.fixture.debugElement.query(By.css('#answer-comments'))!
      .componentInstance as CheckingCommentsComponent;
    commentsComponent.submit({ text: comment, audio: commentAudio });
    this.waitForSliderUpdate();
  }

  commentOnAnswerRemotely(text: string, questionDoc: QuestionDoc): string {
    const commentId: string = objectId();
    const date = new Date().toJSON();
    const comment: Comment = {
      dataId: commentId,
      ownerRef: ADMIN_USER.id,
      text: text,
      dateCreated: date,
      dateModified: date,
      deleted: false
    };
    questionDoc.submitJson0Op(op => op.insert(q => q.answers[0].comments, 0, comment), false);
    return commentId;
  }

  /** Fetch answer from DOM. */
  getAnswer(/** Zero-based */ index: number): DebugElement {
    return this.answers[index];
  }

  answerDeleteButton(index: number): DebugElement {
    return this.getAnswer(index).query(By.css('.answer-delete'));
  }

  getAnswerEditButton(index: number): DebugElement {
    return this.getAnswer(index).query(By.css('.answer-edit'));
  }

  getAnswerText(index: number): string {
    return this.getAnswer(index).query(By.css('.answer-text')).nativeElement.textContent;
  }

  getAnswerScripture(index: number): DebugElement {
    return this.getAnswer(index).query(By.css('.answer-scripture'));
  }

  getAnswerScriptureText(index: number): string {
    return this.getAnswerScripture(index).nativeElement.textContent;
  }

  getAddCommentButton(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('.add-comment'));
  }

  getAnswerComments(answerIndex: number): DebugElement[] {
    return this.getAnswer(answerIndex).queryAll(By.css('.comment'));
  }

  getAnswerComment(answerIndex: number, commentIndex: number): DebugElement {
    return this.getAnswerComments(answerIndex)[commentIndex];
  }

  getAnswerCommentText(answerIndex: number, commentIndex: number): string {
    const commentText = this.getAnswerComment(answerIndex, commentIndex);
    return commentText.query(By.css('.comment-text')).nativeElement.textContent;
  }

  getAnswerCommentAudio(answerIndex: number, commentIndex: number): DebugElement {
    const comment = this.getAnswerComment(answerIndex, commentIndex);
    return comment.query(By.css('.comment-audio')).nativeElement;
  }

  getDeleteCommentButton(answerIndex: number, commentIndex: number): DebugElement {
    return this.getAnswerComments(answerIndex)[commentIndex].query(By.css('.comment-delete'));
  }

  getEditCommentButton(answerIndex: number, commentIndex: number): DebugElement {
    return this.getAnswerComments(answerIndex)[commentIndex].query(By.css('.comment-edit'));
  }

  getQuestionDoc(dataId: string): QuestionDoc {
    return this.realtimeService.get(QuestionDoc.COLLECTION, getQuestionDocId('project01', dataId));
  }

  getQuestionText(question: DebugElement): string {
    return question.query(By.css('.question-text')).nativeElement.textContent;
  }

  getSaveCommentButton(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('#save-response'));
  }

  getUnread(question: DebugElement): number {
    const questionAnswers = question.query(By.css('.view-answers span'));
    return questionAnswers != null ? parseInt(questionAnswers.nativeElement.textContent, 10) : 0;
  }

  getYourCommentField(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('textarea[formControlName="text"]'));
  }

  selectQuestion(/** indexed starting at 1 */ questionNumber: number, includeReadTimer: boolean = true): DebugElement {
    const question = this.fixture.debugElement.query(
      By.css('app-checking-questions .mdc-list-item:nth-child(' + questionNumber + ')')
    );
    question.nativeElement.click();
    tick(1);
    this.fixture.detectChanges();
    if (includeReadTimer) {
      tick(this.questionReadTimer);
      this.fixture.detectChanges();
    }
    return question;
  }

  setSeeOtherUserResponses(isEnabled: boolean): void {
    this.component.projectDoc!.submitJson0Op(
      op => op.set<boolean>(p => p.checkingConfig.usersSeeEachOthersResponses, isEnabled),
      false
    );
    tick();
    this.fixture.detectChanges();
  }

  setTextFieldValue(textField: DebugElement, value: string): void {
    const inputElem = textField.nativeElement as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    inputElem.dispatchEvent(new Event('change'));
    this.waitForSliderUpdate();
  }

  getShowAllCommentsButton(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('.show-all-comments'));
  }

  getVerse(chapter: number, verse: number | string): Element {
    return this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
  }

  isSegmentHighlighted(chapter: number, verse: number | string): boolean {
    const segment = this.getVerse(chapter, verse);
    return segment != null && segment.classList.contains('highlight-segment');
  }

  segmentHasQuestion(chapter: number, verse: number): boolean {
    const segment = this.getVerse(chapter, verse.toString());
    return segment != null && segment.classList.contains('question-segment');
  }

  setCheckingEnabled(isEnabled: boolean = true): void {
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(isEnabled);
    this.ngZone.run(() => {
      this.component.projectDoc!.submitJson0Op(
        op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, isEnabled),
        false
      );
    });
    this.waitForSliderUpdate();
  }

  waitForAudioPlayer(): void {
    this.waitForTimersToComplete();
  }

  waitForSliderUpdate(): void {
    // Question query changes are throttled by 100 ms, so we have to wait for them.
    // After 100 ms of waiting, the query changes will be emitted, and then the async scheduler will set a 100 ms
    // timeout before emitting changes again. That 100 ms timeout will get left in the queue, but if we wait past that
    // time, we don't have to do discardPeriodicTasks() to flush the queue.
    this.waitForTimersToComplete(200);
  }

  waitForQuestionTimersToComplete(): void {
    this.waitForTimersToComplete(this.questionReadTimer);
  }

  insertQuestion(newQuestion: Question): void {
    const docId = getQuestionDocId('project01', newQuestion.dataId);
    this.realtimeService.addSnapshot(QuestionDoc.COLLECTION, {
      id: docId,
      data: newQuestion
    });
    this.realtimeService.updateAllSubscribeQueries();
  }

  resolveFileUploadSubject(fileUrl: string): Subject<void> {
    const resolveUpload$ = new Subject<void>();
    when(
      mockedFileService.uploadFile(
        FileType.Audio,
        'project01',
        QuestionDoc.COLLECTION,
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).thenReturn(
      new Promise<string>(resolve => {
        resolveUpload$.pipe(first()).subscribe(() => resolve(fileUrl));
      })
    );
    return resolveUpload$;
  }

  /** Delete user's answer via the checking-answers.component. */
  deleteAnswerOwnedBy(userId: string = CHECKER_USER.id): void {
    const usersAnswer = this.component.answersPanel!.questionDoc!.data!.answers.filter(
      answer => answer.ownerRef === userId
    )[0];
    this.component.answersPanel!.deleteAnswerClicked(usersAnswer);
    tick();
    this.fixture.detectChanges();
    tick();
  }

  /** Delete answer by id behind the scenes */
  deleteAnswer(answerIdToDelete: string): void {
    const questionDoc = this.component.answersPanel!.questionDoc!;
    const answers = questionDoc.data!.answers;
    const answerIndex = answers.findIndex(existingAnswer => existingAnswer.dataId === answerIdToDelete);

    questionDoc.submitJson0Op(op => op.set(q => q.answers[answerIndex].deleted, true));

    this.fixture.detectChanges();
  }

  setQuestionFilter(filter: QuestionFilter): void {
    this.component.setQuestionFilter(filter);
    this.waitForQuestionTimersToComplete();
  }

  mockScriptureAudioAndPlay(): CheckingScriptureAudioPlayerComponent {
    this.component.toggleAudio();
    this.fixture.detectChanges();

    const audio = mock(CheckingScriptureAudioPlayerComponent);
    when(audio.isPlaying).thenReturn(true);
    this.component.scriptureAudioPlayer = instance(audio);
    return audio;
  }

  simulateNewRemoteAnswer(dataId: string = 'newAnswer1', text: string = 'new answer from another user'): void {
    // Another user on another computer adds a new answer.
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const dateCreated = date.toJSON();
    this.component.answersPanel!.questionDoc!.submitJson0Op(
      op =>
        op.insert(q => q.answers, 0, {
          dataId: dataId,
          // Another user
          ownerRef: CLEAN_CHECKER_USER.id,
          text: text,
          verseRef: { chapterNum: 1, verseNum: 1, bookNum: 43 },
          scriptureText: 'Quoted scripture',
          likes: [],
          dateCreated: dateCreated,
          dateModified: dateCreated,
          deleted: false,
          audioUrl: '/audio.mp3',
          comments: []
        }),
      // Another user
      false
    );
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
    tick();
  }

  simulateRemoteEditQuestionAudio(filename?: string, questionId?: string): void {
    const questionDoc =
      questionId != null ? this.getQuestionDoc(questionId) : this.component.questionsList!.activeQuestionDoc!;
    questionDoc.submitJson0Op(op => {
      if (filename != null) {
        op.set(q => q.audioUrl!, filename);
      } else {
        op.unset(q => q.audioUrl!);
      }
    }, false);
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
  }

  simulateRemoteDeleteAnswer(questionId: string, answerIndex: number): void {
    const questionDoc = this.getQuestionDoc(questionId);
    questionDoc.submitJson0Op(op => op.set(q => q.answers[answerIndex].deleted, true), false);
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
    tick();
  }

  simulateRemoteEditAnswer(index: number, text: string): void {
    const questionDoc = this.component.questionsList!.activeQuestionDoc!;
    questionDoc.submitJson0Op(op => {
      op.set(q => q.answers[index].text!, text);
      op.set(q => q.answers[index].dateModified, new Date().toJSON());
    }, false);
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
    tick();
  }

  simulateSync(index: number): void {
    const questionDoc = this.component.questionsList!.activeQuestionDoc!;
    questionDoc.submitJson0Op(op => {
      op.set(q => (q.answers[index] as any).syncUserRef, objectId());
    }, false);
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
    tick();
  }

  setHideScriptureText(hideScriptureText: boolean): void {
    const projectDoc: SFProjectProfileDoc = this.component.projectDoc!;
    projectDoc.submitJson0Op(op => op.set(p => p.checkingConfig.hideCommunityCheckingText, hideScriptureText));
    tick();
    this.fixture.detectChanges();
  }

  private setRouteSnapshot(bookId: string, chapter: string, scope: QuestionScope): void {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.params = { bookId, chapter };
    snapshot.queryParams = { scope };
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);
  }

  private setupDefaultProjectData(user: UserInfo): void {
    const projectId = 'project01';
    this.realtimeService.addSnapshots<SFProject>(SFProjectDoc.COLLECTION, [
      {
        id: projectId,
        data: this.testProject
      }
    ]);

    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id)
    );
    when(mockedProjectService.isProjectAdmin(anything(), anything())).thenResolve(
      user.role === SFProjectRole.ParatextAdministrator
    );

    this.realtimeService.addSnapshots<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, [
      {
        id: getSFProjectUserConfigDocId(projectId, ADMIN_USER.id),
        data: this.adminProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId(projectId, CHECKER_USER.id),
        data: this.checkerProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId(projectId, CLEAN_CHECKER_USER.id),
        data: this.cleanCheckerProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId(projectId, OBSERVER_USER.id),
        data: this.observerProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId(projectId, TRANSLATOR_USER.id),
        data: this.translatorProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId(projectId, CONSULTANT_USER.id),
        data: this.consultantProjectUserConfig
      }
    ]);
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((id, userId) =>
      this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId))
    );

    this.realtimeService.addSnapshots<TextData>(TextDoc.COLLECTION, [
      {
        id: getTextDocId(projectId, 43, 1),
        data: this.createTextDataForChapter(1),
        type: RichText.type.name
      },
      {
        id: getTextDocId(projectId, 43, 2),
        data: this.createTextDataForChapter(2),
        type: RichText.type.name
      },
      {
        id: getTextDocId(projectId, 40, 1),
        data: this.createTextDataForChapter(1),
        type: RichText.type.name
      }
    ]);
    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedActivatedRoute.params).thenReturn(this.params$);
    when(mockedActivatedRoute.queryParams).thenReturn(this.queryParams$);
    when(mockedUserService.currentUserId).thenReturn(user.id);

    this.realtimeService.addSnapshots<User>(UserDoc.COLLECTION, [
      {
        id: user.id,
        data: user.user
      }
    ]);
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, user.id)
    );

    this.realtimeService.addSnapshots<User>(UserProfileDoc.COLLECTION, [
      {
        id: ADMIN_USER.id,
        data: ADMIN_USER.user
      },
      {
        id: CHECKER_USER.id,
        data: CHECKER_USER.user
      },
      {
        id: TRANSLATOR_USER.id,
        data: TRANSLATOR_USER.user
      },
      {
        id: CONSULTANT_USER.id,
        data: CONSULTANT_USER.user
      }
    ]);
    when(mockedUserService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(UserProfileDoc.COLLECTION, id)
    );

    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
    when(mockedDialogService.openMatDialog(TextChooserDialogComponent, anything())).thenReturn(
      instance(this.mockedTextChooserDialogComponent)
    );
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    this.setupQuestionData();
  }

  private setupQuestionData(): void {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    let jsonDate = date.toJSON();
    const incrementDate = (): void => {
      date.setMinutes(date.getMinutes() + 1);
      jsonDate = date.toJSON();
    };

    let questions: Partial<Snapshot<Question>>[] = [];
    const johnQuestions: Partial<Snapshot<Question>>[] = [];
    const matthewQuestions: Partial<Snapshot<Question>>[] = [];

    for (let questionNumber = 1; questionNumber <= 14; questionNumber++) {
      incrementDate();
      johnQuestions.push({
        id: getQuestionDocId('project01', `q${questionNumber}Id`),
        data: {
          dataId: 'q' + questionNumber + 'Id',
          ownerRef: ADMIN_USER.id,
          projectRef: 'project01',
          text: 'John 1, Q' + questionNumber + ' text',
          verseRef: { bookNum: 43, chapterNum: 1, verseNum: 1, verse: '1-2' },
          answers: [],
          isArchived: false,
          dateCreated: jsonDate,
          dateModified: jsonDate
        }
      });
    }

    incrementDate();
    johnQuestions.push({
      id: getQuestionDocId('project01', 'q15Id'),
      data: {
        dataId: 'q15Id',
        ownerRef: ADMIN_USER.id,
        projectRef: 'project01',
        text: 'John 2',
        verseRef: { bookNum: 43, chapterNum: 2, verseNum: 1, verse: '1-2' },
        answers: [],
        audioUrl: 'audioFile.mp3',
        isArchived: false,
        dateCreated: jsonDate,
        dateModified: jsonDate
      }
    });

    incrementDate();
    matthewQuestions.push({
      id: getQuestionDocId('project01', 'q16Id'),
      data: {
        dataId: 'q16Id',
        ownerRef: ADMIN_USER.id,
        projectRef: 'project01',
        text: 'Matthew question relating to chapter 1',
        verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
        answers: [],
        isArchived: false,
        dateCreated: jsonDate,
        dateModified: jsonDate
      }
    });

    incrementDate();
    johnQuestions[3].data!.verseRef.verse = '3-4';
    johnQuestions[5].data!.answers.push({
      dataId: 'a6Id',
      ownerRef: CHECKER_USER.id,
      text: 'Answer 6 on question',
      verseRef: { bookNum: 43, chapterNum: 1, verseNum: 1 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: jsonDate,
      dateModified: jsonDate,
      deleted: false,
      audioUrl: '/audio.mp3',
      comments: []
    });

    const a7Comments: Comment[] = [];
    for (let commentNumber = 1; commentNumber <= 3; commentNumber++) {
      incrementDate();
      a7Comments.push({
        dataId: 'c' + commentNumber + 'Id',
        ownerRef: ADMIN_USER.id,
        text: 'Comment ' + commentNumber + ' on question 7',
        dateCreated: jsonDate,
        dateModified: jsonDate,
        deleted: false
      });
    }

    incrementDate();
    johnQuestions[6].data!.answers.push({
      dataId: 'a7Id',
      ownerRef: ADMIN_USER.id,
      text: 'Answer 7 on question',
      likes: [],
      dateCreated: jsonDate,
      dateModified: jsonDate,
      deleted: false,
      comments: a7Comments
    });

    const a8Comments: Comment[] = [];
    for (let commentNumber = 1; commentNumber <= 4; commentNumber++) {
      incrementDate();
      a8Comments.push({
        dataId: 'c' + commentNumber + 'Id',
        ownerRef: CHECKER_USER.id,
        text: 'Comment ' + commentNumber + ' on question 8',
        dateCreated: jsonDate,
        dateModified: jsonDate,
        deleted: false
      });
    }

    incrementDate();
    johnQuestions[7].data!.answers.push({
      dataId: 'a8Id',
      ownerRef: ADMIN_USER.id,
      text: 'Answer 8 on question',
      likes: [],
      dateCreated: jsonDate,
      dateModified: jsonDate,
      deleted: false,
      comments: a8Comments,
      status: AnswerStatus.Exportable
    });

    incrementDate();
    johnQuestions[8].data!.answers.push({
      dataId: 'a0Id',
      ownerRef: CHECKER_USER.id,
      text: 'Answer 0 on question',
      verseRef: { bookNum: 43, chapterNum: 1, verseNum: 1 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: jsonDate,
      dateModified: jsonDate,
      deleted: false,
      audioUrl: '/audio.mp3',
      comments: [],
      status: AnswerStatus.Exportable
    });

    incrementDate();
    johnQuestions[8].data!.answers.push({
      dataId: 'a1Id',
      ownerRef: CLEAN_CHECKER_USER.id,
      text: 'Answer 1 on question',
      verseRef: { bookNum: 43, chapterNum: 1, verseNum: 1 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: jsonDate,
      dateModified: jsonDate,
      deleted: false,
      audioUrl: '/audio.mp3',
      comments: [],
      status: AnswerStatus.Resolved
    });

    incrementDate();
    johnQuestions[8].data!.answers.push({
      dataId: 'a9Id',
      ownerRef: CHECKER_USER.id,
      text: 'Answer 9 on question',
      verseRef: { bookNum: 43, chapterNum: 1, verseNum: 1 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: jsonDate,
      dateModified: jsonDate,
      deleted: false,
      comments: []
    });

    questions = johnQuestions.concat(matthewQuestions);
    this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, questions, true);
  }

  private createTextDataForChapter(chapter: number): TextData {
    const delta = new Delta();
    delta.insert({ chapter: { number: chapter.toString(), style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`target: chapter ${chapter}, verse 1.`, { segment: `verse_${chapter}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${chapter}_2` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: `verse_${chapter}_2/p_1` });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`target: chapter ${chapter}, verse 3.`, { segment: `verse_${chapter}_3` });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`target: chapter ${chapter}, verse 4.`, { segment: `verse_${chapter}_4` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: `verse_${chapter}_4/p_1` });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert(`target: chapter ${chapter}, `, { segment: `verse_${chapter}_5` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ verse: { number: '6', style: 'v' } });
    delta.insert(`ישע`, { segment: `verse_${chapter}_6` });
    delta.insert('\n', { para: { style: 'p' } });
    return delta;
  }

  private waitForTimersToComplete(time: number = 0): void {
    this.fixture.detectChanges();
    tick(time);
  }
}
