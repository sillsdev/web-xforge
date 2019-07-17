import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { AngularSplitModule } from 'angular-split';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { AccountService } from 'xforge-common/account.service';
import { EditNameDialogComponent } from 'xforge-common/edit-name-dialog/edit-name-dialog.component';
import { MapQueryResults } from 'xforge-common/json-api.service';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { User } from 'xforge-common/models/user';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { Comment } from '../../core/models/comment';
import { CommentsDoc } from '../../core/models/comments-doc';
import { Question } from '../../core/models/question';
import { QuestionsDoc } from '../../core/models/questions-doc';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectData } from '../../core/models/sfproject-data';
import { SFProjectDataDoc } from '../../core/models/sfproject-data-doc';
import { SFProjectRoles } from '../../core/models/sfproject-roles';
import { SFProjectUser, SFProjectUserRef } from '../../core/models/sfproject-user';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { getTextDocIdStr, TextDocId } from '../../core/models/text-doc-id';
import { SFProjectUserService } from '../../core/sfproject-user.service';
import { SFProjectService } from '../../core/sfproject.service';
import { SharedModule } from '../../shared/shared.module';
import { CheckingAnswersComponent } from './checking-answers/checking-answers.component';
import { CheckingCommentFormComponent } from './checking-answers/checking-comments/checking-comment-form/checking-comment-form.component';
import { CheckingCommentsComponent } from './checking-answers/checking-comments/checking-comments.component';
import { CheckingOwnerComponent } from './checking-answers/checking-owner/checking-owner.component';
import { CheckingQuestionsComponent } from './checking-questions/checking-questions.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';
import { CheckingComponent } from './checking.component';
import { FontSizeComponent } from './font-size/font-size.component';

