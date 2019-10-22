import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { TestBed } from '@angular/core/testing';
import { getQuestionDocId, Question, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { of } from 'rxjs';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { TextsByBookId } from 'src/app/core/models/texts-by-book-id';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { QuestionDialogComponent, QuestionDialogData, QuestionDialogResult } from './question-dialog.component';
import { QuestionDialogService } from './question-dialog.service';

const mockedDialog = mock(MdcDialog);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('QuestionDialogService', () => {
  configureTestingModule(() => ({
    providers: [
      QuestionDialogService,
      { provide: MdcDialog, useMock: mockedDialog },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService }
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
    const config: QuestionDialogData = {
      question: undefined,
      textsByBookId: env.textsByBookId,
      projectId: env.PROJECT01
    };
    await env.service.questionDialog(config);
    verify(mockedProjectService.createQuestion(env.PROJECT01, anything())).once();
    expect().nothing();
  });

  it('should not add a question if cancelled', async () => {
    const env = new TestEnvironment();
    when(env.mockedDialogRef.afterClosed()).thenReturn(of('close'));
    const config: QuestionDialogData = {
      question: undefined,
      textsByBookId: env.textsByBookId,
      projectId: env.PROJECT01
    };
    await env.service.questionDialog(config);
    verify(mockedProjectService.createQuestion(env.PROJECT01, anything())).never();
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
    const config: QuestionDialogData = {
      question: undefined,
      textsByBookId: env.textsByBookId,
      projectId: env.PROJECT01
    };
    when(mockedProjectService.onlineUploadAudio(env.PROJECT01, anything(), anything())).thenResolve('aFileName.mp3');
    await env.service.questionDialog(config);
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
    const config: QuestionDialogData = {
      question: newQuestion,
      textsByBookId: env.textsByBookId,
      projectId: env.PROJECT01
    };
    await env.service.questionDialog(config, questionDoc);
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
    const config: QuestionDialogData = {
      question: newQuestion,
      textsByBookId: env.textsByBookId,
      projectId: env.PROJECT01
    };
    await env.service.questionDialog(config, questionDoc);
    expect(questionDoc!.data!.audioUrl).toBeUndefined();
    verify(mockedProjectService.onlineDeleteAudio(env.PROJECT01, anything(), anything()));
  });
});

class TestEnvironment {
  readonly service: QuestionDialogService;
  readonly mockedDialogRef: MdcDialogRef<QuestionDialogComponent, QuestionDialogResult | 'close'> = mock(MdcDialogRef);
  textsByBookId: TextsByBookId;
  matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [{ number: 1, lastVerse: 25 }, { number: 3, lastVerse: 17 }]
  };
  readonly PROJECT01: string = 'project01';
  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor() {
    this.service = TestBed.get(QuestionDialogService);
    this.textsByBookId = { ['MAT']: this.matthewText };

    when(mockedDialog.open(anything(), anything())).thenReturn(instance(this.mockedDialogRef));
    when(mockedUserService.currentUserId).thenReturn('user01');
  }

  addQuestion(question: Question): QuestionDoc {
    this.realtimeService.addSnapshot<Question>(QUESTIONS_COLLECTION, {
      id: getQuestionDocId('project01', question.dataId),
      data: question
    });
    return this.realtimeService.get(QUESTIONS_COLLECTION, getQuestionDocId(this.PROJECT01, question.dataId));
  }
}
