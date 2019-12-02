import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ngfModule } from 'angular-file';
import { AngularSplitModule } from 'angular-split';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
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
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { Snapshot } from 'xforge-common/models/snapshot';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { ProjectService } from 'xforge-common/project.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { nameof, objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { TextChooserDialogComponent, TextSelection } from '../../text-chooser-dialog/text-chooser-dialog.component';
import { QuestionAnsweredDialogComponent } from '../question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
import { CheckingAnswersComponent } from './checking-answers/checking-answers.component';
import { CheckingCommentFormComponent } from './checking-answers/checking-comments/checking-comment-form/checking-comment-form.component';
import { CheckingCommentsComponent } from './checking-answers/checking-comments/checking-comments.component';
import { CheckingOwnerComponent } from './checking-answers/checking-owner/checking-owner.component';
import { CheckingAudioCombinedComponent } from './checking-audio-combined/checking-audio-combined.component';
import { AudioTimePipe, CheckingAudioPlayerComponent } from './checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder/checking-audio-recorder.component';
import { CheckingQuestionsComponent } from './checking-questions/checking-questions.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';
import { CheckingComponent } from './checking.component';
import { FontSizeComponent } from './font-size/font-size.component';

const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedMdcDialog = mock(MdcDialog);
const mockedTextChooserDialogComponent = mock(TextChooserDialogComponent);
const mockedQuestionDialogService = mock(QuestionDialogService);

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