describe('CheckingComponent', () => {
  let env: TestEnvironment;
  beforeEach(fakeAsync(() => {
    env = new TestEnvironment();
  }));

  describe('Interface', () => {
    it('can navigate using next button', fakeAsync(() => {
      env.setupAdminScenarioData();
      env.selectQuestion(1);
      env.clickButton(env.nextButton);
      tick(env.questionReadTimer);
      const nextQuestion = env.currentQuestion;
      expect(nextQuestion).toEqual(2);
    }));

    it('can navigate using previous button', fakeAsync(() => {
      env.setupAdminScenarioData();
      env.selectQuestion(2);
      env.clickButton(env.previousButton);
      tick(env.questionReadTimer);
      const nextQuestion = env.currentQuestion;
      expect(nextQuestion).toEqual(1);
    }));

    it('check navigate buttons disable at the end of the question list', fakeAsync(() => {
      env.setupAdminScenarioData();
      env.selectQuestion(1);
      const prev = env.previousButton;
      const next = env.nextButton;
      expect(prev.nativeElement.disabled).toBe(true);
      expect(next.nativeElement.disabled).toBe(false);
      env.selectQuestion(15);
      expect(prev.nativeElement.disabled).toBe(false);
      expect(next.nativeElement.disabled).toBe(true);
    }));
  });

  describe('Questions', () => {
    it('questions are displaying', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      expect(env.questions.length).toEqual(15);
      const question = env.selectQuestion(15);
      expect(env.getQuestionText(question)).toBe('Question relating to chapter 2');
    }));

    it('can select a question', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(1);
      expect(question.classes['mdc-list-item--activated']).toBeTruthy();
    }));

    it('question status change to read', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      let question = env.selectQuestion(2, false);
      expect(question.classes['question-read']).toBeFalsy();
      question = env.selectQuestion(3);
      expect(question.classes['question-read']).toBeTruthy();
    }));

    it('question status change to answered', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(question.classes['question-answered']).toBeTruthy();
    }));

    it('question shows answers icon and total', fakeAsync(() => {
      env.setupAdminScenarioData();
      const question = env.selectQuestion(6, false);
      expect(env.getUnread(question)).toEqual(1);
      tick(env.questionReadTimer);
      env.fixture.detectChanges();
      expect(env.getUnread(question)).toEqual(0);
    }));
  });

  describe('Answers', () => {
    it('answer panel is initiated and shows the first question', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      expect(env.answerPanel).toBeDefined();
    }));

    it('can answer a question', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answer question 2');
    }));

    it('opens dialog if answering a question for the first time', fakeAsync(() => {
      env.setupReviewerScenarioData(env.cleanReviewUser);
      env.selectQuestion(2);
      env.answerQuestion('Answering question 2 should pop up a dialog');
      verify(env.mockedAccountService.openNameDialog(env.cleanReviewUser.name, true)).once();
      verify(env.mockedUserService.updateCurrentUserAttributes(anything())).once();
      expect(env.answers.length).toEqual(1);
      expect(env.getAnswerText(0)).toBe('Answering question 2 should pop up a dialog');
    }));

    it('inserts newer answer above older answers', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      env.selectQuestion(7);
      env.answerQuestion('Just added answer');
      expect(env.answers.length).toEqual(2);
      expect(env.getAnswerText(0)).toBe('Just added answer');
      expect(env.getAnswerText(1)).toBe('Answer 7 on question');
    }));

    it('can cancel answering a question', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).toBeDefined();
      env.clickButton(env.cancelAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField).toBeNull();
      expect(env.addAnswerButton).toBeDefined();
    }));

    it('can change answering tabs', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.waitForSliderUpdate();
      env.clickButton(env.recordTab);
      expect(env.recordButton).toBeDefined();
    }));

    it('check answering validation', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(2);
      env.clickButton(env.addAnswerButton);
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.yourAnswerField.classes['mdc-text-field--invalid']).toBeTruthy();
    }));

    it('can edit an answer', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      env.clickButton(env.answers[0].query(By.css('.answer-edit')));
      env.setTextFieldValue(env.yourAnswerField, 'Edited question 2 answer');
      env.clickButton(env.saveAnswerButton);
      env.waitForSliderUpdate();
      expect(env.getAnswerText(0)).toBe('Edited question 2 answer');
    }));

    it('can delete an answer', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      const question = env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      env.clickButton(env.answers[0].query(By.css('.answer-delete')));
      env.waitForSliderUpdate();
      expect(env.answers.length).toEqual(0);
    }));

    it('answers reset when changing questions', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      env.selectQuestion(2);
      env.answerQuestion('Answer question 2');
      expect(env.answers.length).toEqual(1);
      env.selectQuestion(1);
      expect(env.answers.length).toEqual(0);
    }));

    it('can like and unlike an answer', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      env.selectQuestion(1);
      env.answerQuestion('Answer question to be liked');
      expect(env.likeTotal).toBe(0);
      env.clickButton(env.likeButton);
      env.waitForSliderUpdate();
      expect(env.likeTotal).toBe(1);
      env.clickButton(env.likeButton);
      env.waitForSliderUpdate();
      expect(env.likeTotal).toBe(0);
    }));

    it('do not show answers until current user has submitted an answer', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      env.answerQuestion('Answer from reviewer');
      expect(env.answers.length).toBe(2);
    }));

    it('reviewer can only see their answers when the setting is OFF to see other answers', fakeAsync(() => {
      env.setupReviewerScenarioData(env.reviewerUser);
      env.component.project.usersSeeEachOthersResponses = false;
      env.fixture.detectChanges();
      env.selectQuestion(6);
      expect(env.answers.length).toBe(1);
      env.selectQuestion(7);
      expect(env.answers.length).toBe(0);
      env.answerQuestion('Answer from reviewer');
      expect(env.answers.length).toBe(1);
    }));

    describe('Comments', () => {
      it('can comment on an answer', fakeAsync(() => {
        env.setupReviewerScenarioData(env.reviewerUser);
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        expect(env.getAnswerComments(0).length).toBe(1);
      }));

      it('can edit comment on an answer', fakeAsync(() => {
        env.setupReviewerScenarioData(env.reviewerUser);
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        env.clickButton(env.getEditCommentButton(0, 0));
        env.setTextFieldValue(env.getYourCommentField(0), 'Edited comment');
        env.clickButton(env.getSaveCommentButton(0));
        env.waitForSliderUpdate();
        expect(env.getAnswerCommentText(0, 0)).toBe('Edited comment');
        expect(env.getAnswerComments(0).length).toBe(1);
      }));

      it('can delete comment on an answer', fakeAsync(() => {
        env.setupReviewerScenarioData(env.reviewerUser);
        env.selectQuestion(1);
        env.answerQuestion('Answer question to be commented on');
        env.commentOnAnswer(0, 'Response to answer');
        expect(env.getAnswerComments(0).length).toBe(1);
        env.clickButton(env.getDeleteCommentButton(0, 0));
        env.waitForSliderUpdate();
        expect(env.getAnswerComments(0).length).toBe(0);
      }));

      it('comments only appear on the relevant answer', fakeAsync(() => {
        env.setupReviewerScenarioData(env.reviewerUser);
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
        env.setupAdminScenarioData();
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
        env.setupAdminScenarioData();
        const question = env.selectQuestion(8, false);
        expect(env.getUnread(question)).toEqual(4);
        tick(env.questionReadTimer);
        env.fixture.detectChanges();
        expect(env.getUnread(question)).toEqual(2);
        env.clickButton(env.getShowAllCommentsButton(0));
        tick(1);
        expect(env.getUnread(question)).toEqual(0);
      }));
    });
  });

  describe('Text', () => {
    it('can increase and decrease font size', fakeAsync(() => {
      env.setupAdminScenarioData();
      const editor = env.quillEditor;
      expect(editor.style.fontSize).toBe('1rem');
      env.clickButton(env.increaseFontSizeButton);
      expect(editor.style.fontSize).toBe('1.1rem');
      env.clickButton(env.decreaseFontSizeButton);
      expect(editor.style.fontSize).toBe('1rem');
    }));
  });
});

