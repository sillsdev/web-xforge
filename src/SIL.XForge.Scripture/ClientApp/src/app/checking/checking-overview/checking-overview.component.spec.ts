import { Location } from '@angular/common';
import { DebugElement, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatExpansionPanel } from '@angular/material/expansion';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ngfModule } from 'angular-file';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import {
  getQuestionDocId,
  Question,
  QUESTIONS_COLLECTION
} from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { of } from 'rxjs';
import { anything, mock, resetCalls, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { FETCH_WITHOUT_SUBSCRIBE } from 'xforge-common/models/realtime-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ChapterAudioDialogService } from '../chapter-audio-dialog/chapter-audio-dialog.service';
import { CheckingModule } from '../checking.module';
import { CheckingQuestionsService } from '../checking/checking-questions.service';
import { ImportQuestionsDialogComponent } from '../import-questions-dialog/import-questions-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
import { CheckingOverviewComponent } from './checking-overview.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedDialogService = mock(DialogService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedQuestionsService = mock(CheckingQuestionsService);
const mockedUserService = mock(UserService);
const mockedQuestionDialogService = mock(QuestionDialogService);
const mockedChapterAudioDialogService = mock(ChapterAudioDialogService);

describe('CheckingOverviewComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestOnlineStatusModule.forRoot(), TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: CheckingQuestionsService, useMock: mockedQuestionsService },
      { provide: UserService, useMock: mockedUserService },
      { provide: QuestionDialogService, useMock: mockedQuestionDialogService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ChapterAudioDialogService, useMock: mockedChapterAudioDialogService }
    ]
  }));

  describe('Add Question', () => {
    it('should display "No question" message', fakeAsync(() => {
      const env = new TestEnvironment(false);
      env.fixture.detectChanges();
      expect(env.loadingQuestionsLabel).not.toBeNull();
      expect(env.noQuestionsLabel).toBeNull();
      env.waitForQuestions();
      expect(env.loadingQuestionsLabel).toBeNull();
      expect(env.noQuestionsLabel).not.toBeNull();
    }));

    it('should not display loading if user is offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.testOnlineStatusService.setIsOnline(false);
      tick();
      env.fixture.detectChanges();
      expect(env.loadingQuestionsLabel).toBeNull();
      expect(env.noQuestionsLabel).not.toBeNull();
      env.waitForQuestions();
    }));

    it('should not display "Add question" button for community checker', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.checkerUser);
      env.waitForQuestions();
      expect(env.addQuestionButton).toBeNull();
    }));

    it('should display "Add question" button for project admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.adminUser);
      env.waitForQuestions();
      expect(env.addQuestionButton).not.toBeNull();
    }));

    it('should display "Add question" button for translator with questions permission', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.translatorUser);
      env.waitForQuestions();
      expect(env.addQuestionButton).not.toBeNull();
    }));

    it('should not display "Add question" button when loading', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.addQuestionButton).toBeNull();
      env.waitForQuestions();
      expect(env.addQuestionButton).not.toBeNull();
    }));

    it('should open dialog when "Add question" button is clicked', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      env.clickElement(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect().nothing();
    }));

    it('should show new question after adding', fakeAsync(() => {
      const env = new TestEnvironment();
      const dateNow = new Date();
      const newQuestion: Question = {
        dataId: 'newQId1',
        ownerRef: env.adminUser.id,
        projectRef: 'project01',
        text: 'Admin just added a question.',
        answers: [],
        verseRef: { bookNum: 42, chapterNum: 1, verseNum: 10, verse: '10-11' },
        isArchived: false,
        dateCreated: dateNow.toJSON(),
        dateModified: dateNow.toJSON()
      };

      when(mockedQuestionDialogService.questionDialog(anything())).thenCall(() => env.addQuestion(newQuestion));

      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);

      // Click on Luke and then Luke 1
      env.clickExpanderAtRow(1);
      env.clickExpanderAtRow(2);
      expect(env.questionEditButtons.length).toEqual(1);

      env.clickElement(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(5); // Matthew, Luke, Luke 1, Question 1, Question 2
      expect(env.questionEditButtons.length).toEqual(2);
    }));

    it('should show new question after local change', fakeAsync(async () => {
      const env = new TestEnvironment();
      env.waitForQuestions();

      const dateNow = new Date();
      const newQuestion: Question = {
        dataId: 'newQId1',
        ownerRef: env.adminUser.id,
        projectRef: 'project01',
        text: 'Admin just added a question.',
        answers: [],
        verseRef: { bookNum: 42, chapterNum: 1, verseNum: 10, verse: '10-11' },
        isArchived: false,
        dateCreated: dateNow.toJSON(),
        dateModified: dateNow.toJSON()
      };

      //project01:LUK:1:target
      const numQuestions = env.component.getQuestionDocs(new TextDocId('project01', 42, 1)).length;

      env.addQuestion(newQuestion);
      await env.realtimeService.updateQueriesLocal();
      env.waitForProjectDocChanges();

      expect(env.component.getQuestionDocs(new TextDocId('project01', 42, 1)).length).toEqual(numQuestions + 1);
    }));

    it('should show question in canonical order', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      // Click on Matthew and then Matthew 1
      env.clickExpanderAtRow(0);
      env.clickExpanderAtRow(1);
      expect(env.textRows[2].nativeElement.textContent).toContain('v3');
      expect(env.textRows[3].nativeElement.textContent).toContain('v4');
    }));

    it('should show new question after adding to a project with no questions', fakeAsync(() => {
      const env = new TestEnvironment(false);
      const dateNow = new Date();
      const newQuestion: Question = {
        dataId: 'newQId1',
        ownerRef: env.adminUser.id,
        projectRef: 'project01',
        text: 'Admin just added a question.',
        answers: [],
        verseRef: { bookNum: 42, chapterNum: 1, verseNum: 10, verse: '10-11' },
        isArchived: false,
        dateCreated: dateNow.toJSON(),
        dateModified: dateNow.toJSON()
      };

      when(mockedQuestionDialogService.questionDialog(anything())).thenCall(() => env.addQuestion(newQuestion));
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(0);
      env.clickElement(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(1);
      env.clickExpanderAtRow(0);
      env.clickExpanderAtRow(1);
      expect(env.textRows.length).toEqual(3);
    }));
  });

  describe('Edit Question', () => {
    it('should expand/collapse questions in book text', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.questionEditButtons.length).toEqual(0);
      expect(env.component.questionCount(id.bookNum, id.chapterNum)).toBeGreaterThan(0);

      env.clickExpanderAtRow(0);
      expect(env.textRows.length).toEqual(3);
      env.clickExpanderAtRow(1);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);

      env.clickExpanderAtRow(1);
      expect(env.textRows.length).toEqual(3);
      expect(env.questionEditButtons.length).toEqual(0);
      env.clickExpanderAtRow(0);
      expect(env.textRows.length).toEqual(2);
    }));

    it('should open a dialog to edit a question', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      env.clickExpanderAtRow(0);
      env.clickExpanderAtRow(1);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);

      resetCalls(mockedProjectService);
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
    }));

    it('should bring up question dialog only if user confirms question answered dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      env.clickExpanderAtRow(0);
      env.clickExpanderAtRow(1);
      // Edit a question with no answers
      env.clickElement(env.questionEditButtons[3]);
      verify(mockedDialogService.confirm(anything(), anything())).never();
      resetCalls(mockedDialogService);
      when(mockedDialogService.confirm(anything(), anything())).thenResolve(false);
      // Edit a question with answers
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedDialogService.confirm(anything(), anything())).once();

      resetCalls(mockedQuestionDialogService);
      resetCalls(mockedDialogService);

      when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedDialogService.confirm(anything(), anything())).once();
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      expect().nothing();
    }));
  });

  describe('Import Questions', () => {
    it('should open a dialog to import questions', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      env.clickElement(env.importButton);
      verify(mockedDialogService.openMatDialog(ImportQuestionsDialogComponent, anything())).once();
      expect().nothing();
    }));

    it('should not show import questions button until list of texts have loaded', fakeAsync(() => {
      const env = new TestEnvironment();
      const delayPromise = new Promise<void>(resolve => setTimeout(resolve, 10 * 1000));
      when(mockedQuestionsService.queryQuestions(anything(), anything(), anything())).thenReturn(
        delayPromise.then(() => env.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {}, noopDestroyRef))
      );

      env.waitForQuestions();
      expect(env.component.showImportButton).toBe(false);
      tick(11 * 1000);
      env.waitForQuestions();
      expect(env.component.showImportButton).toBe(true);
      expect(env.importButton).not.toBeNull();
    }));
  });

  describe('for Reviewer', () => {
    it('should display "No question" message', fakeAsync(() => {
      const env = new TestEnvironment(false);
      env.setCurrentUser(env.checkerUser);
      env.fixture.detectChanges();
      expect(env.loadingQuestionsLabel).not.toBeNull();
      expect(env.noQuestionsLabel).toBeNull();
      env.waitForQuestions();
      expect(env.loadingQuestionsLabel).toBeNull();
      expect(env.noQuestionsLabel).not.toBeNull();
    }));

    it('should not display progress for project admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.adminUser);
      env.waitForQuestions();
      expect(env.overallProgressChart).toBeNull();
      expect(env.reviewerQuestionPanel).toBeNull();
    }));

    it('should display progress', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.checkerUser);
      env.waitForQuestions();
      expect(env.overallProgressChart).not.toBeNull();
      expect(env.reviewerQuestionPanel).not.toBeNull();
    }));

    it('should calculate the right progress proportions and stats', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.checkerUser);
      env.waitForQuestions();
      const [unread, read, answered] = env.component.bookProgress({
        bookNum: 40,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 3, isValid: true, permissions: {} }],
        permissions: {}
      });
      expect(unread).toBe(3);
      expect(read).toBe(2);
      expect(answered).toBe(1);
      // 1 of 7 questions of MAT is archived + 1 in LUK
      expect(env.component.allQuestionsCount).toBe(7);
      expect(env.component.myAnswerCount).toBe(1);
      expect(env.component.myCommentCount).toBe(2);
      expect(env.component.myLikeCount).toBe(3);
    }));

    it('should calculate the right stats for project admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.adminUser);
      env.waitForQuestions();
      // 1 of 7 questions of MAT is archived + 1 in LUK
      expect(env.component.allQuestionsCount).toBe(7);
      expect(env.component.myAnswerCount).toBe(3);
      expect(env.component.myCommentCount).toBe(3);
      expect(env.component.myLikeCount).toBe(4);
    }));

    it('should hide like card if see other user responses is disabled', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.checkerUser);
      env.waitForQuestions();
      expect(env.likePanel).not.toBeNull();
      env.setSeeOtherUserResponses(false);
      expect(env.likePanel).toBeNull();
      env.setSeeOtherUserResponses(true);
      expect(env.likePanel).not.toBeNull();
    }));
  });

  describe('Archive Question', () => {
    it('should display "No archived question" message', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.loadingArchivedQuestionsLabel).not.toBeNull();
      env.waitForQuestions();
      expect(env.loadingArchivedQuestionsLabel).toBeNull();
      expect(env.noArchivedQuestionsLabel).toBeNull();

      env.clickExpanderAtRow(0, true);
      env.clickExpanderAtRow(1, true);
      env.clickElement(env.questionPublishButtons[0]);
      expect(env.loadingArchivedQuestionsLabel).toBeNull();
      expect(env.noArchivedQuestionsLabel).not.toBeNull();

      discardPeriodicTasks();
    }));

    it('should not display loading if user is offline', fakeAsync(async () => {
      const env = new TestEnvironment();
      const questionDoc: QuestionDoc = env.realtimeService.get(
        QuestionDoc.COLLECTION,
        getQuestionDocId('project01', 'q7Id'),
        FETCH_WITHOUT_SUBSCRIBE
      );
      await questionDoc.submitJson0Op(op => {
        op.set(d => d.isArchived, false);
      });
      env.testOnlineStatusService.setIsOnline(false);
      env.fixture.detectChanges();
      tick();
      env.fixture.detectChanges();
      expect(env.loadingArchivedQuestionsLabel).toBeNull();
      expect(env.noArchivedQuestionsLabel).not.toBeNull();

      env.waitForQuestions();
    }));

    it('archives and republishes a question', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('1 questions');
      env.clickExpanderAtRow(0);
      env.clickExpanderAtRow(1);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionArchiveButtons.length).toEqual(9);
      env.clickElement(env.questionArchiveButtons[2]);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('2 questions');
      expect(env.textRows.length).toEqual(8);

      // Re-publish a question that has been archived
      env.clickExpanderAtRow(0, true);
      env.clickExpanderAtRow(1, true);
      const archivedQuestion: HTMLElement = env.archivedQuestionDates[0].nativeElement;
      expect(archivedQuestion.textContent).toContain('Archived on');
      env.clickElement(env.questionPublishButtons[2]);
      expect(env.textArchivedRows.length).toEqual(3);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('1 questions');
      expect(env.textRows.length).toEqual(9);

      discardPeriodicTasks();
    }));

    it('archives and republishes questions for an entire chapter or book', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();

      // VERIFY CORRECT SETUP

      // expect two books with published questions
      expect(env.textRows.length).toEqual(2);
      // expect one book with archived questions
      expect(env.textArchivedRows.length).toEqual(1);
      // expand the first book
      env.clickExpanderAtRow(0);
      // expect there is only one chapter of questions in that book (number of rows increased from 2 to 3)
      expect(env.textRows.length).toEqual(3);
      // that chapter should have 6 questions
      expect(env.getPublishedQuestionsCountTextByRow(1)).toContain('6 questions');
      // and one question has been archived already
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('1 questions');

      // ARCHIVE QUESTIONS IN A CHAPTER

      // archive questions from the only chapter of the first book
      env.clickElement(env.questionArchiveButtons[1]);
      // now there should be just one book with published questions
      expect(env.textRows.length).toEqual(1);
      // and 7 archived questions, all in one book
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('7 questions');

      // REPUBLISH QUESTIONS IN A CHAPTER

      // expand the book with archived questions
      env.clickExpanderAtRow(0, true);
      // expect 7 questions all in the one chapter
      expect(env.getArchivedQuestionsCountTextByRow(1)).toContain('7 questions');
      // republish all 7 questions in that chapter
      env.clickElement(env.questionPublishButtons[1]);
      // expect no archived questions
      expect(env.textArchivedRows.length).toEqual(0);
      // Expect 2 books with published questions.
      expect(env.textRows.length).toEqual(2);
      // with 7 questions in the first book
      expect(env.getPublishedQuestionsCountTextByRow(0)).toContain('7 questions');

      // ARCHIVE QUESTIONS ONE BOOK AT A TIME

      // archive questions in the first book
      env.clickElement(env.questionArchiveButtons[0]);
      // there should only be one book with published questions now
      expect(env.textRows.length).toEqual(1);
      // archive the one book of remaining questions
      env.clickElement(env.questionArchiveButtons[0]);
      // there should be no books with published questions now
      expect(env.textRows.length).toEqual(0);
      // Expect two books with archived questions
      expect(env.textArchivedRows.length).toEqual(2);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('7 questions');
      expect(env.getArchivedQuestionsCountTextByRow(1)).toContain('1 questions');

      // REPUBLISH QUESTIONS ONE BOOK AT A TIME

      env.clickElement(env.questionPublishButtons[0]);
      // there should now only be one book with archived questions
      expect(env.textArchivedRows.length).toEqual(1);
      // republish the last remaining book
      env.clickElement(env.questionPublishButtons[0]);
      // there should now be no books with archived questions
      expect(env.textArchivedRows.length).toEqual(0);
      // and two books with published questions
      expect(env.textRows.length).toEqual(2);
      expect(env.getPublishedQuestionsCountTextByRow(0)).toContain('7 questions');
      expect(env.getPublishedQuestionsCountTextByRow(1)).toContain('1 questions');

      discardPeriodicTasks();
    }));
  });

  describe('Chapter Audio', () => {
    it('show audio icon on chapter heading', fakeAsync(() => {
      const env = new TestEnvironment(true, true);
      env.waitForQuestions();

      env.clickExpanderAtRow(2);
      expect(env.checkChapterHasAudio(3)).toBeTrue();
    }));

    it('chapter with audio has heading visible when no questions ', fakeAsync(() => {
      const env = new TestEnvironment(true, true);
      env.waitForQuestions();
      const johnIndex = 2;
      const johnChapter1Index = 3;

      env.clickExpanderAtRow(johnIndex);
      env.clickExpanderAtRow(johnChapter1Index);
      expect(env.questionEditButtons.length).toEqual(1);

      // Archive questions in John
      env.clickElement(env.questionArchiveButtons[johnIndex]);

      // Chapter should still be visible as it has audio
      expect(env.questionEditButtons.length).toEqual(0);
      expect(env.checkChapterHasAudio(johnChapter1Index)).toBeTrue();

      discardPeriodicTasks();
    }));

    it('click chapter with audio and no questions should not open panel ', fakeAsync(() => {
      const env = new TestEnvironment(true, true);
      env.waitForQuestions();
      const johnIndex = 2;
      const johnChapter2Index = 4;

      env.clickExpanderAtRow(johnIndex);
      expect(env.checkChapterHasAudio(johnChapter2Index)).toBeTrue();
      expect(env.checkRowIsExpanded(johnChapter2Index)).toBeFalse();
      env.clickExpanderAtRow(johnChapter2Index);
      expect(env.checkRowIsExpanded(johnChapter2Index)).toBeFalse();
    }));

    it('hide archive questions on book when only audio is available ', fakeAsync(() => {
      const env = new TestEnvironment(true, true);
      env.waitForQuestions();
      const johnIndex = 2;

      expect(env.questionArchiveButtons[johnIndex]).toBeDefined();
      expect(env.textRows.length).toBe(3);

      // Archive button should disappear but all rows remain visible
      env.clickElement(env.questionArchiveButtons[johnIndex]);
      expect(env.questionArchiveButtons[johnIndex]).toBeNull();
      expect(env.textRows.length).toBe(3);

      discardPeriodicTasks();
    }));
  });

  it('should handle question in a book that does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.addQuestion({
      dataId: 'qMissingBook',
      projectRef: 'project01',
      ownerRef: env.adminUser.id,
      text: 'In missing book',
      verseRef: {
        bookNum: 41,
        chapterNum: 1,
        verseNum: 1
      },
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
    env.waitForQuestions();
    expect(env.component.questionCount(41, 1)).toEqual(0);
  }));
});

