import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AnswerStatus } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { Snapshot } from 'xforge-common/models/snapshot';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TypeRegistry } from 'xforge-common/type-registry';
import { QuestionDoc } from '../../core/models/question-doc';
import { CheckingQuestionsService, QuestionFilter } from './checking-questions.service';

describe('CheckingQuestionsService', () => {
  const questions: Partial<Snapshot<Question>>[] = [];
  const projectId: string = 'project1';

  // Matthew 1 - no answers
  for (let i = 0; i < 10; i++) {
    const date = new Date(2020, 0, 1, i, 0, 0).toISOString();
    const qId: string = `question-m1-${i}`;
    questions.push({
      id: getQuestionDocId(projectId, qId),
      data: {
        dataId: qId,
        projectRef: projectId,
        ownerRef: 'user-1',
        verseRef: {
          bookNum: 40,
          chapterNum: 1,
          verseNum: i + 1
        },
        text: `Question ${i + 1}`,
        isArchived: false,
        dateCreated: date,
        dateModified: date,
        answers: []
      }
    });
  }

  // Matthew 2 - has answers
  for (let i = 0; i < 10; i++) {
    const date = new Date(2020, 0, 1, i, 0, 0).toISOString();
    const qId: string = `question-m2-${i}`;
    questions.push({
      id: getQuestionDocId(projectId, qId),
      data: {
        dataId: qId,
        projectRef: projectId,
        ownerRef: 'user-1',
        verseRef: {
          bookNum: 40,
          chapterNum: 2,
          verseNum: i + 1
        },
        text: `Question ${i + 1}`,
        isArchived: false,
        dateCreated: date,
        dateModified: date,
        answers: [
          {
            dataId: `${qId}-a1`,
            ownerRef: 'ownerId',
            text: `answer${i}`,
            verseRef: { bookNum: 40, chapterNum: 2, verseNum: i + 1 },
            scriptureText: 'Quoted scripture',
            likes: [],
            dateCreated: date,
            dateModified: date,
            deleted: false,
            audioUrl: '/audio.mp3',
            comments: [],
            status: i % 3 === 0 ? AnswerStatus.None : i % 3 === 1 ? AnswerStatus.Exportable : AnswerStatus.Resolved
          }
        ]
      }
    });
  }

  // John 1 - no answers
  for (let i = 0; i < 10; i++) {
    const date = new Date(2020, 0, 1, i, 0, 0).toISOString();
    const qId: string = `question-j1-${i}`;
    questions.push({
      id: getQuestionDocId(projectId, qId),
      data: {
        dataId: qId,
        projectRef: projectId,
        ownerRef: 'user-1',
        verseRef: {
          bookNum: 43,
          chapterNum: 1,
          verseNum: i + 1
        },
        text: `Question ${i + 1}`,
        isArchived: false,
        dateCreated: date,
        dateModified: date,
        answers: []
      }
    });
  }

  // John 1 - no answers, archived
  for (let i = 0; i < 10; i++) {
    const date = new Date(2020, 0, 1, i, 0, 0).toISOString();
    const qId: string = `question-j1-archived-${i}`;
    questions.push({
      id: getQuestionDocId(projectId, qId),
      data: {
        dataId: qId,
        projectRef: projectId,
        ownerRef: 'user-1',
        verseRef: {
          bookNum: 43,
          chapterNum: 1,
          verseNum: i + 1
        },
        text: `Question ${i + 1}`,
        isArchived: true,
        dateCreated: date,
        dateModified: date,
        answers: []
      }
    });
  }

  // John 2 - has answers
  for (let i = 0; i < 10; i++) {
    const date = new Date(2020, 0, 1, i, 0, 0).toISOString();
    const qId: string = `question-j2-${i}`;
    questions.push({
      id: getQuestionDocId(projectId, qId),
      data: {
        dataId: qId,
        projectRef: projectId,
        ownerRef: 'user-1',
        verseRef: {
          bookNum: 43,
          chapterNum: 2,
          verseNum: i + 1
        },
        text: `Question ${i + 1}`,
        isArchived: false,
        dateCreated: date,
        dateModified: date,
        answers: [
          {
            dataId: `${qId}-a1`,
            ownerRef: 'ownerId',
            text: `answer${i}`,
            verseRef: { bookNum: 43, chapterNum: 2, verseNum: i + 1 },
            scriptureText: 'Quoted scripture',
            likes: [],
            dateCreated: date,
            dateModified: date,
            deleted: false,
            audioUrl: '/audio.mp3',
            comments: [],
            status: i % 3 === 0 ? AnswerStatus.None : i % 3 === 1 ? AnswerStatus.Exportable : AnswerStatus.Resolved
          }
        ]
      }
    });
  }

  let questionsService: CheckingQuestionsService;
  let realtimeService: TestRealtimeService;

  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(new TypeRegistry([QuestionDoc], [FileType.Audio], []))]
  }));

  beforeEach(() => {
    realtimeService = TestBed.inject(TestRealtimeService);
    realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, questions);
    questionsService = TestBed.inject(CheckingQuestionsService);
  });

  describe('queryQuestions', () => {
    interface QueryOptions {
      bookNum?: number;
      chapterNum?: number;
      activeOnly?: boolean;
      sort?: boolean;
    }

    it('should query all books and chapters', fakeAsync(async () => {
      const options: QueryOptions = {
        sort: true
      };

      const query: RealtimeQuery<QuestionDoc> = await questionsService.queryQuestions(
        projectId,
        options,
        noopDestroyRef
      );
      tick();
      expect(query.docs.length).toEqual(50);
      expect(query.docs[0].data!.dataId).toEqual('question-m1-0');
      expect(query.docs[49].data!.dataId).toEqual('question-j2-9');
    }));

    it('should query book only', fakeAsync(async () => {
      const options: QueryOptions = {
        bookNum: 40,
        activeOnly: true,
        sort: true
      };

      const query: RealtimeQuery<QuestionDoc> = await questionsService.queryQuestions(
        projectId,
        options,
        noopDestroyRef
      );
      tick();
      tick();
      expect(query.docs.length).toEqual(20);
      expect(query.docs[0].data!.dataId).toEqual('question-m1-0');
      expect(query.docs[19].data!.dataId).toEqual('question-m2-9');
    }));

    it('should query book and chapter', fakeAsync(async () => {
      const options: QueryOptions = {
        bookNum: 40,
        chapterNum: 1,
        activeOnly: true,
        sort: true
      };

      const query: RealtimeQuery<QuestionDoc> = await questionsService.queryQuestions(
        projectId,
        options,
        noopDestroyRef
      );
      tick();
      expect(query.docs.length).toEqual(10);
      expect(query.docs[0].data!.dataId).toEqual('question-m1-0');
      expect(query.docs[9].data!.dataId).toEqual('question-m1-9');
    }));

    it('should query active only', fakeAsync(async () => {
      const options: QueryOptions = {
        activeOnly: true,
        sort: true
      };

      const query: RealtimeQuery<QuestionDoc> = await questionsService.queryQuestions(
        projectId,
        options,
        noopDestroyRef
      );
      tick();
      expect(query.docs.length).toEqual(40);
      expect(query.docs[0].data!.dataId).toEqual('question-m1-0');
      expect(query.docs[39].data!.dataId).toEqual('question-j2-9');
      expect(query.docs.find(q => q.data!.dataId.startsWith('question-j1-archived'))).toBeUndefined();
    }));
  });

  describe('queryAdjacentQuestion', () => {
    it('should query the next question', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[0].data!,
        QuestionFilter.None,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m1-1');
    }));

    it('should query the previous question', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[1].data!,
        QuestionFilter.None,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m1-0');
    }));

    it('should query the next question in the next chapter', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[9].data!,
        QuestionFilter.None,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m2-0');
    }));

    it('should query the previous question in the previous chapter', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[10].data!,
        QuestionFilter.None,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m1-9');
    }));

    it('should query the next question in the next book', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[19].data!,
        QuestionFilter.None,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-j1-0');
    }));

    it('should query the previous question in the previous book', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[20].data!,
        QuestionFilter.None,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m2-9');
    }));

    it('should return empty array if there is no next question', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[49].data!,
        QuestionFilter.None,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs.length).toBe(0);
    }));

    it('should return empty array if there is no previous question', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[0].data!,
        QuestionFilter.None,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs.length).toBe(0);
    }));

    it('should query the next question in outside the current chapter with filter "HasAnswers"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[19].data!,
        QuestionFilter.HasAnswers,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-j2-0');
    }));

    it('should query the previous question in outside the current chapter with filter "HasAnswers"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[40].data!,
        QuestionFilter.HasAnswers,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m2-9');
    }));

    it('should query the next question in outside the current chapter with filter "NoAnswers"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[9].data!,
        QuestionFilter.NoAnswers,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-j1-0');
    }));

    it('should query the previous question in outside the current chapter with filter "NoAnswers"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[20].data!,
        QuestionFilter.NoAnswers,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m1-9');
    }));

    it('should query the next question in outside the current chapter with filter "StatusNone"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[19].data!,
        QuestionFilter.StatusNone,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-j2-0');
    }));

    it('should query the previous question in outside the current chapter with filter "StatusNone"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[40].data!,
        QuestionFilter.StatusNone,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m2-9');
    }));

    it('should query the next question in outside the current chapter with filter "StatusExport"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[17].data!,
        QuestionFilter.StatusExport,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-j2-1');
    }));

    it('should query the previous question in outside the current chapter with filter "StatusExport"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[41].data!,
        QuestionFilter.StatusExport,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m2-7');
    }));

    it('should query the next question in outside the current chapter with filter "StatusResolved"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[18].data!,
        QuestionFilter.StatusResolved,
        'next',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-j2-2');
    }));

    it('should query the previous question in outside the current chapter with filter "StatusResolved"', fakeAsync(async () => {
      const question: RealtimeQuery<QuestionDoc> = await questionsService.queryAdjacentQuestion(
        projectId,
        questions[42].data!,
        QuestionFilter.StatusResolved,
        'prev',
        noopDestroyRef
      );
      tick();
      expect(question.docs[0].data!.dataId).toEqual('question-m2-8');
    }));
  });
});