class TestEnvironment {
  component: CheckingComponent;
  fixture: ComponentFixture<CheckingComponent>;
  questionReadTimer: number = 2000;

  mockedCheckingNameDialogRef: MdcDialogRef<EditNameDialogComponent>;
  mockedAccountService: AccountService;
  mockedRealtimeOfflineStore: RealtimeOfflineStore;
  mockedUserService: UserService;
  mockedProjectUserService: SFProjectUserService;
  mockedProjectService: SFProjectService;
  adminUser = this.createUser('01', SFProjectRoles.ParatextAdministrator);
  reviewerUser = this.createUser('02', SFProjectRoles.Reviewer);
  cleanReviewUser = this.createUser('03', SFProjectRoles.Reviewer, false);

  private projectData: SFProjectData = {
    texts: [{ bookId: 'JHN', name: 'John', hasSource: false, chapters: [{ number: 1 }, { number: 2 }] }]
  };

  private testAdminProjectUser: SFProjectUser = new SFProjectUser({
    id: this.adminUser.id,
    user: this.adminUser,
    role: this.adminUser.role,
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  });

  private testReviewerProjectUser: SFProjectUser = new SFProjectUser({
    id: this.reviewerUser.id,
    user: this.reviewerUser,
    role: this.reviewerUser.role,
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  });

  private testCleanReviewerProjectUser: SFProjectUser = new SFProjectUser({
    id: this.cleanReviewUser.id,
    user: this.cleanReviewUser,
    role: this.cleanReviewUser.role,
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  });

  private testProject: SFProject = new SFProject({
    id: 'project01',
    projectName: 'Project 01',
    usersSeeEachOthersResponses: true,
    checkingEnabled: true,
    shareEnabled: true,
    shareLevel: SharingLevel.Anyone,
    users: [
      new SFProjectUserRef(this.adminUser.id),
      new SFProjectUserRef(this.reviewerUser.id),
      new SFProjectUserRef(this.cleanReviewUser.id)
    ]
  });

  constructor() {
    this.mockedCheckingNameDialogRef = mock(MdcDialogRef);
    this.mockedAccountService = mock(AccountService);
    this.mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);
    this.mockedUserService = mock(UserService);
    this.mockedProjectUserService = mock(SFProjectUserService);
    this.mockedProjectService = mock(SFProjectService);

