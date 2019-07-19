import { MdcDialog, MdcDialogModule, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
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
import { MapQueryResults } from 'xforge-common/json-api.service';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { User } from 'xforge-common/models/user';
import { NoticeService } from 'xforge-common/notice.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { Comment } from '../../core/models/comment';
import { CommentListDoc } from '../../core/models/comment-list-doc';
import { Question } from '../../core/models/question';
import { QuestionListDoc } from '../../core/models/question-list-doc';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectData } from '../../core/models/sfproject-data';
import { SFProjectDataDoc } from '../../core/models/sfproject-doc';
import { SFProjectRoles } from '../../core/models/sfproject-roles';
import { SFProjectUser, SFProjectUserRef } from '../../core/models/sfproject-user';
import { TextDocId } from '../../core/models/text-doc-id';
import { TextInfo } from '../../core/models/text-info';
import { SFProjectService } from '../../core/sfproject.service';
import { CheckingModule } from '../checking.module';
import { QuestionDialogComponent } from '../question-dialog/question-dialog.component';
import { CheckingOverviewComponent } from './checking-overview.component';

describe('CheckingOverviewComponent', () => {
  describe('Add Question', () => {
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

    it('should disable "Add question" button when loading', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(true);
    }));

    it('should open dialog when "Add question" button is clicked', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.waitForQuestions();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(false);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
    }));

    it('should not add a question if cancelled', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.waitForQuestions();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(false);
      verify(env.mockedProjectService.getQuestionList(anything())).twice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).never();
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
      expect(env.addQuestionButton.nativeElement.disabled).toBe(false);
      verify(env.mockedProjectService.getQuestionList(anything())).twice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).once();
    }));
  });

  describe('Edit Question', () => {
    it('should expand/collapse questions in book text', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.questionEdits.length).toEqual(0);
      expect(env.component.itemVisible[id.toString()]).toBeFalsy();
      expect(env.component.questionListDocs[id.toString()].data.length).toBeGreaterThan(0);
      expect(env.component.questionCount(id.bookId, id.chapter)).toBeGreaterThan(0);

      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(3);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(5);
      expect(env.questionEdits.length).toEqual(2);

      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(3);
      expect(env.questionEdits.length).toEqual(0);
      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(2);
    }));

    it('should edit question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 3:3',
          scriptureEnd: '',
          text: '',
          audio: { fileName: '' }
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(5);
      expect(env.questionEdits.length).toEqual(2);
      verify(env.mockedProjectService.getQuestionList(anything())).twice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.questionEdits[0]);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionList(anything())).never();
    }));
  });

  describe('for Reviewer', () => {
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
      const text = env.setupReviewerForum();
      env.waitForQuestions();
      const [unread, read, answered] = env.component.bookProgress(text);
      expect(unread).toBe(3);
      expect(read).toBe(2);
      expect(answered).toBe(1);
      expect(env.component.allQuestionsCount).toBe('9');
      expect(env.component.myAnswerCount).toBe('1');
      expect(env.component.myCommentCount).toBe('2');
      expect(env.component.myLikeCount).toBe('3');
    }));

    it('should calculate the right stats for project admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.adminUser);
      env.setupReviewerForum();
      env.waitForQuestions();
      expect(env.component.allQuestionsCount).toBe('9');
      expect(env.component.myAnswerCount).toBe('3');
      expect(env.component.myCommentCount).toBe('3');
      expect(env.component.myLikeCount).toBe('4');
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

  private testAdminProjectUser: SFProjectUser = new SFProjectUser({
    id: this.adminUser.id,
    userRef: this.adminUser.id,
    role: this.adminUser.role,
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  });
  private testReviewerProjectUser: SFProjectUser = new SFProjectUser({
    id: this.reviewerUser.id,
    userRef: this.reviewerUser.id,
    role: this.reviewerUser.role,
    questionRefsRead: ['q1Id', 'q2Id', 'q3Id'],
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
    users: [new SFProjectUserRef(this.adminUser.id), new SFProjectUserRef(this.reviewerUser.id)]
  });

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(this.mockedMdcDialog.open(anything(), anything())).thenReturn(instance(this.mockedQuestionDialogRef));
    const projectData: SFProjectData = {
      texts: [
        { bookId: 'MAT', name: 'Matthew', chapters: [{ number: 1, lastVerse: 25 }] },
        { bookId: 'LUK', name: 'Luke', chapters: [{ number: 1, lastVerse: 80 }] }
      ]
    };
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, 'project01', projectData);
    const projectDataDoc = new SFProjectDataDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedProjectService.getDataDoc('project01')).thenResolve(projectDataDoc);
    when(this.mockedProjectService.get('project01', deepEqual([[nameof<SFProject>('users')]]))).thenReturn(
      of(new MapQueryResults(this.testProject, undefined, [this.testAdminProjectUser, this.testReviewerProjectUser]))
    );

    const text1_1id = new TextDocId('project01', 'MAT', 1);
    when(this.mockedProjectService.getQuestionList(deepEqual(text1_1id))).thenResolve(
      this.createQuestionsDoc(text1_1id, [
        { id: 'q1Id', ownerRef: undefined, text: 'Book 1, Q1 text' },
        { id: 'q2Id', ownerRef: undefined, text: 'Book 1, Q2 text' }
      ])
    );
    const text1_3id = new TextDocId('project01', 'MAT', 3);
    when(this.mockedProjectService.getQuestionList(deepEqual(text1_3id))).thenResolve(
      this.createQuestionsDoc(text1_3id, [])
    );
    const text2_1id = new TextDocId('project01', 'LUK', 1);
    when(this.mockedProjectService.getQuestionList(deepEqual(text2_1id))).thenResolve(
      this.createQuestionsDoc(text2_1id, [{ id: 'q3Id', ownerRef: undefined, text: 'Book 2, Q3 text' }])
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

  get textRows(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-list-item'));
  }

  get questionEdits(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-list-item button'));
  }

  get overallProgressChart(): DebugElement {
    return this.fixture.debugElement.query(By.css('#overall-progress-chart'));
  }

  get reviewerQuestionPanel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#reviewer-question-panel'));
  }

  waitForQuestions(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  /**
   * simulate row click since actually clicking on the row doesn't fire the selectionChange event
   */
  simulateRowClick(index: number, id?: TextDocId): void {
    let idStr: string;
    if (id) {
      idStr = id.toString();
    } else {
      idStr = this.component.texts[index].bookId;
    }
    this.component.itemVisible[idStr] = !this.component.itemVisible[idStr];
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

  setupReviewerForum(): TextInfo {
    const projectId = 'project01';
    const bookId = 'BK1';
    const chapterNumber = 1;
    const currentUserId = this.reviewerUser.id;
    const anotherUserId = 'anotherUserId';
    const ownerRef = this.adminUser.id;
    const textId = new TextDocId(projectId, bookId, chapterNumber);
    this.component.questionListDocs[textId.toString()] = this.createQuestionsDoc(textId, [
      {
        id: 'q1Id',
        ownerRef,
        text: 'Book 1, Q1 text',
        answers: [
          {
            id: 'a1Id',
            ownerRef: currentUserId,
            likes: [{ ownerRef: currentUserId }, { ownerRef: anotherUserId }],
            dateCreated: '',
            dateModified: ''
          }
        ]
      },
      {
        id: 'q2Id',
        ownerRef,
        text: 'Book 1, Q2 text',
        answers: [
          {
            id: 'a2Id',
            ownerRef: anotherUserId,
            likes: [{ ownerRef: currentUserId }],
            dateCreated: '',
            dateModified: ''
          }
        ]
      },
      {
        id: 'q3Id',
        ownerRef,
        text: 'Book 1, Q3 text',
        answers: [
          {
            id: 'a2Id',
            ownerRef: anotherUserId,
            likes: [{ ownerRef: currentUserId }],
            dateCreated: '',
            dateModified: ''
          }
        ]
      },
      { id: 'q4Id', ownerRef, text: 'Book 1, Q4 text' },
      { id: 'q5Id', ownerRef, text: 'Book 1, Q5 text' },
      { id: 'q6Id', ownerRef, text: 'Book 1, Q6 text' }
    ]);
    this.component.commentListDocs[textId.toString()] = this.createCommentsDoc(textId, [
      { id: 'c1Id', ownerRef: currentUserId, projectRef: projectId, dateCreated: '', dateModified: '' },
      { id: 'c2Id', ownerRef: currentUserId, projectRef: projectId, dateCreated: '', dateModified: '' },
      { id: 'c3Id', ownerRef: anotherUserId, projectRef: projectId, dateCreated: '', dateModified: '' }
    ]);

    return { bookId, chapters: [{ number: chapterNumber }] };
  }

  private createQuestionsDoc(id: TextDocId, data: Question[]): QuestionListDoc {
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, id.toString(), data);
    return new QuestionListDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private createCommentsDoc(id: TextDocId, data: Comment[]): CommentListDoc {
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, id.toString(), data);
    return new CommentListDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }

  private createUser(id: string, role: string, nameConfirmed: boolean = true): UserInfo {
    return {
      id: 'user' + id,
      user: {
        name: 'User ' + id,
        isNameConfirmed: nameConfirmed
      },
      role
    };
  }
}
