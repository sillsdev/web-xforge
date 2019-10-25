import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { TestBed } from '@angular/core/testing';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { getQuestionDocId, Question, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { QuestionDialogComponent, QuestionDialogData, QuestionDialogResult } from './question-dialog.component';
import { QuestionDialogService } from './question-dialog.service';

const mockedDialog = mock(MdcDialog);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);

describe('QuestionDialogService', () => {
  configureTestingModule(() => ({
    providers: [
      QuestionDialogService,
      { provide: MdcDialog, useMock: mockedDialog },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService }
    ]
  }));

  it('should add a question', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question added',
      verseRef: VerseRef.parse('MAT 1:3'),
      audio: {}
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedProjectService.createQuestion(env.PROJECT01, anything())).once();
    expect().nothing();
  });

  it('should not add a question if cancelled', async () => {
    const env = new TestEnvironment();
    when(env.mockedDialogRef.afterClosed()).thenReturn(of('close'));
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedProjectService.createQuestion(env.PROJECT01, anything())).never();
    expect().nothing();
  });

  it('should not create question if user does not have permission', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'This question is added just as user role is changed',
      verseRef: VerseRef.parse('MAT 1:3'),
      audio: {}
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    env.updateUserRole(SFProjectRole.CommunityChecker);
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedProjectService.createQuestion(env.PROJECT01, anything())).never();
    verify(mockedNoticeService.show(anything())).once();
    expect().nothing();
  });

  it('uploads audio when provided', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question added',
      verseRef: VerseRef.parse('MAT 1:3'),
      audio: { fileName: 'someFileName.mp3', blob: new Blob() }
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    when(mockedProjectService.onlineUploadAudio(env.PROJECT01, anything(), anything())).thenResolve('aFileName.mp3');
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedProjectService.createQuestion(env.PROJECT01, anything())).once();
    verify(mockedProjectService.onlineUploadAudio('project01', anything(), anything())).once();
    expect().nothing();
  });

  it('edits a question', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question edited',
      verseRef: VerseRef.parse('MAT 1:3'),
      audio: {}
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    const date = new Date().toJSON();
    const newQuestion: Question = {
      dataId: 'q1Id',
      text: 'question to be edited',
      verseRef: fromVerseRef(VerseRef.parse('MAT 1:3')),
      answers: [],
      isArchived: false,
      ownerRef: 'ownerId',
      projectRef: env.PROJECT01,
      dateCreated: date,
      dateModified: date
    };
    const questionDoc = env.addQuestion(newQuestion);
    expect(questionDoc!.data!.text).toBe('question to be edited');
    await env.service.questionDialog(env.getQuestionDialogData(newQuestion), questionDoc);
    expect(questionDoc!.data!.text).toBe('question edited');
  });

  it('removes audio if audio deleted', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question edited',
      verseRef: VerseRef.parse('MAT 1:3'),
      audio: { status: 'reset' }
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    const date = new Date().toJSON();
    const newQuestion: Question = {
      dataId: 'q1Id',
      text: 'question with audio',
      verseRef: fromVerseRef(VerseRef.parse('MAT 1:3')),
      answers: [],
      isArchived: false,
      audioUrl: 'anAudioFile.mp3',
      ownerRef: 'ownerId',
      projectRef: env.PROJECT01,
      dateCreated: date,
      dateModified: date
    };
    const questionDoc = env.addQuestion(newQuestion);
    expect(questionDoc!.data!.audioUrl).toBe('anAudioFile.mp3');
    await env.service.questionDialog(env.getQuestionDialogData(newQuestion), questionDoc);
    expect(questionDoc!.data!.audioUrl).toBeUndefined();
    verify(mockedProjectService.onlineDeleteAudio(env.PROJECT01, anything(), anything()));
  });
});

interface UserInfo {
  id: string;
  role: string;
}

class TestEnvironment {
  readonly service: QuestionDialogService;
  readonly mockedDialogRef: MdcDialogRef<QuestionDialogComponent, QuestionDialogResult | 'close'> = mock(MdcDialogRef);
  textsByBookId: TextsByBookId;
  matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [{ number: 1, lastVerse: 25, isValid: true }, { number: 3, lastVerse: 17, isValid: true }]
  };
  readonly PROJECT01: string = 'project01';
  adminUser: UserInfo = { id: 'user01', role: SFProjectRole.ParatextAdministrator };

  private testProject: SFProject = {
    paratextId: 'pt01',
    shortName: 'P01',
    name: 'Project 01',
    writingSystem: { tag: 'en' },
    translateConfig: { translationSuggestionsEnabled: false },
    checkingConfig: {
      usersSeeEachOthersResponses: true,
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone
    },
    texts: [this.matthewText],
    sync: { queuedCount: 0 },
    userRoles: {
      [this.adminUser.id]: this.adminUser.role
    }
  };
  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor() {
    this.service = TestBed.get(QuestionDialogService);
    this.textsByBookId = { ['MAT']: this.matthewText };

    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: this.PROJECT01,
      data: this.testProject
    });

    when(mockedDialog.open(anything(), anything())).thenReturn(instance(this.mockedDialogRef));
    when(mockedUserService.currentUserId).thenReturn(this.adminUser.id);
    when(mockedProjectService.get(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id)
    );
  }

  addQuestion(question: Question): QuestionDoc {
    this.realtimeService.addSnapshot<Question>(QUESTIONS_COLLECTION, {
      id: getQuestionDocId(this.PROJECT01, question.dataId),
      data: question
    });
    return this.realtimeService.get(QUESTIONS_COLLECTION, getQuestionDocId(this.PROJECT01, question.dataId));
  }

  getQuestionDialogData(question?: Question): QuestionDialogData {
    return { question: question, textsByBookId: this.textsByBookId, projectId: this.PROJECT01 };
  }

  updateUserRole(role: string) {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, this.PROJECT01);
    const userRole = projectDoc.data!.userRoles;
    userRole[this.adminUser.id] = role;
    projectDoc.submitJson0Op(op => {
      op.set(p => p.userRoles, userRole);
    }, false);
  }
}
