import { MdcDialogModule, MdcDialogRef } from '@angular-mdc/web/dialog';
import { Location } from '@angular/common';
import { DebugElement, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Route } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ngfModule } from 'angular-file';
import { CookieService } from 'ngx-cookie-service';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import {
  getQuestionDocId,
  Question,
  QUESTIONS_COLLECTION
} from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { BehaviorSubject, of } from 'rxjs';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingModule } from '../checking.module';
import { ImportQuestionsDialogComponent } from '../import-questions-dialog/import-questions-dialog.component';
import { QuestionAnsweredDialogComponent } from '../question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogComponent } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
import { CheckingOverviewComponent } from './checking-overview.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedDialogService = mock(DialogService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedAuthService = mock(AuthService);
const mockedQuestionDialogService = mock(QuestionDialogService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);

class MockComponent {}

const ROUTES: Route[] = [
  { path: 'projects/:projectId', component: MockComponent },
  { path: 'projects/:projectId/translate', component: MockComponent }
];

describe('CheckingOverviewComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, RouterTestingModule.withRoutes(ROUTES), TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: QuestionDialogService, useMock: mockedQuestionDialogService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: PwaService, useMock: mockedPwaService }
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
      env.simulateRowClick(1);
      const id = new TextDocId('project01', 42, 1);
      env.simulateRowClick(2, id);
      expect(env.questionEditButtons.length).toEqual(1);

      env.clickElement(env.addQuestionButton);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(5); // Matthew, Luke, Luke 1, Question 1, Question 2
      expect(env.questionEditButtons.length).toEqual(2);
    }));

    it('should show question in canonical order', fakeAsync(() => {
      const env = new TestEnvironment();
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      // Click on Matthew and then Matthew 1
      env.simulateRowClick(0);
      const id = new TextDocId('project01', 40, 1);
      env.simulateRowClick(1, id);
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
      env.simulateRowClick(1);
      const id = new TextDocId('project01', 42, 1);
      env.simulateRowClick(2, id);
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
      expect(env.component.itemVisible[id.toString()]).toBeFalsy();
      expect(env.component.questionCount(id.bookNum, id.chapterNum)).toBeGreaterThan(0);

      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(3);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);

      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(3);
      expect(env.questionEditButtons.length).toEqual(0);
      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(2);
    }));

    it('should open a dialog to edit a question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);

      resetCalls(mockedProjectService);
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedQuestionDialogService.questionDialog(anything())).once();
    }));

    it('should bring up question dialog only if user confirms question answered dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      // Edit a question with no answers
      env.clickElement(env.questionEditButtons[3]);
      verify(mockedDialogService.openMdcDialog(anything())).never();
      resetCalls(mockedDialogService);
      when(env.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('close'));
      // Edit a question with answers
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedDialogService.openMdcDialog(anything())).once();
      verify(mockedDialogService.openMdcDialog(QuestionDialogComponent)).never();
      resetCalls(mockedQuestionDialogService);
      when(env.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('accept'));
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedDialogService.openMdcDialog(anything())).twice();
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
      when(mockedProjectService.queryQuestions(anything())).thenReturn(
        delayPromise.then(() => env.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {}))
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

    it('responds to remote community checking disabled for checker', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.checkerUser);
      env.waitForQuestions();
      env.setCheckingEnabled(false);
      expect(env.location.path()).toBe('/projects/project01');
      verify(mockedNoticeService.show(anything())).never();
    }));

    it('responds to remote community checking disabled for non-checkers', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.translatorUser);
      env.waitForQuestions();
      env.setCheckingEnabled(false);
      expect(env.location.path()).toBe('/projects/project01/translate');
      verify(mockedNoticeService.show(anything())).once();
    }));
  });

  describe('Archive Question', () => {
    it('should display "No archived question" message', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.fixture.detectChanges();
      expect(env.loadingArchivedQuestionsLabel).not.toBeNull();
      env.waitForQuestions();
      expect(env.loadingArchivedQuestionsLabel).toBeNull();
      expect(env.noArchivedQuestionsLabel).toBeNull();

      env.simulateRowClick(0, undefined, true);
      env.simulateRowClick(1, id, true);
      env.clickElement(env.questionPublishButtons[2]);
      expect(env.loadingArchivedQuestionsLabel).toBeNull();
      expect(env.noArchivedQuestionsLabel).not.toBeNull();
    }));

    it('archives and republishes a question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('1 questions');
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionArchiveButtons.length).toEqual(9);
      env.clickElement(env.questionArchiveButtons[2]);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('2 questions');
      expect(env.textRows.length).toEqual(8);

      // Re-publish a question that has been archived
      env.simulateRowClick(0, undefined, true);
      env.simulateRowClick(1, id, true);
      const archivedQuestion: HTMLElement = env.archivedQuestionDates[0].nativeElement;
      expect(archivedQuestion.textContent).toContain('Archived on');
      env.clickElement(env.questionPublishButtons[2]);
      expect(env.textArchivedRows.length).toEqual(3);
      expect(env.getArchivedQuestionsCountTextByRow(0)).toContain('1 questions');
      expect(env.textRows.length).toEqual(9);
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
      env.simulateRowClick(0);
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
      env.simulateRowClick(0, undefined, true);
      // expect 7 questions all in the one chapter
      expect(env.getArchivedQuestionsCountTextByRow(1)).toContain('7 questions');
      // republish all 7 questions in that chapter
      env.clickElement(env.questionPublishButtons[1]);
      // expect no archived questions
      expect(env.textArchivedRows.length).toEqual(0);
      // Expect 2 books with published questions. In this case the first book will still be expanded, so the row length
      // will be 3. It seems to remember that the book was expanded, even after all questions in that book are archived,
      // so when they get republished and the book shows up in the list again, the books is expanded. Technically this
      // is probably a bug, but it's hard to imagine why anyone would care.
      expect(env.textRows.length).toEqual(3);
      // for the sake of expectations later in the test, close that first book
      env.simulateRowClick(0);
      // now just the two books should be shown, not any expanded chapters
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
      // Expect two books with archived questions. The first book will still be expanded from before, so there will be
      // 3 rows. See the note above about the same thing happening for the published questions list.
      expect(env.textArchivedRows.length).toEqual(3);
      // for the sake of expectations later in the test, close that first book
      env.simulateRowClick(0, undefined, true);
      // now just the two books should be shown, not any expanded chapters
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
  imports: [MdcDialogModule, NoopAnimationsModule, UICommonModule, ngfModule, CheckingModule, TestTranslocoModule]
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
  readonly mockedAnsweredDialogRef = mock<MdcDialogRef<QuestionAnsweredDialogComponent>>(MdcDialogRef);
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  adminUser = this.createUser('01', SFProjectRole.ParatextAdministrator);
  checkerUser = this.createUser('02', SFProjectRole.CommunityChecker);
  translatorUser = this.createUser('03', SFProjectRole.ParatextTranslator);

  private adminProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.adminUser.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: [],
    noteRefsRead: []
  };
  private reviewerProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.checkerUser.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    questionRefsRead: ['q1Id', 'q2Id', 'q3Id'],
    answerRefsRead: [],
    commentRefsRead: [],
    noteRefsRead: []
  };
  private translatorProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.translatorUser.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: [],
    noteRefsRead: []
  };
  private testProject: SFProjectProfile = {
    name: 'Project 01',
    paratextId: 'pt01',
    shortName: 'P01',
    writingSystem: {
      tag: 'en'
    },
    checkingConfig: {
      usersSeeEachOthersResponses: true,
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone
    },
    translateConfig: {
      translationSuggestionsEnabled: false,
      shareEnabled: false,
      shareLevel: TranslateShareLevel.Specific
    },
    sync: { queuedCount: 0 },
    editable: true,
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
  };

  private readonly anotherUserId = 'anotherUserId';
  private isOnline: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

  constructor(withQuestionData: boolean = true) {
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
                comments: [
                  {
                    dataId: 'c2Id',
                    ownerRef: this.checkerUser.id,
                    dateCreated: '',
                    dateModified: ''
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
                comments: [
                  {
                    dataId: 'c1Id',
                    ownerRef: this.checkerUser.id,
                    dateCreated: '',
                    dateModified: ''
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
                comments: [
                  {
                    dataId: 'c3Id',
                    ownerRef: this.anotherUserId,
                    dateCreated: '',
                    dateModified: ''
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

    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedQuestionDialogService.questionDialog(anything())).thenResolve();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    when(mockedDialogService.openMdcDialog(QuestionAnsweredDialogComponent)).thenReturn(
      instance(this.mockedAnsweredDialogRef)
    );
    when(this.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('accept'));
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((id, userId) =>
      this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId))
    );
    when(mockedProjectService.queryQuestions('project01')).thenCall(() =>
      this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {})
    );
    this.setCurrentUser(this.adminUser);

    when(mockedPwaService.onlineStatus$).thenReturn(this.isOnline.asObservable());
    when(mockedPwaService.isOnline).thenReturn(this.isOnline.getValue());

    this.fixture = TestBed.createComponent(CheckingOverviewComponent);
    this.component = this.fixture.componentInstance;
    this.location = TestBed.inject(Location);
  }

  get addQuestionButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#add-question-button'));
  }

  get archivedQuestions(): DebugElement {
    return this.fixture.debugElement.query(By.css('#text-with-archived-questions'));
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
    return this.questions.queryAll(By.css('mdc-list-item'));
  }

  get textArchivedRows(): DebugElement[] {
    return this.archivedQuestions.queryAll(By.css('mdc-list-item'));
  }

  get questions(): DebugElement {
    return this.fixture.debugElement.query(By.css('#text-with-questions-list'));
  }

  get questionEditButtons(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-list-item .edit-btn'));
  }

  get questionArchiveButtons(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-list-item .archive-btn'));
  }

  get questionPublishButtons(): DebugElement[] {
    return this.archivedQuestions.queryAll(By.css('mdc-list-item .publish-btn'));
  }

  get loadingArchivedQuestionsLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#loading-archived-questions-message'));
  }

  get noArchivedQuestionsLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#no-archived-questions-label'));
  }

  get archivedQuestionDates(): DebugElement[] {
    return this.archivedQuestions.queryAll(By.css('mdc-list-item .date-archived'));
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
    this.isOnline.next(isOnline);
    tick();
    this.fixture.detectChanges();
  }

  getPublishedQuestionsCountTextByRow(row: number): string {
    return this.questions.queryAll(By.css('mdc-list-item .questions-count'))[row].nativeElement.textContent;
  }

  getArchivedQuestionsCountTextByRow(row: number): string {
    return this.archivedQuestions.queryAll(By.css('mdc-list-item .archived-questions-count'))[row].nativeElement
      .textContent;
  }

  waitForQuestions(): void {
    this.realtimeService.updateAllSubscribeQueries();
    this.fixture.detectChanges();
    this.waitForProjectDocChanges();
  }

  setSeeOtherUserResponses(isEnabled: boolean): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(
      op => op.set<boolean>(p => p.checkingConfig.usersSeeEachOthersResponses, isEnabled),
      false
    );
    this.waitForProjectDocChanges();
  }

  setCheckingEnabled(isEnabled: boolean): void {
    this.ngZone.run(() => {
      const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, 'project01');
      projectDoc.submitJson0Op(op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, isEnabled), false);
    });
    this.waitForProjectDocChanges();
  }

  // Project doc changes are throttled by 1000 ms, so we have to wait for them
  waitForProjectDocChanges(): void {
    tick(1000);
    this.fixture.detectChanges();
  }

  /**
   * simulate row click since actually clicking on the row doesn't fire the selectionChange event
   */
  simulateRowClick(index: number, id?: TextDocId, fromArchives?: boolean): void {
    let idStr: string;
    if (id) {
      idStr = id.toString();
    } else {
      idStr = Canon.bookNumberToId(this.component.texts[index].bookNum);
    }
    if (fromArchives) {
      this.component.itemVisibleArchived[idStr] = !this.component.itemVisibleArchived[idStr];
    } else {
      this.component.itemVisible[idStr] = !this.component.itemVisible[idStr];
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

  private createUser(id: string, role: string, nameConfirmed: boolean = true): UserInfo {
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
}