    TestBed.configureTestingModule({
      declarations: [
        CheckingAnswersComponent,
        CheckingCommentFormComponent,
        CheckingCommentsComponent,
        CheckingComponent,
        CheckingOwnerComponent,
        CheckingQuestionsComponent,
        CheckingTextComponent,
        FontSizeComponent
      ],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [UICommonModule, AngularSplitModule.forRoot(), SharedModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { params: of({ projectId: 'project01', bookId: 'JHN' }) }
        },
        { provide: AccountService, useFactory: () => instance(this.mockedAccountService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: SFProjectUserService, useFactory: () => instance(this.mockedProjectUserService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) }
      ]
    });
  }

  get answerPanel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-panel'));
  }

  get answers(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#answer-panel .answers-container .answer'));
  }

  get addAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#add-answer'));
  }

  get saveAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#save-answer'));
  }

  get cancelAnswerButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#cancel-answer'));
  }

  get yourAnswerField(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-text-field[formControlName="answerText"]'));
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

  get likeButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#like-answer'));
  }

  get likeTotal(): number {
    return parseInt(
      this.fixture.debugElement.query(By.css('.answers-container .answer .like-count')).nativeElement.textContent,
      10
    );
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

  get recordTab(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-form mdc-tab:nth-child(2)'));
  }

  get recordButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#answer-form button.record'));
  }

  get increaseFontSizeButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-font-size mdc-menu-surface button:last-child'));
  }

  get decreaseFontSizeButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-font-size mdc-menu-surface button:first-child'));
  }

  answerQuestion(answer: string): void {
    this.clickButton(this.addAnswerButton);
    this.setTextFieldValue(this.yourAnswerField, answer);
    this.clickButton(this.saveAnswerButton);
    this.waitForSliderUpdate();
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  commentOnAnswer(answerIndex: number, comment: string): void {
    this.clickButton(this.getAddCommentButton(answerIndex));
    this.setTextFieldValue(this.getYourCommentField(answerIndex), comment);
    this.clickButton(this.getSaveCommentButton(answerIndex));
    this.waitForSliderUpdate();
  }

  getAnswer(index: number): DebugElement {
    return this.answers[index];
  }

  getAnswerText(index: number): string {
    return this.getAnswer(index).query(By.css('.answer-text')).nativeElement.textContent;
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

  selectQuestion(questionNumber: number, includeReadTimer: boolean = true): DebugElement {
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

  setTextFieldValue(textField: DebugElement, value: string): void {
    const input = textField.query(By.css('input'));
    const inputElem = input.nativeElement as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
  }

  getShowAllCommentsButton(answerIndex: number): DebugElement {
    return this.getAnswer(answerIndex).query(By.css('.show-all-comments'));
  }

  waitForSliderUpdate(): void {
    tick(1);
    this.fixture.detectChanges();
  }

  setupAdminScenarioData(): void {
    this.setupDefaultProjectData(this.adminUser);
    this.initComponentEnviroment();
  }

  setupReviewerScenarioData(user: User): void {
    this.setupDefaultProjectData(user);
    this.initComponentEnviroment();
  }

  private setupDefaultProjectData(user: User): void {
    when(this.mockedProjectService.get('project01', deepEqual([[nameof<SFProject>('users')]]))).thenReturn(
      of(
        new MapQueryResults(this.testProject, undefined, [
          this.testAdminProjectUser,
          this.testReviewerProjectUser,
          this.testCleanReviewerProjectUser
        ])
      )
    );

    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, 'project01', this.projectData);
    const projectDataDoc = new SFProjectDataDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedProjectService.getDataDoc('project01')).thenResolve(projectDataDoc);
    when(this.mockedProjectService.getTextDoc(deepEqual(new TextDocId('project01', 'JHN', 1, 'target')))).thenResolve(
      this.createTextDoc()
    );
    when(this.mockedProjectService.getTextDoc(deepEqual(new TextDocId('project01', 'JHN', 2, 'target')))).thenResolve(
      this.createTextDoc()
    );
    const text1_1id = new TextDocId('project01', 'JHN', 1);
    const text1_2id = new TextDocId('project01', 'JHN', 2);
    const dateNow: string = new Date().toJSON();
    const questionData1: Question[] = [];
    const questionData2: Question[] = [];
    for (let questionNumber = 1; questionNumber <= 14; questionNumber++) {
      questionData1.push({
        id: 'q' + questionNumber + 'Id',
        ownerRef: undefined,
        text: 'Book 1, Q' + questionNumber + ' text',
        scriptureStart: { book: 'JHN', chapter: '1', verse: '1', versification: 'English' },
        scriptureEnd: { book: 'JHN', chapter: '1', verse: '2', versification: 'English' },
        answers: []
      });
    }
    questionData2.push({
      id: 'q15Id',
      ownerRef: undefined,
      text: 'Question relating to chapter 2',
      scriptureStart: { book: 'JHN', chapter: '2', verse: '1', versification: 'English' },
      scriptureEnd: { book: 'JHN', chapter: '2', verse: '2', versification: 'English' },
      answers: []
    });
    questionData1[5].answers.push({
      id: 'a6Id',
      ownerRef: this.reviewerUser.id,
      text: 'Answer 6 on question',
      likes: [],
      dateCreated: dateNow,
      dateModified: dateNow
    });
    questionData1[6].answers.push({
      id: 'a7Id',
      ownerRef: this.adminUser.id,
      text: 'Answer 7 on question',
      likes: [],
      dateCreated: dateNow,
      dateModified: dateNow
    });
    questionData1[7].answers.push({
      id: 'a8Id',
      ownerRef: this.adminUser.id,
      text: 'Answer 8 on question',
      likes: [],
      dateCreated: dateNow,
      dateModified: dateNow
    });
    const commentData: Comment[] = [];
    for (let commentNumber = 1; commentNumber <= 3; commentNumber++) {
      commentData.push({
        id: 'c' + commentNumber + 'Id',
        ownerRef: this.adminUser.id,
        projectRef: undefined,
        answerRef: 'a7Id',
        text: 'Comment ' + commentNumber + ' on question 7',
        dateCreated: dateNow,
        dateModified: dateNow
      });
    }
    for (let commentNumber = 1; commentNumber <= 4; commentNumber++) {
      commentData.push({
        id: 'c' + commentNumber + 'Id',
        ownerRef: this.reviewerUser.id,
        projectRef: undefined,
        answerRef: 'a8Id',
        text: 'Comment ' + commentNumber + ' on question 8',
        dateCreated: dateNow,
        dateModified: dateNow
      });
    }
    when(this.mockedProjectService.getQuestionsDoc(deepEqual(text1_1id))).thenResolve(
      this.createQuestionsDoc(text1_1id, questionData1)
    );
    when(this.mockedProjectService.getCommentsDoc(deepEqual(text1_1id))).thenResolve(
      this.createCommentsDoc(text1_1id, commentData)
    );
    when(this.mockedProjectService.getQuestionsDoc(deepEqual(text1_2id))).thenResolve(
      this.createQuestionsDoc(text1_2id, questionData2)
    );
    when(this.mockedProjectService.getCommentsDoc(deepEqual(text1_2id))).thenResolve(
      this.createCommentsDoc(text1_2id, [])
    );
    when(this.mockedUserService.currentUserId).thenReturn(user.id);
    when(this.mockedUserService.getCurrentUser()).thenReturn(of(user));
    when(this.mockedUserService.onlineGet(this.adminUser.id)).thenReturn(of(new MapQueryResults(this.adminUser)));
    when(this.mockedUserService.onlineGet(this.reviewerUser.id)).thenReturn(of(new MapQueryResults(this.reviewerUser)));
    when(this.mockedUserService.onlineGet(this.cleanReviewUser.id)).thenReturn(
      of(new MapQueryResults(this.cleanReviewUser))
    );
    when(this.mockedUserService.updateCurrentUserAttributes(anything())).thenResolve(user);
    when(this.mockedAccountService.openNameDialog(anything(), anything())).thenReturn(
      instance(this.mockedCheckingNameDialogRef)
    );

    when(this.mockedProjectUserService.update(anything())).thenReturn(new Promise(() => {}));
    when(this.mockedCheckingNameDialogRef.afterClosed()).thenReturn(of(user.name));
  }

  private initComponentEnviroment(): void {
    this.fixture = TestBed.createComponent(CheckingComponent);
    this.component = this.fixture.componentInstance;
    // Need to wait for questions and text promises to finish
    this.fixture.detectChanges();
    tick(1);
    this.fixture.detectChanges();
    tick(this.questionReadTimer);
    this.fixture.detectChanges();
  }

  private createUser(id: string, role: string, nameConfirmed: boolean = true): User {
    return new User({
      id: 'user' + id,
      email: 'user' + id + '@example.com',
      name: 'User ' + id,
      role: role,
      active: true,
      dateCreated: '2019-01-01T12:00:00.000Z',
      isNameConfirmed: nameConfirmed
    });
  }

  private createQuestionsDoc(id: TextDocId, data: Question[]): QuestionsDoc {
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, id.toString(), data);
    return new QuestionsDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private createCommentsDoc(id: TextDocId, data: Comment[]): CommentsDoc {
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, id.toString(), data);
    return new CommentsDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private createTextDoc(): TextDoc {
    const mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);
    const delta = new Delta();
    delta.insert({ chapter: { number: '1', style: 'c' } });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert('target: chapter 1, verse 1.', { segment: 'verse_1_1' });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: 'verse_1_2' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`target: chapter 1, verse 3.`, { segment: 'verse_1_3' });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`target: chapter 1, verse 4.`, { segment: 'verse_1_4' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: 'initial' }, { segment: 'verse_1_4/p_1' });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert(`target: chapter 1, `, { segment: 'verse_1_5' });
    delta.insert('\n', { para: { style: 'p' } });
    const adapter = new MemoryRealtimeDocAdapter(
      RichText.type,
      getTextDocIdStr('project01', 'JHN', 1, 'target'),
      delta
    );
    return new TextDoc(adapter, instance(mockedRealtimeOfflineStore));
  }
}
