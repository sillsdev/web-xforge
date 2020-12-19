import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { Location } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, ActivatedRouteSnapshot, Route } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ngfModule } from 'angular-file';
import { AngularSplitModule } from 'angular-split';
import { cloneDeep } from 'lodash';
import clone from 'lodash/clone';
import { CookieService } from 'ngx-cookie-service';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { obj } from 'realtime-server/lib/common/utils/obj-path';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { getQuestionDocId, Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { getTextDocId, TextData } from 'realtime-server/lib/scriptureforge/models/text-data';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { first } from 'rxjs/operators';
import { anyString, anything, deepEqual, instance, mock, reset, resetCalls, spy, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { FileService } from 'xforge-common/file.service';
import { createStorageFileData, FileOfflineData, FileType } from 'xforge-common/models/file-offline-data';
import { Snapshot } from 'xforge-common/models/snapshot';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, getAudioBlob, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { SharedModule } from '../../shared/shared.module';
import { TextChooserDialogComponent, TextSelection } from '../../text-chooser-dialog/text-chooser-dialog.component';
import { QuestionAnsweredDialogComponent } from '../question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogData } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
import { AnswerAction, CheckingAnswersComponent } from './checking-answers/checking-answers.component';
import { CheckingCommentFormComponent } from './checking-answers/checking-comments/checking-comment-form/checking-comment-form.component';
import { CheckingCommentsComponent } from './checking-answers/checking-comments/checking-comments.component';
import { CheckingOwnerComponent } from './checking-answers/checking-owner/checking-owner.component';
import { CheckingAudioCombinedComponent } from './checking-audio-combined/checking-audio-combined.component';
import { AudioTimePipe, CheckingAudioPlayerComponent } from './checking-audio-player/checking-audio-player.component';
import {
  AudioAttachment,
  CheckingAudioRecorderComponent
} from './checking-audio-recorder/checking-audio-recorder.component';
import { CheckingQuestionsComponent } from './checking-questions/checking-questions.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';
import { CheckingComponent } from './checking.component';
import { FontSizeComponent } from './font-size/font-size.component';

const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);
const mockedTranslationEngineService = mock(TranslationEngineService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedMdcDialog = mock(MdcDialog);
const mockedTextChooserDialogComponent = mock(TextChooserDialogComponent);
const mockedQuestionDialogService = mock(QuestionDialogService);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);
const mockedFileService = mock(FileService);

function createUser(id: string, role: string, nameConfirmed: boolean = true): UserInfo {
  return {
    id: 'user' + id,
    user: {
      name: 'User ' + id,
      email: 'user1@example.com',
      role: SystemRole.User,
      authId: 'auth01',
      avatarUrl: '',
      displayName: 'User ' + id,
      isDisplayNameConfirmed: nameConfirmed,
      sites: {}
    },
    role
  };
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

const ADMIN_USER: UserInfo = createUser('01', SFProjectRole.ParatextAdministrator);
const CHECKER_USER: UserInfo = createUser('02', SFProjectRole.CommunityChecker);
const CLEAN_CHECKER_USER: UserInfo = createUser('03', SFProjectRole.CommunityChecker, false);
const OBSERVER_USER: UserInfo = createUser('04', SFProjectRole.ParatextObserver);

class MockComponent {}

const ROUTES: Route[] = [
  { path: 'projects/:projectId/checking/:bookId', component: MockComponent },
  { path: 'projects/:projectId/translate/:bookId', component: MockComponent },
  { path: 'projects/:projectId', component: MockComponent }
];

describe('CheckingComponent', () => {
  configureTestingModule(() => ({
    declarations: [
      AudioTimePipe,
      CheckingAnswersComponent,
      CheckingAudioCombinedComponent,
      CheckingAudioPlayerComponent,
      CheckingAudioRecorderComponent,
      CheckingCommentFormComponent,
      CheckingCommentsComponent,
      CheckingComponent,
      CheckingOwnerComponent,
      CheckingQuestionsComponent,
      CheckingTextComponent,
      FontSizeComponent
    ],
    imports: [
      AngularSplitModule.forRoot(),
      ngfModule,
      NoopAnimationsModule,
      RouterTestingModule.withRoutes(ROUTES),
      AvatarTestingModule,
      SharedModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: UserService, useMock: mockedUserService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: MdcDialog, useMock: mockedMdcDialog },
      { provide: TextChooserDialogComponent, useMock: mockedTextChooserDialogComponent },
      { provide: QuestionDialogService, useMock: mockedQuestionDialogService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: FileService, useMock: mockedFileService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  describe('Interface', () => {
    it('can navigate using next button', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(1);
      env.clickButton(env.nextButton);
      tick(env.questionReadTimer);
      const nextQuestion = env.currentQuestion;
      expect(nextQuestion).toEqual(2);
    }));

    it('can navigate using previous button', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(2);
      env.clickButton(env.previousButton);
      tick(env.questionReadTimer);
      const nextQuestion = env.currentQuestion;
      expect(nextQuestion).toEqual(1);
    }));

    it('check navigate buttons disable at the end of the question list', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(1);
      const prev = env.previousButton;
      const next = env.nextButton;
      expect(prev.nativeElement.disabled).toBe(true);
      expect(next.nativeElement.disabled).toBe(false);
      env.selectQuestion(15);
      expect(prev.nativeElement.disabled).toBe(false);
      expect(next.nativeElement.disabled).toBe(true);
    }));

    it('should open question dialog', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.clickButton(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect().nothing();
    }));

    it('hides add question button for community checker', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      expect(env.addQuestionButton).toBeNull();
    }));

    it('responds to remote removed from project', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(1);
      expect(env.component.questionDocs.length).toEqual(15);
      env.component.projectDoc!.submitJson0Op(op => op.unset<string>(p => p.userRoles[CHECKER_USER.id]), false);
      env.waitForSliderUpdate();
      expect(env.component.projectDoc).toBeUndefined();
      expect(env.component.questionDocs.length).toEqual(0);
      env.waitForSliderUpdate();
    }));

    it('responds to remote community checking disabled when checker', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(1);
      const projectUserConfig = env.component.projectUserConfigDoc!.data!;
      expect(projectUserConfig.selectedTask).toEqual('checking');
      expect(projectUserConfig.selectedQuestionRef).not.toBeNull();
      env.component.projectDoc!.submitJson0Op(
        op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, false),
        false
      );
      env.waitForSliderUpdate();
      expect(projectUserConfig.selectedTask).toBeUndefined();
      expect(projectUserConfig.selectedQuestionRef).toBeUndefined();
      expect(env.component.projectDoc).toBeUndefined();
      env.waitForSliderUpdate();
    }));

    it('responds to remote community checking disabled when observer', fakeAsync(() => {
      // User with access to translate app should get redirected there
      const env = new TestEnvironment(OBSERVER_USER, 'ALL');
      env.selectQuestion(1);
      env.component.projectDoc!.submitJson0Op(
        op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, false),
        false
      );
      env.waitForSliderUpdate();
      expect(env.location.path()).toEqual('/projects/project01/translate/JHN');
      expect(env.component.projectDoc).toBeUndefined();
      expect(env.component.questionDocs.length).toEqual(0);
      env.waitForSliderUpdate();
    }));
  });

  describe('Questions', () => {
    it('questions are displaying and audio is cached', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      verify(mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, anything(), anything())).times(
        31
      );
      // Question 5 has been stored as the last question to start at
      expect(env.component.questionsPanel!.activeQuestionDoc!.data!.dataId).toBe('q5Id');
      // A sixteenth question is archived
      expect(env.questions.length).toEqual(15);
      const question = env.selectQuestion(15);
      expect(env.getQuestionText(question)).toBe('Question relating to chapter 2');
    }));

    it('questions are displaying for all books', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER, 'ALL');
      // Question 5 has been stored as the question to start at
      expect(env.component.questionsPanel!.activeQuestionDoc!.data!.dataId).toBe('q5Id');
      // A sixteenth question is archived
      expect(env.questions.length).toEqual(16);
      let question = env.selectQuestion(1);
      expect(env.getQuestionText(question)).toBe('Book 1, Q1 text');
      expect(env.currentBookAndChapter).toBe('John 1');
      question = env.selectQuestion(16);
      expect(env.getQuestionText(question)).toBe('Matthew question relating to chapter 1');
      expect(env.currentBookAndChapter).toBe('Matthew 1');
    }));

    it('can select a question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const question = env.selectQuestion(1);
      expect(question.classes['mdc-list-item--activated']).toBe(true);
    }));

    it('question status change to read', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      let question = env.selectQuestion(2, false);
      expect(question.classes['question-read']).toBeUndefined();
      question = env.selectQuestion(3);
      expect(question.classes['question-read']).toBe(true);
    }));

    it('question status change to answered', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const question = env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(question.classes['question-answered']).toBe(true);
    }));

    it('question shows answers icon and total', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      const question = env.selectQuestion(6, false);
      expect(env.getUnread(question)).toEqual(1);
      tick(env.questionReadTimer);
      env.fixture.detectChanges();
      expect(env.getUnread(question)).toEqual(0);
    }));

    it('allows admin to archive a question', fakeAsync(async () => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(1);
      const question = env.component.answersPanel!.questionDoc!.data!;
      expect(question.isArchived).toBe(false);
      expect(env.component.questionDocs.filter(q => q.data!.isArchived !== true).length).toEqual(15);
      expect(env.component.questionVerseRefs.length).toEqual(15);

      env.clickButton(env.archiveQuestionButton);

      tick(env.questionReadTimer);

      expect(question.isArchived).toBe(true);
      expect(env.component.questionDocs.filter(q => q.data!.isArchived !== true).length).toEqual(14);
      expect(env.component.questionVerseRefs.length).toEqual(14);
    }));

    it('opens a dialog when edit question is clicked', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(15);
      when(mockedQuestionDialogService.questionDialog(anything())).thenResolve(
        env.component.questionsPanel!.activeQuestionDoc
      );
      const questionId = 'q15Id';
      verify(
        mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, questionId, 'audioFile.mp3')
      ).times(3);
      env.clickButton(env.editQuestionButton);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent, anything())).never();
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      tick(env.questionReadTimer);
      verify(
        mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, questionId, 'audioFile.mp3')
      ).times(4);
      expect().nothing();
    }));

    it('removes audio player when question audio deleted', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      const questionId = 'q15Id';
      const questionDoc = cloneDeep(env.getQuestionDoc(questionId));
      questionDoc.submitJson0Op(op => {
        op.unset(qd => qd.audioUrl!);
      });
      when(mockedQuestionDialogService.questionDialog(anything())).thenResolve(questionDoc);
      env.selectQuestion(15);
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
    }));

    it('uploads audio then updates audio url', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER, 'JHN', false);
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
    }));

    it('user must confirm question answered dialog before question dialog appears', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      when(env.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('close'));
      // Edit a question with answers
      env.selectQuestion(6);
      env.clickButton(env.editQuestionButton);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).once();
      when(env.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('accept'));
      env.clickButton(env.editQuestionButton);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).twice();
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect().nothing();
    }));

    it('should move highlight and question icon when question is edited to move verses', fakeAsync(async () => {
      const env = new TestEnvironment(ADMIN_USER);
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
      await flushPromises();

      expect(env.segmentHasQuestion(1, 1)).toBe(true);
      expect(env.isSegmentHighlighted(1, 1)).toBe(false);
      expect(env.isSegmentHighlighted(1, 5)).toBe(true);
      expect(env.segmentHasQuestion(1, 5)).toBe(true);
      expect(env.component.questionVerseRefs[0]).toEqual(VerseRef.parse('JHN 1:5'));
    }));

    it('unread answers badge is only visible when the setting is ON to see other answers', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      expect(env.getUnread(env.questions[5])).toEqual(1);
      env.setSeeOtherUserResponses(false);
      expect(env.getUnread(env.questions[5])).toEqual(0);
    }));

    it('unread answers badge always hidden from community checkers', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      // One unread answer and three comments are hidden
      expect(env.getUnread(env.questions[6])).toEqual(0);
      env.setSeeOtherUserResponses(false);
      expect(env.getUnread(env.questions[6])).toEqual(0);
    }));

    it('responds to remote question added', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      let question = env.selectQuestion(1);
      const questionId = env.component.questionsPanel!.activeQuestionDoc!.id;
      expect(env.questions.length).toEqual(15);
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
      expect(env.component.questionsPanel!.activeQuestionDoc!.id).toBe(questionId);
      expect(env.questions.length).toEqual(16);
      question = env.selectQuestion(16);
      expect(env.getQuestionText(question)).toBe('Admin just added a question.');
    }));

    it('respond to remote question audio added or removed', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
    }));

    it('question added to another book changes the route to that book and activates the question', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
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
      expect(env.location.path()).toEqual('/projects/project01/checking/MAT');
      env.activateQuestion('q1Id');
      expect(env.location.path()).toEqual('/projects/project01/checking/JHN');
    }));
  });

  describe('Answers', () => {
    it('answer panel is initiated and shows the first question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      expect(env.answerPanel).not.toBeNull();
    }));

    it('can answer a question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      // Checker user already has an answer on question 6 and 9
      expect(env.component.summary.answered).toEqual(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answer question 2');
      expect(env.component.summary.answered).toEqual(3);
    }));

    it('opens dialog if answering a question for the first time', fakeAsync(() => {
      const env = new TestEnvironment(CLEAN_CHECKER_USER);
      env.selectQuestion(2);
      env.answerQuestion('Answering question 2 should pop up a dialog');
      verify(mockedUserService.editDisplayName(true)).once();
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answering question 2 should pop up a dialog');
    }));

    it('inserts newer answer above older answers', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      env.answerQuestion('Just added answer');
      expect(env.answers.length).toEqual(2);
      expect(env.getAnswerText(0)).toBe('Just added answer');
      expect(env.getAnswerText(1)).toBe('Answer 7 on question');
    }));

    it('saves the location of the last visited question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
      const env = new TestEnvironment(CHECKER_USER, 'ALL');
      const projectUserConfigDoc = env.component.projectUserConfigDoc!.data!;
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).once();
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q5Id');
      env.selectQuestion(4);
      expect(projectUserConfigDoc.selectedTask).toBe('checking');
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q4Id');
      expect(projectUserConfigDoc.selectedBookNum).toBeUndefined();
      verify(mockedTranslationEngineService.trainSelectedSegment(anything(), anything())).twice();
    }));

    it('can cancel answering a question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).not.toBeNull();
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).toBeNull();
      expect(env.addAnswerButton).not.toBeNull();
    }));

    it('does not save the answer when storage quota exceeded', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
        verseRef: fromVerseRef(VerseRef.parse('JHN 1:1')),
        audio: {
          status: 'processed',
          fileName: 'audioFile.mp3',
          blob: getAudioBlob()
        }
      };
      env.component.answerAction(answerAction);
      env.waitForSliderUpdate();
      const questionDoc = env.component.questionsPanel!.activeQuestionDoc!;
      expect(questionDoc.data!.answers.length).toEqual(0);
      expect(env.saveAnswerButton).not.toBeNull();
    }));

    it('can change answering tabs', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      env.clickButton(env.audioTab);
      expect(env.recordButton).not.toBeNull();
    }));

    it('check answering validation', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField.classes['mdc-text-field--invalid']).toBe(true);
    }));

    it('can edit a new answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
    }));

    it('can edit an existing answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      // Open up question where user already has an answer
      env.selectQuestion(9);
      expect(env.answers.length).toBeGreaterThan(1, 'setup problem');
      expect(env.component.answersPanel!.answers.some(answer => answer.ownerRef === CHECKER_USER.id)).toBe(
        true,
        'setup problem'
      );
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswerText(myAnswerIndex)).toEqual('Answer 0 on question', 'setup problem');
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined('have already read this answer');

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
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBeUndefined(
        "don't spotlight own answer on cancelled edit"
      );
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(myAnswerIndex)).toEqual('Edited answer', 'should not have been changed');
    }));

    it('highlights remotely edited answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(9);
      const otherAnswerIndex = 1;
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(otherAnswerIndex)).toBe('Answer 1 on question');

      env.simulateRemoteEditAnswer(otherAnswerIndex, 'Question 9 edited answer');
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswerText(otherAnswerIndex)).toBe('Question 9 edited answer');
    }));

    it('does not highlight upon sync', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(9);
      const answerIndex = 1;
      expect(env.getAnswer(answerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(answerIndex)).toBe('Answer 1 on question');

      env.simulateSync(answerIndex);
      expect(env.getAnswer(answerIndex).classes['attention']).toBeUndefined();
      expect(env.getAnswerText(answerIndex)).toBe('Answer 1 on question');
    }));

    it('still shows answers as read after canceling an edit', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
    }));

    it('only my answer is highlighted after I add an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      env.answerQuestion('My answer');
      expect(env.answers.length).toBeGreaterThan(1, 'setup problem');
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBeUndefined();
    }));

    it('can remove audio from answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const data: FileOfflineData = { id: 'a6Id', dataCollection: 'questions', blob: getAudioBlob() };
      when(mockedFileService.findOrUpdateCache(FileType.Audio, 'questions', 'a6Id', '/audio.mp3')).thenResolve(data);
      env.selectQuestion(6);
      env.clickButton(env.getAnswerEditButton(0));
      env.waitForSliderUpdate();
      env.clickButton(env.audioTab);
      env.clickButton(env.removeAudioButton);
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      verify(
        mockedFileService.deleteFile(FileType.Audio, 'project01', QuestionDoc.COLLECTION, 'a6Id', CHECKER_USER.id)
      ).once();
      expect().nothing();
    }));

    it('saves audio answer offline and plays from cache', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER, 'JHN', false);
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
    }));

    it('saves the answer to the correct question when active question changed', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const resolveUpload$: Subject<void> = env.resolveFileUploadSubject('uploadedFile.mp3');
      env.selectQuestion(1);
      env.answerQuestion('Answer with audio', 'audioFile.mp3');
      expect(env.answers.length).toEqual(0);
      const question = env.getQuestionDoc('q1Id');
      expect(env.saveAnswerButton).not.toBeNull();
      expect(env.saveAnswerButton.nativeElement.disabled).toBe(true);
      env.selectQuestion(2);
      resolveUpload$.next();
      env.waitForSliderUpdate();
      expect(question.data!.answers.length).toEqual(1);
    }));

    it('can delete an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      env.clickButton(env.answerDeleteButton(0));
      env.waitForSliderUpdate();
      expect(env.answers.length).toEqual(0);
      verify(
        mockedFileService.deleteFile(FileType.Audio, 'project01', QuestionDoc.COLLECTION, 'a6Id', CHECKER_USER.id)
      ).once();
    }));

    it('can delete correct answer after changing chapters', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      env.component.chapter!++;
      env.clickButton(env.answerDeleteButton(0));
      env.waitForSliderUpdate();
      expect(env.answers.length).toEqual(0);
    }));

    it('answers reset when changing questions', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      env.selectQuestion(1);
      expect(env.answers.length).toEqual(0);
    }));

    it("can like and unlike another's answer", fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
    }));

    it('cannot like your own answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(1);
      env.answerQuestion('Answer question to be liked');
      expect(env.getLikeTotal(0)).toBe(0);
      env.clickButton(env.likeButtons[0]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(0)).toBe(0);
      verify(mockedNoticeService.show('You cannot like your own answer.')).once();
    }));

    it('observer cannot like an answer', fakeAsync(() => {
      const env = new TestEnvironment(OBSERVER_USER);
      env.selectQuestion(7);
      expect(env.getAnswerText(0)).toBe('Answer 7 on question');
      expect(env.getLikeTotal(0)).toBe(0);
      env.clickButton(env.likeButtons[0]);
      env.waitForSliderUpdate();
      expect(env.getLikeTotal(0)).toBe(0);
      verify(mockedNoticeService.show('Only Community Checkers can like answers.')).once();
    }));

    it('hides the like icon if see other users responses is disabled', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      expect(env.likeButtons.length).toEqual(1);
      env.setSeeOtherUserResponses(false);
      expect(env.likeButtons.length).toEqual(0);
      env.setSeeOtherUserResponses(true);
      expect(env.likeButtons.length).toEqual(1);
    }));

    it('do not show answers until current user has submitted an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      expect(env.getUnread(env.questions[6])).toEqual(0);
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      env.answerQuestion('Answer from checker');
      expect(env.answers.length).toBe(2);
    }));

    it('checker can only see their answers when the setting is OFF to see other answers', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.setSeeOtherUserResponses(false);
      env.selectQuestion(6);
      expect(env.answers.length).toBe(1);
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      env.answerQuestion('Answer from checker');
      expect(env.answers.length).toBe(1);
    }));

    it('can add scripture to an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
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
      env.clickButton(env.selectTextTab);
      expect(env.scriptureText).toBeFalsy();
      // Add scripture
      env.clickButton(env.selectVersesButton);
      expect(env.scriptureText).toBe('…The selected text (John 2:2-5)');
      env.clickButton(env.saveAnswerButton);
      expect(env.getAnswerScriptureText(0)).toBe('…The selected text(John 2:2-5)');
    }));

    it('can remove scripture from an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(6);
      expect(env.getAnswerScriptureText(0)).toBe('Quoted scripture(John 1:1)');
      env.clickButton(env.getAnswerEditButton(0));
      env.clickButton(env.selectTextTab);
      env.waitForSliderUpdate();
      env.clickButton(env.clearScriptureButton);
      env.clickButton(env.saveAnswerButton);
      expect(env.getAnswerScripture(0)).toBeFalsy();
    }));

    it('observer cannot answer a question', fakeAsync(() => {
      const env = new TestEnvironment(OBSERVER_USER);
      env.selectQuestion(2);
      expect(env.addAnswerButton).toBeNull();
    }));

    it('project admins can only edit own answers', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerEditButton(0)).toBeNull();
      env.selectQuestion(7);
      expect(env.getAnswerEditButton(0)).not.toBeNull();
    }));

    it('error about "answer or recording required" goes away after add recording', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(1);
      env.clickButton(env.addAnswerButton);
      env.clickButton(env.saveAnswerButton);
      // Have not given any answer yet, so clicking Save should show a validation error.
      expect(env.component.answersPanel!.answerForm.invalid).toBe(true, 'setup');
      expect(env.answerFormErrors.length).toEqual(1, 'setup');
      expect(env.answerFormErrors[0].nativeElement.textContent).toContain('record', 'setup');
      env.clickButton(env.audioTab);

      // SUT
      env.clickButton(env.recordButton);
      env.simulateAudioRecordingFinishedProcessing();

      // We made a recording, so we should not be showing a validation error.
      expect(env.component.answersPanel!.answerForm.valid).toBe(true);
    }));

    it('new remote answers from other users are not displayed until requested', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);

      env.selectQuestion(7);
      expect(env.totalAnswersMessageCount).toBeNull('setup');
      env.answerQuestion('New answer from current user');

      // Answers count as displayed in HTML.
      expect(env.totalAnswersMessageCount).toEqual(2);
      // Individual answers in HTML.
      expect(env.answers.length).toEqual(2, 'setup');
      // Answers in code.
      expect(env.component.answersPanel!.answers.length).toEqual(2, 'setup');

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
      const env = new TestEnvironment(ADMIN_USER);
      // Select a question with at least one answer, but with no answers
      // authored by the project admin since that was hindering this test.
      env.selectQuestion(6);

      expect(env.answers.length).toEqual(1, 'setup');
      expect(env.component.answersPanel!.answers.length).toEqual(1, 'setup');
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
      const env = new TestEnvironment(ADMIN_USER);
      // Select a question with at least one answer, but with no answers
      // authored by the project admin, in case that hinders this test.
      env.selectQuestion(6);

      expect(env.answers.length).toEqual(1, 'setup');
      expect(env.component.answersPanel!.answers.length).toEqual(1, 'setup');
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
    }));

    it("new remote answers and banner don't show, if user has not yet answered the question", fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      expect(env.answers.length).toEqual(0, 'setup (no answers in DOM yet)');
      expect(env.component.answersPanel!.answers.length).toEqual(1, 'setup');
      expect(env.totalAnswersMessageCount).toBeNull();

      // Another user adds an answer, but with no impact on the current user's screen yet.
      env.simulateNewRemoteAnswer();
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.answers.length).toEqual(0, 'broken unrelated functionality');
      // Incoming remote answer should have been absorbed into the set of i
      // answers pending to show, since user was looking at the Add Answer button
      expect(env.component.answersPanel!.answers.length).toEqual(2);
      // We don't show the total answer count in the heading until the user adds her answer.
      expect(env.totalAnswersMessageCount).toBeNull();

      // Current user adds her answer, and all answers show.
      env.answerQuestion('New answer from current user');
      expect(env.showUnreadAnswersButton).toBeNull();
      expect(env.answers.length).toEqual(3);
      expect(env.component.answersPanel!.answers.length).toEqual(3);
    }));

    it('show-remote-answer banner disappears if user deletes their answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.answers.length).toEqual(2, 'setup');
      expect(env.component.answersPanel!.answers.length).toEqual(2, 'setup');
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
    }));

    it('show-remote-answer banner disappears if the un-shown remote answer is deleted', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.answers.length).toEqual(2, 'setup');
      expect(env.component.answersPanel!.answers.length).toEqual(2, 'setup');
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
    }));

    it('show-remote-answer banner not shown if user is editing their answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.showUnreadAnswersButton).toBeNull('setup');
      expect(env.answers.length).toEqual(2, 'setup');
      // A remote answer is added, but the current user does not click the banner to show the remote answer.
      env.simulateNewRemoteAnswer();
      expect(env.showUnreadAnswersButton).not.toBeNull('setup');
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
    }));

    it('show-remote-answer banner not shown to user if see-others-answers is disabled', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.setSeeOtherUserResponses(false);
      expect(env.component.projectDoc!.data!.checkingConfig.usersSeeEachOthersResponses).toBe(false, 'setup');
      env.selectQuestion(7);
      // User answers a question
      env.answerQuestion('New answer from current user');
      expect(env.totalAnswersMessageText).toEqual('Your answer', 'setup');

      // A remote answer is added.
      env.simulateNewRemoteAnswer();
      expect(env.totalAnswersMessageText).toEqual('Your answer');
      // Banner is not shown
      expect(env.showUnreadAnswersButton).toBeNull();
    }));

    it('show-remote-answer banner still shown to proj admin if see-others-answers is disabled', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.setSeeOtherUserResponses(false);
      expect(env.component.projectDoc!.data!.checkingConfig.usersSeeEachOthersResponses).toBe(false, 'setup');
      // Select a question with no answers authored by the project admin, in case that hinders this test.
      env.selectQuestion(6);
      expect(env.totalAnswersMessageCount).toEqual(1, 'setup');

      // A remote answer is added.
      env.simulateNewRemoteAnswer();
      expect(env.totalAnswersMessageCount).toEqual(2);
      // Banner is shown
      expect(env.showUnreadAnswersButton).not.toBeNull();
    }));

    describe('Comments', () => {
      it('can comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment(CHECKER_USER);
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        expect(env.getAnswerComments(0).length).toBe(1);
      }));

      it('can edit comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment(CHECKER_USER);
        // Answer a question in a chapter where chapters previous also have comments
        env.selectQuestion(15);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        env.commentOnAnswer(0, 'Second comment to answer');
        env.clickButton(env.getEditCommentButton(0, 0));
        expect(env.commentFormTextFields.length).toEqual(1);
        env.setTextFieldValue(env.getYourCommentField(0), 'Edited comment');
        env.clickButton(env.getSaveCommentButton(0));
        env.waitForSliderUpdate();
        expect(env.getAnswerCommentText(0, 0)).toBe('Edited comment');
        expect(env.getAnswerCommentText(0, 1)).toBe('Second comment to answer');
        expect(env.getAnswerComments(0).length).toBe(2);
      }));

      it('can delete comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment(CHECKER_USER);
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        expect(env.getAnswerComments(0).length).toBe(1);
        env.clickButton(env.getDeleteCommentButton(0, 0));
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(0);
      }));

      it('comments only appear on the relevant answer', fakeAsync(() => {
        const env = new TestEnvironment(CHECKER_USER);
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'First comment');
        env.commentOnAnswer(0, 'Second comment');
        expect(env.getAnswerComments(0).length).toBe(2);
        env.selectQuestion(2);
        env.answerQuestion('Second answer question to be commented on');
        env.commentOnAnswer(0, 'Third comment');
        expect(env.getAnswerComments(0).length).toBe(1);
        expect(env.getAnswerCommentText(0, 0)).toBe('Third comment');
        env.selectQuestion(1);
        expect(env.getAnswerCommentText(0, 0)).toBe('First comment');
      }));

      it('comments display show more button', fakeAsync(() => {
        const env = new TestEnvironment(ADMIN_USER);
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
      }));

      it('comments unread only mark as read when the show more button is clicked', fakeAsync(() => {
        const env = new TestEnvironment(ADMIN_USER);
        const question = env.selectQuestion(8, false);
        expect(env.getUnread(question)).toEqual(4);
        tick(env.questionReadTimer);
        env.fixture.detectChanges();
        expect(env.getUnread(question)).toEqual(2);
        env.clickButton(env.getShowAllCommentsButton(0));
        env.waitForSliderUpdate();
        expect(env.getUnread(question)).toEqual(0);
      }));

      it('displays comments in real-time', fakeAsync(() => {
        const env = new TestEnvironment(CHECKER_USER);
        env.selectQuestion(1);
        env.answerQuestion('Admin will add a comment to this');
        expect(env.getAnswerComments(0).length).toEqual(0);
        const commentId: string = env.commentOnAnswerRemotely(
          'Comment left by admin',
          env.component.questionsPanel!.activeQuestionDoc!
        );
        tick(env.questionReadTimer);
        env.fixture.detectChanges();
        expect(env.getAnswerComments(0).length).toEqual(1);
        expect(env.component.projectUserConfigDoc!.data!.commentRefsRead.includes(commentId)).toBe(true);
      }));

      it('does not mark third comment read if fourth comment also added', fakeAsync(() => {
        const env = new TestEnvironment(CHECKER_USER);
        env.selectQuestion(1);
        env.answerQuestion('Admin will add four comments');
        env.commentOnAnswer(0, 'First comment');
        const questionDoc: QuestionDoc = clone(env.component.questionsPanel!.activeQuestionDoc!);
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
      }));

      it('observer cannot comment on an answer', fakeAsync(() => {
        const env = new TestEnvironment(OBSERVER_USER);
        env.selectQuestion(6);
        expect(env.getAddCommentButton(0)).toBeNull();
      }));

      it('project admins can only edit own comments', fakeAsync(() => {
        const env = new TestEnvironment(ADMIN_USER);
        env.selectQuestion(7);
        expect(env.getEditCommentButton(0, 0)).not.toBeNull();
        env.selectQuestion(8);
        expect(env.getAnswerComments(0).length).toEqual(2);
        expect(env.getEditCommentButton(0, 0)).toBeNull();
      }));
    });

    it('update answer audio cache when activating a question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const questionDoc = spy(env.getQuestionDoc('q5Id'));
      verify(questionDoc!.updateAnswerFileCache()).never();
      env.selectQuestion(5);
      verify(questionDoc!.updateAnswerFileCache()).once();
      expect().nothing();
    }));

    it('update answer audio cache after save', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const questionDoc = spy(env.getQuestionDoc('q6Id'));
      env.selectQuestion(6);
      env.clickButton(env.getAnswerEditButton(0));
      env.waitForSliderUpdate();
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      verify(questionDoc!.updateAnswerFileCache()).twice();
      expect().nothing();
    }));

    it('update answer audio cache on remote update to question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const questionDoc = spy(env.getQuestionDoc('q6Id'));
      env.selectQuestion(6);
      env.simulateRemoteEditAnswer(0, 'Question 6 edited answer');
      verify(questionDoc!.updateAnswerFileCache()).twice();
      expect().nothing();
    }));

    it('update answer audio cache on remote removal of an answer', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      const questionDoc = spy(env.getQuestionDoc('q6Id'));
      env.selectQuestion(6);
      env.simulateRemoteDeleteAnswer('q6Id', 0);
      verify(questionDoc!.updateAnswerFileCache()).twice();
      expect().nothing();
    }));
  });

  describe('Text', () => {
    it('can increase and decrease font size', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      const editor = env.quillEditor;
      expect(editor.style.fontSize).toBe('1rem');
      env.clickButton(env.increaseFontSizeButton);
      expect(editor.style.fontSize).toBe('1.1rem');
      env.clickButton(env.decreaseFontSizeButton);
      expect(editor.style.fontSize).toBe('1rem');
    }));

    it('can select a question from the text', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.getVerse(1, 3).dispatchEvent(new Event('click'));
      env.waitForSliderUpdate();
      tick(env.questionReadTimer);
      env.fixture.detectChanges();
      expect(env.currentQuestion).toBe(4);
    }));

    it('quill editor element lang attribute is set from project language', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const quillElementLang = env.quillEditorElement.getAttribute('lang');
      expect(quillElementLang).toEqual(env.project01WritingSystemTag);
    }));

    it('adds question count attribute to element', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      const segment = env.quillEditor.querySelector('usx-segment[data-segment=verse_1_1]')!;
      expect(segment.hasAttribute('data-question-count')).toBe(true);
      expect(segment.getAttribute('data-question-count')).toBe('13');
    }));

    it('updates question highlight when verse ref changes', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(4);
      expect(env.getVerse(1, 3)).not.toBeNull();
      let segment = env.getVerse(1, 3);
      expect(segment.classList.contains('question-segment')).toBe(true);
      expect(segment.classList.contains('highlight-segment')).toBe(true);
      expect(fromVerseRef(env.component.activeQuestionVerseRef!).verseNum).toEqual(3);
      env.component.questionsPanel!.activeQuestionDoc!.submitJson0Op(op => {
        op.set(qd => qd.verseRef, fromVerseRef(VerseRef.parse('JHN 1:5')));
      }, false);
      env.waitForSliderUpdate();
      tick();
      segment = env.getVerse(1, 3);
      expect(segment.classList.contains('question-segment')).toBe(false);
      expect(segment.classList.contains('highlight-segment')).toBe(false);
      expect(fromVerseRef(env.component.activeQuestionVerseRef!).verseNum).toEqual(5);
      segment = env.getVerse(1, 5);
      expect(segment.classList.contains('question-segment')).toBe(true);
      expect(segment.classList.contains('highlight-segment')).toBe(true);
    }));
  });
});

