import { MdcDialog, MdcDialogModule, MdcDialogRef } from '@angular-mdc/web';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ngfModule } from 'angular-file';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { getQuestionDocId, Question, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { of } from 'rxjs';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingModule } from '../checking.module';
import { QuestionAnsweredDialogComponent } from '../question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogComponent } from '../question-dialog/question-dialog.component';
import { CheckingOverviewComponent } from './checking-overview.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedMdcDialog = mock(MdcDialog);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedAuthService = mock(AuthService);

describe('CheckingOverviewComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: MdcDialog, useMock: mockedMdcDialog },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: AuthService, useMock: mockedAuthService }
    ]
  }));

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
      env.setCurrentUser(env.checkerUser);
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
      verify(mockedMdcDialog.open(anything(), anything())).once();
      expect().nothing();
    }));

    it('should not add a question if cancelled', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.waitForQuestions();

      resetCalls(mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(mockedMdcDialog.open(anything(), anything())).once();
      expect().nothing();
    }));

    it('should add a question if requested', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          verseRef: VerseRef.parse('MAT 3:3'),
          text: '',
          audio: { fileName: '' }
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(3);

      resetCalls(mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(mockedMdcDialog.open(anything(), anything())).once();
      const id = new TextDocId('project01', 40, 3);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(5);
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

    it('should edit question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          verseRef: VerseRef.parse('MAT 1:3'),
          text: '',
          audio: {}
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);

      resetCalls(mockedProjectService);
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedMdcDialog.open(anything(), anything())).once();
    }));

    it('allows editing scripture reference', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          verseRef: VerseRef.parse('MAT 3:3'),
          text: 'scripture reference moved to chapter 3',
          audio: {}
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      const mat3Id = new TextDocId('project01', 40, 3);

      resetCalls(mockedProjectService);
      expect(env.questionEditButtons.length).toEqual(6);
      env.clickElement(env.questionEditButtons[0]);
      env.fixture.detectChanges();
      expect(env.questionEditButtons.length).toEqual(5);
      env.simulateRowClick(1, mat3Id);
      expect(env.textRows.length).toEqual(10);
    }));

    it('should bring up question dialog only if user confirms question answered dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      // Edit a question with no answers
      env.clickElement(env.questionEditButtons[3]);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).never();
      verify(mockedMdcDialog.open(QuestionDialogComponent, anything())).once();
      resetCalls(mockedMdcDialog);
      when(env.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('close'));
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          verseRef: VerseRef.parse('MAT 1:3'),
          text: 'Book 1, Q1 Text',
          audio: {}
        })
      );
      // Edit a question with answers
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).once();
      verify(mockedMdcDialog.open(QuestionDialogComponent, anything())).never();
      when(env.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('accept'));
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).twice();
      verify(mockedMdcDialog.open(QuestionDialogComponent, anything())).once();
      expect().nothing();
    }));

    it('should remove audio file when reset', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          verseRef: VerseRef.parse('MAT 1:3'),
          text: 'Book 1, Q1 text',
          audio: { status: 'reset' }
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionEditButtons.length).toEqual(6);

      resetCalls(mockedProjectService);
      env.clickElement(env.questionEditButtons[0]);
      verify(mockedMdcDialog.open(anything(), anything())).once();
      verify(mockedProjectService.onlineDeleteAudio('project01', 'q1Id', env.adminUser.id)).once();
    }));
  });

  describe('for Reviewer', () => {
    it('should display "No question" message', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser(env.checkerUser);
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
        chapters: [{ number: 1, lastVerse: 3 }]
      });
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
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      expect(env.noArchivedQuestionsLabel).toBeNull();

      env.simulateRowClick(0, undefined, true);
      env.simulateRowClick(1, id, true);
      env.clickElement(env.questionPublishButtons[0]);
      expect(env.noArchivedQuestionsLabel).not.toBeNull();
    }));

    it('archives and republishes a question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 40, 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountByRow(0).nativeElement.textContent).toContain('1 questions');
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(9);
      expect(env.questionArchiveButtons.length).toEqual(6);
      env.clickElement(env.questionArchiveButtons[0]);
      expect(env.textArchivedRows.length).toEqual(1);
      expect(env.getArchivedQuestionsCountByRow(0).nativeElement.textContent).toContain('2 questions');
      expect(env.textRows.length).toEqual(8);

      // Re-publish a question that has been archived
      env.simulateRowClick(0, undefined, true);
      env.simulateRowClick(1, id, true);
      const archivedQuestion: HTMLElement = env.archivedQuestionDates[0].nativeElement;
      expect(archivedQuestion.textContent).toBe('Archived less than a minute ago');
      env.clickElement(env.questionPublishButtons[0]);
      expect(env.textArchivedRows.length).toEqual(3);
      expect(env.getArchivedQuestionsCountByRow(0).nativeElement.textContent).toContain('1 questions');
      expect(env.textRows.length).toEqual(9);
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
  imports: [MdcDialogModule, NoopAnimationsModule, UICommonModule, ngfModule, CheckingModule],
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

  readonly mockedQuestionDialogRef: MdcDialogRef<QuestionDialogComponent> = mock(MdcDialogRef);
  readonly mockedAnsweredDialogRef: MdcDialogRef<QuestionAnsweredDialogComponent> = mock(MdcDialogRef);

  adminUser = this.createUser('01', SFProjectRole.ParatextAdministrator);
  checkerUser = this.createUser('02', SFProjectRole.CommunityChecker);

  private adminProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.adminUser.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: []
  };
  private reviewerProjectUserConfig: SFProjectUserConfig = {
    ownerRef: this.checkerUser.id,
    projectRef: 'project01',
    isTargetTextRight: true,
    confidenceThreshold: 0.2,
    translationSuggestionsEnabled: true,
    selectedSegment: '',
    questionRefsRead: ['q1Id', 'q2Id', 'q3Id'],
    answerRefsRead: [],
    commentRefsRead: []
  };
  private testProject: SFProject = {
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
      translationSuggestionsEnabled: false
    },
    sync: { queuedCount: 0 },
    texts: [
      {
        bookNum: 40,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 25 }, { number: 3, lastVerse: 17 }]
      },
      { bookNum: 42, hasSource: false, chapters: [{ number: 1, lastVerse: 80 }] }
    ],
    userRoles: {
      [this.adminUser.id]: this.adminUser.role,
      [this.checkerUser.id]: this.checkerUser.role
    }
  };
  private readonly anotherUserId = 'anotherUserId';
  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor() {
    this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, [
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
    this.realtimeService.addSnapshots<SFProject>(SFProjectDoc.COLLECTION, [
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
      }
    ]);

    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedMdcDialog.open(QuestionDialogComponent, anything())).thenReturn(instance(this.mockedQuestionDialogRef));
    when(mockedMdcDialog.open(QuestionAnsweredDialogComponent)).thenReturn(instance(this.mockedAnsweredDialogRef));
    when(this.mockedAnsweredDialogRef.afterClosed()).thenReturn(of('accept'));
    when(mockedProjectService.get(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id)
    );
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((id, userId) =>
      this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId))
    );
    when(mockedProjectService.queryQuestions('project01')).thenCall(() =>
      this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, {})
    );
    when(mockedProjectService.createQuestion(anything(), anything())).thenCall((id, newQuestion) =>
      this.realtimeService.create<QuestionDoc>(
        QuestionDoc.COLLECTION,
        getQuestionDocId(id, newQuestion.dataId),
        newQuestion
      )
    );
    this.setCurrentUser(this.adminUser);

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

  get likePanel(): DebugElement {
    return this.fixture.debugElement.query(By.css('.reviewer-panels .card .card-content-like'));
  }

  getArchivedQuestionsCountByRow(row: number): DebugElement {
    return this.archivedQuestions.queryAll(By.css('mdc-list-item .archived-questions-count'))[row];
  }

  waitForQuestions(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  setSeeOtherUserResponses(isEnabled: boolean): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(
      op => op.set<boolean>(p => p.checkingConfig.usersSeeEachOthersResponses, isEnabled),
      false
    );
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
