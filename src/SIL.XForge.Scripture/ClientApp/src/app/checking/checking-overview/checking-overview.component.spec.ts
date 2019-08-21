import { MdcDialog, MdcDialogModule, MdcDialogRef } from '@angular-mdc/web';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ngfModule } from 'angular-file';
import * as OTJson0 from 'ot-json0';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { User } from 'xforge-common/models/user';
import { NoticeService } from 'xforge-common/notice.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { Comment } from '../../core/models/comment';
import { CommentListDoc } from '../../core/models/comment-list-doc';
import { Question } from '../../core/models/question';
import { QuestionListDoc } from '../../core/models/question-list-doc';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { ScrVersType } from '../../core/models/scripture/versification';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectDoc } from '../../core/models/sfproject-doc';
import { SFProjectRoles } from '../../core/models/sfproject-roles';
import { SFProjectUserConfig } from '../../core/models/sfproject-user-config';
import { SFProjectUserConfigDoc } from '../../core/models/sfproject-user-config-doc';
import { TextDocId } from '../../core/models/text-doc-id';
import { SFProjectService } from '../../core/sfproject.service';
import { CheckingModule } from '../checking.module';
import { QuestionDialogComponent } from '../question-dialog/question-dialog.component';
import { CheckingOverviewComponent } from './checking-overview.component';

describe('CheckingOverviewComponent', () => {
  describe('Add Question', () => {
    it('should display "No question" message', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.noQuestionsLabel).not.toBeNull();
      env.waitForQuestions();
      expect(env.noQuestionsLabel).toBeNull();
    }));

    it('should not display "Add question" button for Reviewer', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.reviewerUser);
      env.waitForQuestions();
      expect(env.addQuestionButton).toBeNull();
    }));

    it('should only display "Add question" button for project admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.adminUser);
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
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.waitForQuestions();
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      expect().nothing();
    }));

    it('should not add a question if cancelled', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.waitForQuestions();
      verify(env.mockedProjectService.getQuestionList(anything())).thrice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).never();
      expect().nothing();
    }));

    it('should add a question if requested', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 3:3',
          scriptureEnd: '',
          text: '',
          audio: { fileName: '' }
        })
      );
      env.waitForQuestions();
      verify(env.mockedProjectService.getQuestionList(anything())).thrice();
      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(3);

      resetCalls(env.mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).once();
      const id = new TextDocId('project01', 'MAT', 3);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(5);
    }));
  });

  describe('Edit Question', () => {
    it('should expand/collapse questions in book text', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.questionEditButtons.length).toEqual(0);
      expect(env.component.itemVisible[id.toString()]).toBeFalsy();
      expect(env.component.questionListDocs[id.toString()].data.questions.length).toBeGreaterThan(0);
      expect(env.component.questionCount(id.bookId, id.chapter)).toBeGreaterThan(0);

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

    it('should edit question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 1:3',
          scriptureEnd: '',
          text: '',
          audio: {}
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);
      verify(env.mockedProjectService.getQuestionList(anything())).thrice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.questionEditButtons[0]);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).never();
    }));

    it('allows editing scripture reference', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 3:3',
          scriptureEnd: '',
          text: 'scripture reference moved to chapter 2',
          audio: {}
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      const mat3Id = new TextDocId('project01', 'MAT', 3);

      resetCalls(env.mockedProjectService);
      expect(env.questionEditButtons.length).toEqual(6);
      env.clickElement(env.questionEditButtons[0]);
      verify(env.mockedProjectService.getQuestionList(deepEqual(mat3Id))).once();
      expect(env.questionEditButtons.length).toEqual(5);
      env.simulateRowClick(1, mat3Id);
      expect(env.textRows.length).toEqual(10);
    }));

    it('should remove audio file when reset', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 1:3',
          scriptureEnd: '',
          text: 'Book 1, Q1 text',
          audio: { status: 'reset' }
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);
      verify(env.mockedProjectService.getQuestionList(anything())).thrice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.questionEditButtons[0]);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).never();
      verify(env.mockedProjectService.onlineDeleteAudio('project01', 'q1Id', env.adminUser.id)).once();
    }));
  });

  describe('for Reviewer', () => {
    it('should display "No question" message', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.reviewerUser);
      env.fixture.detectChanges();
      expect(env.noQuestionsLabel).not.toBeNull();
      env.waitForQuestions();
      expect(env.noQuestionsLabel).toBeNull();
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
      env.setCurrentUser(env.reviewerUser);
      env.waitForQuestions();
      expect(env.overallProgressChart).not.toBeNull();
      expect(env.reviewerQuestionPanel).not.toBeNull();
    }));

    it('should calculate the right progress proportions and stats', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.reviewerUser);
      env.waitForQuestions();
      const [unread, read, answered] = env.component.bookProgress({ bookId: 'MAT', chapters: [{ number: 1 }] });
      expect(unread).toBe(3);
      expect(read).toBe(2);
      expect(answered).toBe(1);
      // 1 of 7 questions of MAT is archived + 1 in LUK
      expect(env.component.allQuestionsCount).toBe('7');
      expect(env.component.myAnswerCount).toBe('1');
      expect(env.component.myCommentCount).toBe('2');
      expect(env.component.myLikeCount).toBe('3');
    }));

    it('should calculate the right stats for project admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.adminUser);
      env.waitForQuestions();
      // 1 of 7 questions of MAT is archived + 1 in LUK
      expect(env.component.allQuestionsCount).toBe('7');
      expect(env.component.myAnswerCount).toBe('3');
      expect(env.component.myCommentCount).toBe('3');
      expect(env.component.myLikeCount).toBe('4');
    }));
  });

  describe('Archive Question', () => {
    it('should display "No archived question" message', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      env.waitForQuestions();
      expect(env.noArchivedQuestionsLabel).toBeNull();

      env.simulateRowClick(0, undefined, true);
      env.simulateRowClick(1, id, true);
      env.clickElement(env.questionPublishButtons[0]);
      expect(env.noArchivedQuestionsLabel).not.toBeNull();
    }));

    it('archives and republishes a question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountByRow(0).nativeElement.textContent).toBe('1 questions');
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionArchiveButtons.length).toEqual(6);
      env.clickElement(env.questionArchiveButtons[0]);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountByRow(0).nativeElement.textContent).toBe('2 questions');
      expect(env.textRows.length).toEqual(8);

      // Re-publish a question that has been archived
      env.simulateRowClick(0, undefined, true);
      env.simulateRowClick(1, id, true);
      const archivedQuestion: HTMLElement = env.archivedQuestionDates[0].nativeElement;
      expect(archivedQuestion.textContent).toBe('Archived less than a minute ago');
      env.clickElement(env.questionPublishButtons[0]);
      expect(env.textArchivedRows.length).toEqual(3);
      expect(env.getArchivedQuestionsCountByRow(0).nativeElement.textContent).toBe('1 questions');
      expect(env.textRows.length).toEqual(9);
    }));
  });
});