interface UserInfo {
  id: string;
  user: User;
  role: string;
}

class TestEnvironment {
  readonly component: CheckingComponent;
  readonly fixture: ComponentFixture<CheckingComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);
  readonly mockedAnsweredDialogRef: MdcDialogRef<QuestionAnsweredDialogComponent> = mock(MdcDialogRef);
  readonly mockedTextChooserDialogComponent: MdcDialogRef<TextChooserDialogComponent> = mock(MdcDialogRef);
  readonly location: Location;

  questionReadTimer: number = 2000;
  project01WritingSystemTag = 'en';
  isOnline: BehaviorSubject<boolean>;
  fileSyncComplete: Subject<void> = new Subject();

  private readonly adminProjectUserConfig: SFProjectUserConfig = {
    ownerRef: ADMIN_USER.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  };

  private readonly checkerProjectUserConfig: SFProjectUserConfig = {
    ownerRef: CHECKER_USER.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    selectedQuestionRef: 'project01:q5Id',
    questionRefsRead: [],
    answerRefsRead: ['a0Id', 'a1Id'],
    commentRefsRead: []
  };

  private readonly cleanCheckerProjectUserConfig: SFProjectUserConfig = {
    ownerRef: CLEAN_CHECKER_USER.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  };

  private readonly observerProjectUserConfig: SFProjectUserConfig = {
    ownerRef: OBSERVER_USER.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedQuestionRef: 'project01:q5Id',
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  };

  private projectBookRoute: string = 'JHN';

  private readonly testProject: SFProject = {
    name: 'Project 01',
    paratextId: 'pt01',
    shortName: 'P01',
    writingSystem: {
      tag: this.project01WritingSystemTag
    },
    sync: {
      queuedCount: 0
    },
    checkingConfig: {
      usersSeeEachOthersResponses: true,
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone
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
          { number: 1, lastVerse: 18, isValid: true, permissions: {} },
          { number: 2, lastVerse: 25, isValid: true, permissions: {} }
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
    userRoles: {
      [ADMIN_USER.id]: ADMIN_USER.role,
      [CHECKER_USER.id]: CHECKER_USER.role,
      [CLEAN_CHECKER_USER.id]: CLEAN_CHECKER_USER.role,
      [OBSERVER_USER.id]: OBSERVER_USER.role
    }
  };

  constructor(user: UserInfo, projectBookRoute: string = 'JHN', hasConnection: boolean = true) {
    reset(mockedFileService);
    this.setRouteSnapshot(projectBookRoute);
    this.setupDefaultProjectData(user);
    when(mockedUserService.editDisplayName(true)).thenResolve();
    this.isOnline = new BehaviorSubject<boolean>(hasConnection);
    when(mockedPwaService.isOnline).thenReturn(this.isOnline.getValue());
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());
    when(mockedPwaService.isOnline).thenReturn(hasConnection);
    when(
      mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, anything(), anyString())
    ).thenResolve(createStorageFileData(QuestionDoc.COLLECTION, 'anyId', 'filename.mp3', getAudioBlob()));
    when(
      mockedFileService.findOrUpdateCache(FileType.Audio, QuestionDoc.COLLECTION, anything(), undefined)
    ).thenResolve(undefined);
    when(mockedFileService.fileSyncComplete$).thenReturn(this.fileSyncComplete);
    this.fixture = TestBed.createComponent(CheckingComponent);
    this.component = this.fixture.componentInstance;
    this.location = TestBed.get(Location);
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

  get archiveQuestionButton(): DebugElement {
    return this.answerPanel.query(By.css('.archive-question-button'));
  }

  get audioPlayerOnQuestion(): DebugElement {
    return this.answerPanel.query(By.css('.question-audio'));
  }

  get cancelAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#cancel-answer'));
  }

  get currentBookAndChapter(): string {
    return this.fixture.debugElement
      .query(By.css('h2.chapter-select'))
      .nativeElement.textContent.replace('keyboard_arrow_down', '')
      .trim();
  }

  get commentFormTextFields(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-text-field[formControlName="commentText"]'));
  }

  get currentQuestion(): number {
    const questions = this.questions;
    for (const questionNumber in questions) {
      if (
        questions[questionNumber].classes.hasOwnProperty('mdc-list-item--activated') &&
        questions[questionNumber].classes['mdc-list-item--activated'] === true
      ) {
        // Need to add one as css selector nth-child starts index from 1 instead of zero
        return Number(questionNumber) + 1;
      }
    }
    return -1;
  }

  get decreaseFontSizeButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-font-size mdc-menu-surface button:first-child'));
  }

  get editQuestionButton(): DebugElement {
    return this.answerPanel.query(By.css('.edit-question-button'));
  }

  get increaseFontSizeButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-font-size mdc-menu-surface button:last-child'));
  }

  get likeButtons(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.like-answer'));
  }

  get nextButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-navigation .next-question'));
  }

  set onlineStatus(hasConnection: boolean) {
    when(mockedPwaService.isOnline).thenReturn(hasConnection);
    this.isOnline.next(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  get previousButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-navigation .prev-question'));
  }

  get questions(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#questions-panel .mdc-list-item'));
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

  get recordButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-form button.record'));
  }

  get audioTab(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-form mdc-tab:nth-child(2)'));
  }

  get removeAudioButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.remove-audio-file'));
  }

  get saveAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#save-answer'));
  }

  get yourAnswerField(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-textarea[formControlName="answerText"]'));
  }

  get answerFormErrors(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#answer-form .form-helper-text'));
  }

  get scriptureText(): string | null {
    const scriptureText = document.querySelector('.scripture-text');
    return scriptureText == null ? null : scriptureText.textContent!.trim();
  }

  get clearScriptureButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.clear-selection'));
  }

  get selectTextTab(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-form mdc-tab:nth-child(3)'));
  }

  get selectVersesButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.answer-select-text button[unelevated]'));
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

  activateQuestion(dataId: string) {
    const questionDoc = this.getQuestionDoc(dataId);
    this.component.questionsPanel!.activateQuestion(questionDoc);
    tick();
    this.fixture.detectChanges();
    tick(this.questionReadTimer);
    this.setRouteSnapshot(Canon.bookNumberToId(questionDoc.data!.verseRef.bookNum));
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
    this.setTextFieldValue(this.yourAnswerField, answer);
    if (audioFilename != null) {
      const audio: AudioAttachment = { status: 'processed', blob: getAudioBlob(), fileName: audioFilename };
      this.component.answersPanel?.processAudio(audio);
    }
    this.clickButton(this.saveAnswerButton);
    this.waitForSliderUpdate();
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    flush();
    this.fixture.detectChanges();
  }

  commentOnAnswer(answerIndex: number, comment: string): void {
    this.clickButton(this.getAddCommentButton(answerIndex));
    this.setTextFieldValue(this.getYourCommentField(answerIndex), comment);
    this.clickButton(this.getSaveCommentButton(answerIndex));
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
      dateModified: date
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
    return question.query(By.css('.question-title span')).nativeElement.textContent;
  }

  getSaveCommentButton(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('.save-comment'));
  }

  getUnread(question: DebugElement): number {
    return parseInt(question.query(By.css('.view-answers span')).nativeElement.textContent, 10);
  }

  getYourCommentField(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('mdc-text-field[formControlName="commentText"]'));
  }

  selectQuestion(/** indexed starting at 1 */ questionNumber: number, includeReadTimer: boolean = true): DebugElement {
    const question = this.fixture.debugElement.query(
      By.css('#questions-panel .mdc-list-item:nth-child(' + questionNumber + ')')
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
    const input = textField.query(By.css('input, textarea'));
    const inputElem = input.nativeElement as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    inputElem.dispatchEvent(new Event('change'));
    this.waitForSliderUpdate();
  }

  getShowAllCommentsButton(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('.show-all-comments'));
  }

  getVerse(chapter: number, verse: number): Element {
    return this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
  }

  isSegmentHighlighted(chapter: number, verse: number): boolean {
    const segment = this.getVerse(chapter, verse);
    return segment != null && segment.classList.contains('highlight-segment');
  }

  segmentHasQuestion(chapter: number, verse: number): boolean {
    const segment = this.getVerse(chapter, verse);
    return segment != null && segment.classList.contains('question-segment');
  }

  waitForSliderUpdate(): void {
    tick(100);
    this.fixture.detectChanges();
  }

  insertQuestion(newQuestion: Question): void {
    const docId = getQuestionDocId('project01', newQuestion.dataId);
    this.realtimeService.addSnapshot(QuestionDoc.COLLECTION, {
      id: docId,
      data: newQuestion
    });
    this.realtimeService.updateAllSubscribeQueries();
  }

  /** To use if the Stop Recording button isn't showing up in the test DOM. */
  simulateAudioRecordingFinishedProcessing(): void {
    this.component.answersPanel!.audioCombinedComponent!.audioRecorderComponent!.status.emit({
      status: 'processed',
      url: 'example.com/foo.mp3'
    });
    flush();
    this.fixture.detectChanges();
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
  deleteAnswerOwnedBy(userId: string = CHECKER_USER.id) {
    const usersAnswer = this.component.answersPanel!.questionDoc!.data!.answers.filter(
      answer => answer.ownerRef === userId
    )[0];
    this.component.answersPanel!.deleteAnswer(usersAnswer);
    flush();
    this.fixture.detectChanges();
  }

  /** Delete answer by id behind the scenes */
  deleteAnswer(answerIdToDelete: string) {
    const questionDoc = this.component.answersPanel!.questionDoc!;
    const answers = questionDoc.data!.answers;
    const answerIndex = answers.findIndex(existingAnswer => existingAnswer.dataId === answerIdToDelete);

    questionDoc.submitJson0Op(op => op.remove(q => q.answers, answerIndex));

    flush();
    this.fixture.detectChanges();
  }

  simulateNewRemoteAnswer(dataId: string = 'newAnswer1', text: string = 'new answer from another user') {
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
          audioUrl: '/audio.mp3',
          comments: []
        }),
      // Another user
      false
    );
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
  }

  simulateRemoteEditQuestionAudio(filename?: string, questionId?: string): void {
    const questionDoc =
      questionId != null ? this.getQuestionDoc(questionId) : this.component.questionsPanel!.activeQuestionDoc!;
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
    questionDoc.submitJson0Op(op => op.remove(q => q.answers, answerIndex), false);
    this.fixture.detectChanges();
  }

  simulateRemoteEditAnswer(index: number, text: string): void {
    const questionDoc = this.component.questionsPanel!.activeQuestionDoc!;
    questionDoc.submitJson0Op(op => {
      op.set(q => q.answers[index].text!, text);
      op.set(q => q.answers[index].dateModified, new Date().toJSON());
    }, false);
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
  }

  simulateSync(index: number): void {
    const questionDoc = this.component.questionsPanel!.activeQuestionDoc!;
    questionDoc.submitJson0Op(op => {
      op.set(q => (q.answers[index] as any).syncUserRef, objectId());
    }, false);
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
  }

  private setRouteSnapshot(bookId: string) {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.params = { bookId: bookId };
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);
    this.projectBookRoute = bookId;
  }

  private setupDefaultProjectData(user: UserInfo): void {
    this.realtimeService.addSnapshots<SFProject>(SFProjectDoc.COLLECTION, [
      {
        id: 'project01',
        data: this.testProject
      }
    ]);
    when(mockedProjectService.get(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id)
    );

    this.realtimeService.addSnapshots<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, [
      {
        id: getSFProjectUserConfigDocId('project01', ADMIN_USER.id),
        data: this.adminProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId('project01', CHECKER_USER.id),
        data: this.checkerProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId('project01', CLEAN_CHECKER_USER.id),
        data: this.cleanCheckerProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId('project01', OBSERVER_USER.id),
        data: this.observerProjectUserConfig
      }
    ]);
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((id, userId) =>
      this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId))
    );

    this.realtimeService.addSnapshots<TextData>(TextDoc.COLLECTION, [
      {
        id: getTextDocId('project01', 43, 1),
        data: this.createTextDataForChapter(1),
        type: RichText.type.name
      },
      {
        id: getTextDocId('project01', 43, 2),
        data: this.createTextDataForChapter(2),
        type: RichText.type.name
      },
      {
        id: getTextDocId('project01', 40, 1),
        data: this.createTextDataForChapter(1),
        type: RichText.type.name
      }
    ]);
    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );

    const date = new Date();
    date.setDate(date.getDate() - 1);
    const dateCreated = date.toJSON();
    let questions: Partial<Snapshot<Question>>[] = [];
    const johnQuestions: Partial<Snapshot<Question>>[] = [];
    const matthewQuestions: Partial<Snapshot<Question>>[] = [];
    for (let questionNumber = 1; questionNumber <= 14; questionNumber++) {
      johnQuestions.push({
        id: getQuestionDocId('project01', `q${questionNumber}Id`),
        data: {
          dataId: 'q' + questionNumber + 'Id',
          ownerRef: ADMIN_USER.id,
          projectRef: 'project01',
          text: 'Book 1, Q' + questionNumber + ' text',
          verseRef: { bookNum: 43, chapterNum: 1, verseNum: 1, verse: '1-2' },
          answers: [],
          isArchived: false,
          dateCreated: dateCreated,
          dateModified: dateCreated
        }
      });
    }
    johnQuestions.push({
      id: getQuestionDocId('project01', 'q15Id'),
      data: {
        dataId: 'q15Id',
        ownerRef: ADMIN_USER.id,
        projectRef: 'project01',
        text: 'Question relating to chapter 2',
        verseRef: { bookNum: 43, chapterNum: 2, verseNum: 1, verse: '1-2' },
        answers: [],
        audioUrl: 'audioFile.mp3',
        isArchived: false,
        dateCreated: dateCreated,
        dateModified: dateCreated
      }
    });
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
        dateCreated: dateCreated,
        dateModified: dateCreated
      }
    });
    johnQuestions[3].data!.verseRef.verse = '3-4';
    johnQuestions[5].data!.answers.push({
      dataId: 'a6Id',
      ownerRef: CHECKER_USER.id,
      text: 'Answer 6 on question',
      verseRef: { chapterNum: 1, verseNum: 1, bookNum: 43 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: dateCreated,
      dateModified: dateCreated,
      audioUrl: '/audio.mp3',
      comments: []
    });

    const a7Comments: Comment[] = [];
    for (let commentNumber = 1; commentNumber <= 3; commentNumber++) {
      a7Comments.push({
        dataId: 'c' + commentNumber + 'Id',
        ownerRef: ADMIN_USER.id,
        text: 'Comment ' + commentNumber + ' on question 7',
        dateCreated: dateCreated,
        dateModified: dateCreated
      });
    }
    johnQuestions[6].data!.answers.push({
      dataId: 'a7Id',
      ownerRef: ADMIN_USER.id,
      text: 'Answer 7 on question',
      likes: [],
      dateCreated: dateCreated,
      dateModified: dateCreated,
      comments: a7Comments
    });

    const a8Comments: Comment[] = [];
    for (let commentNumber = 1; commentNumber <= 4; commentNumber++) {
      a8Comments.push({
        dataId: 'c' + commentNumber + 'Id',
        ownerRef: CHECKER_USER.id,
        text: 'Comment ' + commentNumber + ' on question 8',
        dateCreated: dateCreated,
        dateModified: dateCreated
      });
    }
    johnQuestions[7].data!.answers.push({
      dataId: 'a8Id',
      ownerRef: ADMIN_USER.id,
      text: 'Answer 8 on question',
      likes: [],
      dateCreated: dateCreated,
      dateModified: dateCreated,
      comments: a8Comments
    });
    johnQuestions[8].data!.answers.push({
      dataId: 'a0Id',
      ownerRef: CHECKER_USER.id,
      text: 'Answer 0 on question',
      verseRef: { chapterNum: 1, verseNum: 1, bookNum: 43 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: dateCreated,
      dateModified: dateCreated,
      audioUrl: '/audio.mp3',
      comments: []
    });
    johnQuestions[8].data!.answers.push({
      dataId: 'a1Id',
      ownerRef: CLEAN_CHECKER_USER.id,
      text: 'Answer 1 on question',
      verseRef: { chapterNum: 1, verseNum: 1, bookNum: 43 },
      scriptureText: 'Quoted scripture',
      likes: [],
      dateCreated: dateCreated,
      dateModified: dateCreated,
      audioUrl: '/audio.mp3',
      comments: []
    });

    if (this.projectBookRoute === 'JHN') {
      questions = johnQuestions;
    } else if (this.projectBookRoute === 'ALL') {
      questions = johnQuestions.concat(matthewQuestions);
    }
    this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, questions);
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01', bookId: this.projectBookRoute }));
    when(
      mockedProjectService.queryQuestions(
        'project01',
        deepEqual({
          bookNum: this.projectBookRoute === 'ALL' ? undefined : Canon.bookIdToNumber(this.projectBookRoute),
          sort: true
        })
      )
    ).thenCall(() =>
      this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {
        [obj<Question>().pathStr(q => q.isArchived)]: false,
        // Sort questions in order from oldest to newest
        $sort: { [obj<Question>().pathStr(q => q.dateCreated)]: 1 }
      })
    );
    when(mockedProjectService.createQuestion('project01', anything())).thenCall((id: string, question: Question) => {
      return this.realtimeService.create(QuestionDoc.COLLECTION, getQuestionDocId(id, question.dataId), question);
    });
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
      }
    ]);
    when(mockedUserService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(UserProfileDoc.COLLECTION, id)
    );

    when(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).thenReturn(instance(this.mockedAnsweredDialogRef));
    when(mockedMdcDialog.open(TextChooserDialogComponent, anything())).thenReturn(
      instance(this.mockedTextChooserDialogComponent)
    );
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
}