@NgModule({
  imports: [NoopAnimationsModule, ngfModule, CheckingModule]
})
class DialogTestModule {}

interface UserInfo {
  id: string;
  user: User;
  role: string;
}

class TestEnvironment {
  component: CheckingOverviewComponent;
  fixture: ComponentFixture<CheckingOverviewComponent>;
  location: Location;

  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  adminUser = this.createUser(1, SFProjectRole.ParatextAdministrator);
  checkerUser = this.createUser(2, SFProjectRole.CommunityChecker);
  translatorUser = this.createUser(3, SFProjectRole.ParatextTranslator);

  private adminProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: this.adminUser.id,
    isTargetTextRight: true
  });

  private reviewerProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: this.checkerUser.id,
    isTargetTextRight: true,
    questionRefsRead: ['q1Id', 'q2Id', 'q3Id']
  });
  private translatorProjectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: 'project01',
    ownerRef: this.translatorUser.id,
    isTargetTextRight: true
  });
  private testProject: SFProjectProfile = createTestProjectProfile({
    texts: [
      {
        bookNum: 40,
        hasSource: false,
        chapters: [
          { number: 1, lastVerse: 25, isValid: true, permissions: {} },
          { number: 3, lastVerse: 17, isValid: true, permissions: {} }
        ],
        permissions: {}
      },
      {
        bookNum: 42,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 80, isValid: true, permissions: {} }],
        permissions: {}
      }
    ],
    userRoles: {
      [this.adminUser.id]: this.adminUser.role,
      [this.checkerUser.id]: this.checkerUser.role,
      [this.translatorUser.id]: this.translatorUser.role
    },
    userPermissions: {
      [this.translatorUser.id]: [
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Edit)
      ]
    }
  });

  private readonly anotherUserId = 'anotherUserId';

  constructor(withQuestionData: boolean = true, withChapterAudioData: boolean = false) {
    if (withQuestionData) {
      // Question 2 deliberately before question 1 to test sorting
      this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, [
        {
          id: getQuestionDocId('project01', 'q2Id'),
          data: {
            dataId: 'q2Id',
            projectRef: 'project01',
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q2 text',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 4
            },
            answers: [
              {
                dataId: 'a2Id',
                ownerRef: this.anotherUserId,
                likes: [{ ownerRef: this.checkerUser.id }],
                dateCreated: '',
                dateModified: '',
                deleted: false,
                comments: [
                  {
                    dataId: 'c2Id',
                    ownerRef: this.checkerUser.id,
                    dateCreated: '',
                    dateModified: '',
                    deleted: false
                  }
                ]
              }
            ],
            isArchived: false,
            dateModified: '',
            dateCreated: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q1Id'),
          data: {
            dataId: 'q1Id',
            projectRef: 'project01',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 3
            },
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q1 text',
            answers: [
              {
                dataId: 'a1Id',
                ownerRef: this.checkerUser.id,
                likes: [{ ownerRef: this.checkerUser.id }, { ownerRef: this.anotherUserId }],
                dateCreated: '',
                dateModified: '',
                deleted: false,
                comments: [
                  {
                    dataId: 'c1Id',
                    ownerRef: this.checkerUser.id,
                    dateCreated: '',
                    dateModified: '',
                    deleted: false
                  }
                ]
              }
            ],
            audioUrl: '/audio.mp3',
            isArchived: false,
            dateCreated: '',
            dateModified: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q3Id'),
          data: {
            dataId: 'q3Id',
            projectRef: 'project01',
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q3 text',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 5
            },
            answers: [
              {
                dataId: 'a3Id',
                ownerRef: this.anotherUserId,
                likes: [{ ownerRef: this.checkerUser.id }],
                dateCreated: '',
                dateModified: '',
                deleted: false,
                comments: [
                  {
                    dataId: 'c3Id',
                    ownerRef: this.anotherUserId,
                    dateCreated: '',
                    dateModified: '',
                    deleted: false
                  }
                ]
              }
            ],
            isArchived: false,
            dateCreated: '',
            dateModified: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q4Id'),
          data: {
            dataId: 'q4Id',
            projectRef: 'project01',
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q4 text',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 6
            },
            answers: [],
            isArchived: false,
            dateCreated: '',
            dateModified: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q5Id'),
          data: {
            dataId: 'q5Id',
            projectRef: 'project01',
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q5 text',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 7
            },
            answers: [],
            isArchived: false,
            dateCreated: '',
            dateModified: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q6Id'),
          data: {
            dataId: 'q6Id',
            projectRef: 'project01',
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q6 text',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 8
            },
            answers: [],
            isArchived: false,
            dateCreated: '',
            dateModified: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q7Id'),
          data: {
            dataId: 'q7Id',
            projectRef: 'project01',
            ownerRef: this.adminUser.id,
            text: 'Book 1, Q7 text',
            verseRef: {
              bookNum: 40,
              chapterNum: 1,
              verseNum: 9
            },
            answers: [],
            isArchived: true,
            dateCreated: '',
            dateModified: ''
          }
        },
        {
          id: getQuestionDocId('project01', 'q8Id'),
          data: {
            dataId: 'q8Id',
            projectRef: 'project01',
            ownerRef: this.anotherUserId,
            text: 'Book 2, Q3 text',
            verseRef: {
              bookNum: 42,
              chapterNum: 1,
              verseNum: 1
            },
            answers: [],
            isArchived: false,
            dateCreated: '',
            dateModified: ''
          }
        }
      ]);
    }
    this.realtimeService.addSnapshots<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, [
      {
        id: 'project01',
        data: this.testProject
      }
    ]);
    this.realtimeService.addSnapshots<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, [
      {
        id: getSFProjectUserConfigDocId('project01', this.adminUser.id),
        data: this.adminProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId('project01', this.checkerUser.id),
        data: this.reviewerProjectUserConfig
      },
      {
        id: getSFProjectUserConfigDocId('project01', this.translatorUser.id),
        data: this.translatorProjectUserConfig
      }
    ]);
    if (withChapterAudioData) {
      this.addChapterAudio();
    }

    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedQuestionDialogService.questionDialog(anything())).thenResolve();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    when(mockedProjectService.subscribeProfile(anything(), anything())).thenCall((id, subscription) =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id, subscription)
    );
    when(mockedProjectService.getUserConfig(anything(), anything(), anything())).thenCall((id, userId, subscriber) =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId(id, userId),
        subscriber
      )
    );
    when(mockedQuestionsService.queryQuestions('project01', anything(), anything())).thenCall(() =>
      this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {}, noopDestroyRef)
    );
    when(mockedProjectService.onlineDeleteAudioTimingData(anything(), anything(), anything())).thenCall(
      (projectId, book, chapter) => {
        const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(
          SFProjectProfileDoc.COLLECTION,
          projectId,
          FETCH_WITHOUT_SUBSCRIBE
        );
        const textIndex: number = projectDoc.data!.texts.findIndex(t => t.bookNum === book);
        const chapterIndex: number = projectDoc.data!.texts[textIndex].chapters.findIndex(c => c.number === chapter);
        projectDoc.submitJson0Op(op => op.set(p => p.texts[textIndex].chapters[chapterIndex].hasAudio, false), false);
      }
    );
    this.setCurrentUser(this.adminUser);
    this.testOnlineStatusService.setIsOnline(true);

    this.fixture = TestBed.createComponent(CheckingOverviewComponent);
    this.component = this.fixture.componentInstance;
    this.location = TestBed.inject(Location);
  }

  get addQuestionButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.add-question-button'));
  }

  get archivedQuestions(): DebugElement {
    return this.fixture.debugElement.query(By.css('#text-with-archived-questions'));
  }

  get audioAddButtons(): DebugElement[] {
    const ret: DebugElement[] = [];
    this.textRows.forEach(e => ret.push(e.query(By.css('.add-audio-btn'))));
    return ret;
  }

  get audioDeleteButtons(): DebugElement[] {
    const ret: DebugElement[] = [];
    this.textRows.forEach(e => ret.push(e.query(By.css('.delete-audio-btn'))));
    return ret;
  }

  get audioEditButtons(): DebugElement[] {
    const ret: DebugElement[] = [];
    this.textRows.forEach(e => ret.push(e.query(By.css('.edit-audio-btn'))));
    return ret;
  }

  get importButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#import-btn'));
  }

  get loadingQuestionsLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#loading-questions-message'));
  }

  get noQuestionsLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#no-questions-label'));
  }

  get textRows(): DebugElement[] {
    return this.rowsByList('#text-with-questions-list');
  }

  get textArchivedRows(): DebugElement[] {
    return this.rowsByList('#text-with-archived-questions');
  }

  rowsByList(listId: string): DebugElement[] {
    const rowsShown: DebugElement[] = [];
    const list = this.fixture.debugElement.query(By.css(listId));
    for (const book of list.queryAll(By.css('mat-expansion-panel.book-expander'))) {
      rowsShown.push(book);
      const bookExpander = book.componentInstance as MatExpansionPanel;
      if (bookExpander.expanded) {
        const chapters = book.queryAll(By.css('mat-expansion-panel'));
        for (const chapter of chapters) {
          rowsShown.push(chapter);
          const chapterExpander = chapter.componentInstance as MatExpansionPanel;
          if (chapterExpander.expanded) {
            const questions = chapter.queryAll(By.css('mat-list-item'));
            for (const question of questions) {
              rowsShown.push(question);
            }
          }
        }
      }
    }
    return rowsShown;
  }

  get questionEditButtons(): DebugElement[] {
    const ret: DebugElement[] = [];
    this.textRows.filter(By.css('mat-list-item')).forEach(e => ret.push(e.query(By.css('.edit-btn'))));
    return ret;
  }

  get questionArchiveButtons(): DebugElement[] {
    const ret: DebugElement[] = [];
    this.textRows.forEach(e => ret.push(e.query(By.css('.archive-btn'))));
    return ret;
  }

  get questionPublishButtons(): DebugElement[] {
    const ret: DebugElement[] = [];
    this.textArchivedRows.forEach(e => ret.push(e.query(By.css('.publish-btn'))));
    return ret;
  }

  get loadingArchivedQuestionsLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#loading-archived-questions-message'));
  }

  get noArchivedQuestionsLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#no-archived-questions-label'));
  }

  get archivedQuestionDates(): DebugElement[] {
    return this.archivedQuestions.queryAll(By.css('mat-list-item .date-archived'));
  }

  get overallProgressChart(): DebugElement {
    return this.fixture.debugElement.query(By.css('#overall-progress-chart'));
  }

  get reviewerQuestionPanel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#reviewer-question-panel'));
  }

  get likePanel(): DebugElement {
    return this.fixture.debugElement.query(By.css('.reviewer-panels .card-content-like'));
  }

  set onlineStatus(isOnline: boolean) {
    this.testOnlineStatusService.setIsOnline(isOnline);
    tick();
    this.fixture.detectChanges();
  }

  get warningSomeActionsUnavailableOffline(): DebugElement {
    return this.fetchElement('#warning-some-actions-unavailable-offline');
  }

  fetchElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }

  checkChapterHasAudio(row: number): boolean {
    return this.getChapterHeadingByRow(row).query(By.css('mat-icon')) != null;
  }

  checkRowIsExpanded(row: number): boolean {
    return this.textRows[row].query(By.css('mat-expansion-panel-header[aria-expanded=true]')) != null;
  }

  getPublishedQuestionsCountTextByRow(row: number): string {
    return this.textRows[row].query(By.css('.questions-count')).nativeElement.textContent;
  }

  getArchivedQuestionsCountTextByRow(row: number): string {
    return this.textArchivedRows[row].query(By.css('.archived-questions-count')).nativeElement.textContent;
  }

  getChapterHeadingByRow(row: number): DebugElement {
    return this.textRows[row].query(By.css('.book-chapter-heading'));
  }

  waitForQuestions(): void {
    this.realtimeService.updateQueryAdaptersRemote();
    this.fixture.detectChanges();
    this.waitForProjectDocChanges();
  }

  setSeeOtherUserResponses(isEnabled: boolean): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(
      SFProjectProfileDoc.COLLECTION,
      'project01',
      FETCH_WITHOUT_SUBSCRIBE
    );
    projectDoc.submitJson0Op(
      op => op.set<boolean>(p => p.checkingConfig.usersSeeEachOthersResponses, isEnabled),
      false
    );
    this.waitForProjectDocChanges();
  }

  setCheckingEnabled(isEnabled: boolean): void {
    this.ngZone.run(() => {
      const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(
        SFProjectProfileDoc.COLLECTION,
        'project01',
        FETCH_WITHOUT_SUBSCRIBE
      );
      projectDoc.submitJson0Op(op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, isEnabled), false);
    });
    this.waitForProjectDocChanges();
  }

  waitForProjectDocChanges(): void {
    // Project doc changes are throttled by 1000 ms, so we have to wait for them.
    // After 1000 ms of waiting, the project changes will be emitted, and then the async scheduler will set a 1000 ms
    // timeout before emitting changes again. That 1000 ms timeout will get left in the queue, but if we wait past that
    // time, we don't have to do discardPeriodicTasks() to flush the queue.
    tick(2000);
    this.fixture.detectChanges();
  }

  clickExpanderAtRow(rowIndex: number, fromArchives?: boolean): void {
    let panel: MatExpansionPanel;
    if (fromArchives) {
      panel = this.textArchivedRows[rowIndex].componentInstance;
    } else {
      panel = this.textRows[rowIndex].componentInstance;
    }
    if (!panel.disabled) {
      panel.toggle();
    }
    this.fixture.detectChanges();
    flush();
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = element.nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    flush();
    this.fixture.detectChanges();
  }

  setCurrentUser(currentUser: UserInfo): void {
    when(mockedUserService.currentUserId).thenReturn(currentUser.id);
  }

  addQuestion(question: Question): void {
    this.realtimeService.addSnapshot<Question>(QUESTIONS_COLLECTION, {
      id: getQuestionDocId('project01', question.dataId),
      data: question
    });
  }

  private addChapterAudio(): void {
    const text: TextInfo = {
      bookNum: 43,
      hasSource: false,
      chapters: [
        { number: 1, lastVerse: 51, isValid: true, permissions: {}, hasAudio: true },
        { number: 2, lastVerse: 25, isValid: true, permissions: {}, hasAudio: true }
      ],
      permissions: {}
    };
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(
      SFProjectProfileDoc.COLLECTION,
      'project01',
      FETCH_WITHOUT_SUBSCRIBE
    );
    const index: number = projectDoc.data!.texts.length - 1;
    projectDoc.submitJson0Op(op => op.insert(p => p.texts, index, text), false);
    this.addQuestion({
      dataId: 'q9Id',
      projectRef: 'project01',
      ownerRef: this.anotherUserId,
      text: 'Book 3, Q1 text',
      verseRef: {
        bookNum: 43,
        chapterNum: 1,
        verseNum: 1
      },
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
  }

  private createUser(idSuffix: number, role: string, nameConfirmed: boolean = true): UserInfo {
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
}