@NgModule({
  imports: [
    FormsModule,
    MdcDialogModule,
    ReactiveFormsModule,
    NoopAnimationsModule,
    UICommonModule,
    ngfModule,
    CheckingModule
  ],
  entryComponents: [QuestionDialogComponent]
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

  mockedActivatedRoute: ActivatedRoute = mock(ActivatedRoute);
  mockedMdcDialog: MdcDialog = mock(MdcDialog);
  mockedQuestionDialogRef: MdcDialogRef<QuestionDialogComponent> = mock(MdcDialogRef);
  mockedNoticeService = mock(NoticeService);
  mockedProjectService: SFProjectService = mock(SFProjectService);
  mockedUserService: UserService = mock(UserService);
  mockedAuthService: AuthService = mock(AuthService);
  mockedRealtimeOfflineStore: RealtimeOfflineStore = mock(RealtimeOfflineStore);
  adminUser = this.createUser('01', SFProjectRoles.ParatextAdministrator);
  reviewerUser = this.createUser('02', SFProjectRoles.Reviewer);

  private adminProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.adminUser.id,
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  };
  private reviewerProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.reviewerUser.id,
    questionRefsRead: ['q1Id', 'q2Id', 'q3Id'],
    answerRefsRead: [],
    commentRefsRead: []
  };
  private testProject: SFProject = {
    projectName: 'Project 01',
    usersSeeEachOthersResponses: true,
    checkingEnabled: true,
    shareEnabled: true,
    shareLevel: SharingLevel.Anyone,
    texts: [
      { bookId: 'MAT', name: 'Matthew', chapters: [{ number: 1, lastVerse: 25 }, { number: 3, lastVerse: 17 }] },
      { bookId: 'LUK', name: 'Luke', chapters: [{ number: 1, lastVerse: 80 }] }
    ],
    userRoles: {
      [this.adminUser.id]: this.adminUser.role,
      [this.reviewerUser.id]: this.reviewerUser.role
    }
  };
  private readonly anotherUserId = 'anotherUserId';

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(this.mockedMdcDialog.open(anything(), anything())).thenReturn(instance(this.mockedQuestionDialogRef));
    const adapter = new MemoryRealtimeDocAdapter('project01', OTJson0.type, this.testProject);
    const projectDoc = new SFProjectDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedProjectService.get('project01')).thenResolve(projectDoc);
    when(this.mockedProjectService.getUserConfig('project01', this.adminUser.id)).thenResolve(
      this.createProjectUserConfigDoc(this.adminProjectUserConfig)
    );
    when(this.mockedProjectService.getUserConfig('project01', this.reviewerUser.id)).thenResolve(
      this.createProjectUserConfigDoc(this.reviewerProjectUserConfig)
    );

    const text1_1id = new TextDocId('project01', 'MAT', 1);
    const verseData = VerseRef.fromStr('MAT 1:3', ScrVers.English);
    when(this.mockedProjectService.getQuestionList(deepEqual(text1_1id))).thenResolve(
      this.createQuestionListDoc(text1_1id, [
        {
          id: 'q1Id',
          scriptureStart: {
            book: verseData.book,
            chapter: verseData.chapter,
            verse: verseData.verse,
            versification: ScrVersType[ScrVersType.English]
          },
          ownerRef: this.adminUser.id,
          text: 'Book 1, Q1 text',
          answers: [
            {
              id: 'a1Id',
              ownerRef: this.reviewerUser.id,
              likes: [{ ownerRef: this.reviewerUser.id }, { ownerRef: this.anotherUserId }],
              dateCreated: '',
              dateModified: ''
            }
          ],
          audioUrl: '/audio.mp3'
        },
        {
          id: 'q2Id',
          ownerRef: this.adminUser.id,
          text: 'Book 1, Q2 text',
          answers: [
            {
              id: 'a2Id',
              ownerRef: this.anotherUserId,
              likes: [{ ownerRef: this.reviewerUser.id }],
              dateCreated: '',
              dateModified: ''
            }
          ]
        },
        {
          id: 'q3Id',
          ownerRef: this.adminUser.id,
          text: 'Book 1, Q3 text',
          answers: [
            {
              id: 'a3Id',
              ownerRef: this.anotherUserId,
              likes: [{ ownerRef: this.reviewerUser.id }],
              dateCreated: '',
              dateModified: ''
            }
          ]
        },
        { id: 'q4Id', ownerRef: this.adminUser.id, text: 'Book 1, Q4 text' },
        { id: 'q5Id', ownerRef: this.adminUser.id, text: 'Book 1, Q5 text' },
        { id: 'q6Id', ownerRef: this.adminUser.id, text: 'Book 1, Q6 text' },
        {
          id: 'q7Id',
          ownerRef: this.adminUser.id,
          text: 'Book 1, Q7 text',
          isArchived: true,
          dateArchived: '2019-07-30T12:00:00.000Z'
        }
      ])
    );
    when(this.mockedProjectService.getCommentList(deepEqual(text1_1id))).thenResolve(
      this.createCommentListDoc(text1_1id, [
        {
          id: 'c1Id',
          ownerRef: this.reviewerUser.id,
          dateCreated: '',
          dateModified: '',
          answerRef: 'a1Id'
        },
        {
          id: 'c2Id',
          ownerRef: this.reviewerUser.id,
          dateCreated: '',
          dateModified: '',
          answerRef: 'a2Id'
        },
        {
          id: 'c3Id',
          ownerRef: this.anotherUserId,
          dateCreated: '',
          dateModified: '',
          answerRef: 'a3Id'
        }
      ])
    );
    const text1_3id = new TextDocId('project01', 'MAT', 3);
    when(this.mockedProjectService.getQuestionList(deepEqual(text1_3id))).thenResolve(
      this.createQuestionListDoc(text1_3id, [])
    );
    const text2_1id = new TextDocId('project01', 'LUK', 1);
    when(this.mockedProjectService.getQuestionList(deepEqual(text2_1id))).thenResolve(
      this.createQuestionListDoc(text2_1id, [{ id: 'q8Id', ownerRef: this.anotherUserId, text: 'Book 2, Q3 text' }])
    );
    this.setCurrentUser(this.adminUser);

    TestBed.configureTestingModule({
      imports: [DialogTestModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: MdcDialog, useFactory: () => instance(this.mockedMdcDialog) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) }
      ]
    });
    this.fixture = TestBed.createComponent(CheckingOverviewComponent);
    this.component = this.fixture.componentInstance;
  }

  get addQuestionButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#add-question-button'));
  }

  get archivedQuestions(): DebugElement {
    return this.fixture.debugElement.query(By.css('#text-with-archived-questions'));
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

  getArchivedQuestionsCountByRow(row: number): DebugElement {
    return this.archivedQuestions.queryAll(By.css('mdc-list-item .archived-questions-count'))[row];
  }

  waitForQuestions(): void {
    this.fixture.detectChanges();
    tick();
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
      idStr = this.component.texts[index].bookId;
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
  }

  setCurrentUser(currentUser: UserInfo): void {
    when(this.mockedUserService.currentUserId).thenReturn(currentUser.id);
  }

  private createQuestionListDoc(id: TextDocId, data: Question[]): QuestionListDoc {
    const adapter = new MemoryRealtimeDocAdapter(id.toString(), OTJson0.type, { questions: data });
    return new QuestionListDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private createCommentListDoc(id: TextDocId, data: Comment[]): CommentListDoc {
    const adapter = new MemoryRealtimeDocAdapter(id.toString(), OTJson0.type, { comments: data });
    return new CommentListDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private createProjectUserConfigDoc(projectUserConfig: SFProjectUserConfig): SFProjectUserConfigDoc {
    return new SFProjectUserConfigDoc(
      new MemoryRealtimeDocAdapter(`project01:${projectUserConfig.ownerRef}`, OTJson0.type, projectUserConfig),
      instance(this.mockedRealtimeOfflineStore)
    );
  }

  private createUser(id: string, role: string, nameConfirmed: boolean = true): UserInfo {
    return {
      id: 'user' + id,
      user: {
        displayName: 'User ' + id,
        isDisplayNameConfirmed: nameConfirmed
      },
      role
    };
  }
}