const ADMIN_USER: UserInfo = createUser('01', SFProjectRole.ParatextAdministrator);
const CHECKER_USER: UserInfo = createUser('02', SFProjectRole.CommunityChecker);
const CLEAN_CHECKER_USER: UserInfo = createUser('03', SFProjectRole.CommunityChecker, false);
const OBSERVER_USER: UserInfo = createUser('04', SFProjectRole.ParatextObserver);

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
      RouterTestingModule,
      AvatarTestingModule,
      SharedModule,
      UICommonModule,
      TestTranslocoModule
    ],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: UserService, useMock: mockedUserService },
      { provide: ProjectService, useMock: mockedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: MdcDialog, useMock: mockedMdcDialog },
      { provide: TextChooserDialogComponent, useMock: mockedTextChooserDialogComponent },
      { provide: QuestionDialogService, useMock: mockedQuestionDialogService }
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

    it('hides add question button for reviewer', fakeAsync(() => {
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
  });

  describe('Questions', () => {
    it('questions are displaying', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      // Question 5 has been stored as the last question to start at
      expect(env.component.questionsPanel.activeQuestionDoc!.data!.dataId).toBe('q5Id');
      // A sixteenth question is archived
      expect(env.questions.length).toEqual(15);
      const question = env.selectQuestion(15);
      expect(env.getQuestionText(question)).toBe('Question relating to chapter 2');
    }));

    it('questions are displaying for all books', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER, 'ALL');
      // Question 5 has been stored as the question to start at
      expect(env.component.questionsPanel.activeQuestionDoc!.data!.dataId).toBe('q5Id');
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
      expect(question.classes['mdc-list-item--activated']).toBeTruthy();
    }));

    it('question status change to read', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      let question = env.selectQuestion(2, false);
      expect(question.classes['question-read']).toBeFalsy();
      question = env.selectQuestion(3);
      expect(question.classes['question-read']).toBeTruthy();
    }));

    it('question status change to answered', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      const question = env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(question.classes['question-answered']).toBeTruthy();
    }));

    it('question shows answers icon and total', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      const question = env.selectQuestion(6, false);
      expect(env.getUnread(question)).toEqual(1);
      tick(env.questionReadTimer);
      env.fixture.detectChanges();
      expect(env.getUnread(question)).toEqual(0);
    }));

    it('allows admin to archive a question', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(1);
      const question = env.component.answersPanel!.questionDoc!.data!;
      expect(question.isArchived).toBe(false);
      // Our mock system doesn't respond to changes to the number of published questions, we must get this manually
      expect(env.component.questionDocs.filter(q => q.data!.isArchived !== true).length).toEqual(15);
      env.clickButton(env.archiveQuestionButton);
      expect(question.isArchived).toBe(true);
      expect(env.component.questionDocs.filter(q => q.data!.isArchived !== true).length).toEqual(14);
    }));

    it('opens a dialog when edit question is clicked', fakeAsync(() => {
      const env = new TestEnvironment(ADMIN_USER);
      env.selectQuestion(1);
      env.clickButton(env.editQuestionButton);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent, anything())).never();
      verify(mockedQuestionDialogService.questionDialog(anything(), anything())).once();
      expect().nothing();
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
      verify(mockedQuestionDialogService.questionDialog(anything(), anything())).once();
      expect().nothing();
    }));

    it('unread questions badge is only visible when the setting is ON to see other answers', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      expect(env.getUnread(env.questions[6])).toEqual(4);
      env.setSeeOtherUserResponses(false);
      expect(env.getUnread(env.questions[6])).toEqual(0);
    }));

    it('responds to remote question added', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      let question = env.selectQuestion(1);
      const questionId = env.component.questionsPanel.activeQuestionDoc!.id;
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
      expect(env.component.questionsPanel.activeQuestionDoc!.id).toBe(questionId);
      expect(env.questions.length).toEqual(16);
      question = env.selectQuestion(16);
      expect(env.getQuestionText(question)).toBe('Admin just added a question.');
    }));
  });

  describe('Answers', () => {
    it('answer panel is initiated and shows the first question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      expect(env.answerPanel).toBeDefined();
    }));

    it('can answer a question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answer question 2');
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
      verify(mockedProjectService.trainSelectedSegment(anything())).once();
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q5Id');
      env.selectQuestion(4);
      expect(projectUserConfigDoc.selectedTask).toBe('checking');
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q4Id');
      expect(projectUserConfigDoc.selectedBookNum).toBe(43);
      verify(mockedProjectService.trainSelectedSegment(anything())).twice();
    }));

    it('saves the last visited question in all question context', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER, 'ALL');
      const projectUserConfigDoc = env.component.projectUserConfigDoc!.data!;
      verify(mockedProjectService.trainSelectedSegment(anything())).once();
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q5Id');
      env.selectQuestion(4);
      expect(projectUserConfigDoc.selectedTask).toBe('checking');
      expect(projectUserConfigDoc.selectedQuestionRef).toBe('project01:q4Id');
      expect(projectUserConfigDoc.selectedBookNum).toBeUndefined();
      verify(mockedProjectService.trainSelectedSegment(anything())).twice();
    }));

    it('can cancel answering a question', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).toBeDefined();
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).toBeNull();
      expect(env.addAnswerButton).toBeDefined();
    }));

    it('can change answering tabs', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      env.clickButton(env.audioTab);
      expect(env.recordButton).toBeDefined();
    }));

    it('check answering validation', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField.classes['mdc-text-field--invalid']).toBeTruthy();
    }));

    it('can edit a new answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      env.answerQuestion('Answer question 7');
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
      env.clickButton(env.getAnswerEditButton(myAnswerIndex));
      env.setTextFieldValue(env.yourAnswerField, 'Edited question 7 answer');
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
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
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(false);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false, 'have already read this answer');

      // Edit, save
      env.clickButton(env.getAnswerEditButton(myAnswerIndex));
      env.setTextFieldValue(env.yourAnswerField, 'Edited answer');
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
      expect(env.getAnswerText(myAnswerIndex)).toEqual('Edited answer');

      // Edit, cancel
      env.clickButton(env.getAnswerEditButton(myAnswerIndex));
      env.setTextFieldValue(env.yourAnswerField, 'Different edit, to cancel');
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(
        false,
        'dont spotlight own answer on cancelled edit'
      );
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
      expect(env.getAnswerText(myAnswerIndex)).toEqual('Edited answer', 'should not have been changed');
    }));

    it('still shows answers as read after canceling an edit', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(7);
      env.answerQuestion('Answer question 7');
      const myAnswerIndex = 0;
      const otherAnswerIndex = 1;
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(true);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
      env.clickButton(env.getAnswerEditButton(0));
      env.setTextFieldValue(env.yourAnswerField, 'Edited question 7 answer');
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswer(myAnswerIndex).classes['attention']).toBe(false);
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
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
      expect(env.getAnswer(otherAnswerIndex).classes['attention']).toBe(false);
    }));

    it('can remove audio from answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(6);
      env.clickButton(env.getAnswerEditButton(0));
      env.waitForSliderUpdate();
      env.clickButton(env.audioTab);
      env.clickButton(env.removeAudioButton);
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      verify(mockedProjectService.onlineDeleteAudio('project01', 'a6Id', CHECKER_USER.id)).once();
      expect().nothing();
    }));

    it('can delete an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(6);
      expect(env.answers.length).toEqual(1);
      env.clickButton(env.answerDeleteButton(0));
      env.waitForSliderUpdate();
      expect(env.answers.length).toEqual(0);
      verify(mockedProjectService.onlineDeleteAudio('project01', 'a6Id', CHECKER_USER.id)).once();
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
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      expect(env.getUnread(env.questions[6])).toEqual(4);
      env.answerQuestion('Answer from checker');
      expect(env.answers.length).toBe(2);
      expect(env.getUnread(env.questions[6])).toEqual(0);
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
      expect(env.scriptureText).toBe('The selected text (JHN 2:2-5)');
      env.clickButton(env.saveAnswerButton);
      expect(env.getAnswerScriptureText(0)).toBe('The selected text(JHN 2:2-5)');
    }));

    it('can remove scripture from an answer', fakeAsync(() => {
      const env = new TestEnvironment(CHECKER_USER);
      env.selectQuestion(6);
      expect(env.getAnswerScriptureText(0)).toBe('Quoted scripture(JHN 1:1)');
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
      expect(env.totalAnswersMessageCount).toEqual(3);

      // But a show-unread-answers control appears.
      expect(env.showUnreadAnswersButton).not.toBeNull();
      expect(env.unreadAnswersBannerCount).toEqual(1);

      // Clicking makes the answer appear and the control go away.
      env.clickButton(env.showUnreadAnswersButton);
      flush();
      expect(env.answers.length).toEqual(3);
      expect(env.component.answersPanel!.answers.length).toEqual(3);
      expect(env.showUnreadAnswersButton).toBeNull();
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

      // Clicking makes the answer appear and the control go away.
      env.clickButton(env.showUnreadAnswersButton);
      flush();
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

    it('new remote answers and banner dont show, if user has not yet answered the question', fakeAsync(() => {
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

    it('show-remote-answer banner disappears if the unshown remote answer is deleted', fakeAsync(() => {
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
        const date: string = new Date().toJSON();
        const comment: Comment = {
          dataId: objectId(),
          ownerRef: ADMIN_USER.id,
          text: 'Comment left by admin',
          dateCreated: date,
          dateModified: date
        };
        env.component.questionsPanel.activeQuestionDoc!.submitJson0Op(
          op => op.insert(q => q.answers[0].comments, 0, comment),
          false
        );
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toEqual(1);
        expect(env.component.projectUserConfigDoc!.data!.commentRefsRead.includes(comment.dataId)).toBe(true);
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
      env.quillEditor.querySelector('usx-segment[data-segment=verse_1_3]')!.dispatchEvent(new Event('click'));
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
      const segment = env.quillEditor.querySelector('usx-segment[data-segment=verse_1_1')!;
      expect(segment.hasAttribute('data-question-count')).toBe(true);
      expect(segment.getAttribute('data-question-count')).toBe('13');
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
  questionReadTimer: number = 2000;

  public project01WritingSystemTag = 'en';

  readonly mockedAnsweredDialogRef: MdcDialogRef<QuestionAnsweredDialogComponent> = mock(MdcDialogRef);
  readonly mockedTextChooserDialogComponent: MdcDialogRef<TextChooserDialogComponent> = mock(MdcDialogRef);
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
      translationSuggestionsEnabled: false
    },
    texts: [
      {
        bookNum: 43,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 18, isValid: true }, { number: 2, lastVerse: 25, isValid: true }]
      },
      {
        bookNum: 40,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 28, isValid: true }]
      }
    ],
    userRoles: {
      [ADMIN_USER.id]: ADMIN_USER.role,
      [CHECKER_USER.id]: CHECKER_USER.role,
      [CLEAN_CHECKER_USER.id]: CLEAN_CHECKER_USER.role,
      [OBSERVER_USER.id]: OBSERVER_USER.role
    }
  };

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor(user: UserInfo, private readonly projectBookRoute: string = 'JHN') {
    this.setupDefaultProjectData(user);
    when(mockedUserService.editDisplayName(true)).thenResolve();
    this.fixture = TestBed.createComponent(CheckingComponent);
    this.component = this.fixture.componentInstance;
    // Need to wait for questions and text promises to finish
    this.fixture.detectChanges();
    tick(1);
    this.fixture.detectChanges();
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
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
    return this.fixture.debugElement.query(By.css('#add-question-button'));
  }

  get archiveQuestionButton(): DebugElement {
    return this.answerPanel.query(By.css('.archive-question-button'));
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

  get previousButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-navigation .prev-question'));
  }

  get questions(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#questions-panel .mdc-list-item'));
  }

  get quillEditor(): HTMLElement {
    return <HTMLElement>document.getElementsByClassName('ql-container')[0];
  }

  get quillEditorElement(): HTMLElement {
    return <HTMLElement>document.getElementsByTagName('quill-editor')[0];
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
    return this.fixture.debugElement.query(By.css('.answer-select-text button[primary]'));
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

  answerQuestion(answer: string): void {
    this.clickButton(this.addAnswerButton);
    this.setTextFieldValue(this.yourAnswerField, answer);
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

  getQuestionText(question: DebugElement): string {
    return question.query(By.css('.question-title')).nativeElement.textContent;
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
          audioUrl: 'file://audio.mp3',
          comments: []
        }),
      // Another user
      false
    );
    flush();
    this.fixture.detectChanges();
  }

  private setupDefaultProjectData(user: UserInfo): void {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01', bookId: this.projectBookRoute }));
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
      audioUrl: 'file://audio.mp3',
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
      audioUrl: 'file://audio.mp3',
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
      audioUrl: 'file://audio.mp3',
      comments: []
    });

    if (this.projectBookRoute === 'JHN') {
      questions = johnQuestions;
    } else if (this.projectBookRoute === 'ALL') {
      questions = johnQuestions.concat(matthewQuestions);
    }
    this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, questions);
    when(
      mockedProjectService.queryQuestions(
        'project01',
        deepEqual({
          bookNum: this.projectBookRoute === 'ALL' ? undefined : Canon.bookIdToNumber(this.projectBookRoute),
          activeOnly: true,
          sort: true
        })
      )
    ).thenCall(() =>
      this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {
        // Sort questions in order from oldest to newest
        $sort: { [nameof<Question>('dateCreated')]: 1 }
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
    return delta;
  }
}
