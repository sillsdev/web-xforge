import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { VerseRef } from '@sillsdev/scripture';
import {
  getQuestionDocId,
  Question,
  QUESTIONS_COLLECTION
} from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingQuestionsService } from '../checking/checking-questions.service';
import { QuestionDialogComponent, QuestionDialogData, QuestionDialogResult } from './question-dialog.component';
import { QuestionDialogService } from './question-dialog.service';

const mockedDialogService = mock(DialogService);
const mockedProjectService = mock(SFProjectService);
const mockedQuestionsService = mock(CheckingQuestionsService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedFileService = mock(FileService);

describe('QuestionDialogService', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: DialogService, useMock: mockedDialogService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: CheckingQuestionsService, useMock: mockedQuestionsService },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService }
    ]
  }));

  it('should add a question', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question added',
      verseRef: new VerseRef('MAT 1:3'),
      audio: {}
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedQuestionsService.createQuestion(env.PROJECT01, anything(), undefined, undefined)).once();
    expect().nothing();
  });

  it('should not add a question if cancelled', async () => {
    const env = new TestEnvironment();
    when(env.mockedDialogRef.afterClosed()).thenReturn(of('close'));
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedQuestionsService.createQuestion(env.PROJECT01, anything())).never();
    expect().nothing();
  });

  it('should not create question if user does not have permission', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'This question is added just as user role is changed',
      verseRef: new VerseRef('MAT 1:3'),
      audio: {}
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    env.updateUserRole(SFProjectRole.CommunityChecker);
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedQuestionsService.createQuestion(env.PROJECT01, anything())).never();
    verify(mockedNoticeService.show('question_dialog.add_question_denied')).once();
    expect().nothing();
  });

  it('uploads audio when provided', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question added',
      verseRef: new VerseRef('MAT 1:3'),
      audio: { fileName: 'someFileName.mp3', blob: new Blob() }
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    await env.service.questionDialog(env.getQuestionDialogData());
    verify(mockedQuestionsService.createQuestion(env.PROJECT01, anything(), 'someFileName.mp3', anything())).once();
    expect().nothing();
  });

  it('edits a question', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question edited',
      verseRef: new VerseRef('MAT 1:3'),
      audio: {}
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    const questionDoc = env.addQuestion(env.getNewQuestion());
    expect(questionDoc!.data!.text).toBe('question to be edited');
    await env.service.questionDialog(env.getQuestionDialogData(questionDoc));
    expect(questionDoc!.data!.text).toBe('question edited');
  });

  it('discards changes if failed to upload or store the audio', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question added',
      verseRef: new VerseRef('MAT 1:3'),
      audio: { fileName: 'someFileName.mp3', blob: new Blob() }
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    when(
      mockedFileService.uploadFile(
        FileType.Audio,
        env.PROJECT01,
        QuestionDoc.COLLECTION,
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).thenResolve(undefined);
    const questionDoc = env.addQuestion(env.getNewQuestion());
    const editedQuestion = await env.service.questionDialog(env.getQuestionDialogData(questionDoc));
    expect(editedQuestion).toBeUndefined();
  });

  it('removes audio if audio deleted', async () => {
    const env = new TestEnvironment();
    const result: QuestionDialogResult = {
      text: 'question edited',
      verseRef: new VerseRef('MAT 1:3'),
      audio: { status: 'reset' }
    };
    when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    const audioUrl = 'anAudioFile.mp3';
    const questionDoc = env.addQuestion(env.getNewQuestion(audioUrl));
    expect(questionDoc!.data!.audioUrl).toBe(audioUrl);
    await env.service.questionDialog(env.getQuestionDialogData(questionDoc));
    expect(questionDoc!.data!.audioUrl).toBeUndefined();
    verify(mockedFileService.deleteFile(FileType.Audio, env.PROJECT01, QuestionDoc.COLLECTION, anything(), anything()));
  });
});

interface UserInfo {
  id: string;
  role: string;
}

class TestEnvironment {
  readonly service: QuestionDialogService;
  readonly mockedDialogRef = mock<MatDialogRef<QuestionDialogComponent, QuestionDialogResult | 'close'>>(MatDialogRef);
  textsByBookId: TextsByBookId;
  projectProfileDoc: SFProjectProfileDoc;
  matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [
      { number: 1, lastVerse: 25, isValid: true, permissions: {} },
      { number: 3, lastVerse: 17, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  readonly PROJECT01: string = 'project01';
  adminUser: UserInfo = { id: 'user01', role: SFProjectRole.ParatextAdministrator };

  private testProjectProfile: SFProjectProfile = createTestProjectProfile({
    texts: [this.matthewText],
    userRoles: {
      [this.adminUser.id]: this.adminUser.role
    }
  });
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.service = TestBed.inject(QuestionDialogService);
    this.textsByBookId = { ['MAT']: this.matthewText };

    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: this.PROJECT01,
      data: this.testProjectProfile
    });
    this.projectProfileDoc = this.realtimeService.get<SFProjectProfileDoc>(
      SFProjectProfileDoc.COLLECTION,
      this.PROJECT01
    );

    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(this.mockedDialogRef));
    when(mockedUserService.currentUserId).thenReturn(this.adminUser.id);
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );
  }

  addQuestion(question: Question): QuestionDoc {
    this.realtimeService.addSnapshot<Question>(QUESTIONS_COLLECTION, {
      id: getQuestionDocId(this.PROJECT01, question.dataId),
      data: question
    });
    return this.realtimeService.get(QUESTIONS_COLLECTION, getQuestionDocId(this.PROJECT01, question.dataId));
  }

  getNewQuestion(audioUrl?: string): Question {
    const date = new Date().toJSON();
    return {
      dataId: 'q1Id',
      text: 'question to be edited',
      verseRef: fromVerseRef(new VerseRef('MAT 1:3')),
      answers: [],
      isArchived: false,
      audioUrl: audioUrl,
      ownerRef: 'ownerId',
      projectRef: this.PROJECT01,
      dateCreated: date,
      dateModified: date
    };
  }

  getQuestionDialogData(questionDoc?: QuestionDoc): QuestionDialogData {
    return {
      questionDoc,
      projectDoc: this.projectProfileDoc,
      textsByBookId: this.textsByBookId,
      projectId: this.PROJECT01
    };
  }

  updateUserRole(role: string): void {
    const projectProfileDoc = this.realtimeService.get<SFProjectProfileDoc>(
      SFProjectProfileDoc.COLLECTION,
      this.PROJECT01
    );
    const userRole = projectProfileDoc.data!.userRoles;
    userRole[this.adminUser.id] = role;
    projectProfileDoc.submitJson0Op(op => {
      op.set(p => p.userRoles, userRole);
    }, false);
  }
}
