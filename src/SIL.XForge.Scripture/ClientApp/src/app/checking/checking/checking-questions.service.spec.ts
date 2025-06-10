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
import { UserService } from 'xforge-common/user.service';
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
  let mockUserService: { currentUserId: string };

  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(new TypeRegistry([QuestionDoc], [FileType.Audio], []))]
  }));

  beforeEach(() => {
    mockUserService = { currentUserId: 'ownerId' };
    TestBed.overrideProvider(UserService, { useValue: mockUserService });

    realtimeService = TestBed.inject(TestRealtimeService);
    realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, JSON.parse(JSON.stringify(questions)));
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

    describe('with CurrentUserHasAnswered filter', () => {
      it('should find next question answered by current user, skipping unanswered', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          questions.find(q => q.data?.dataId === 'question-m1-8')!.data!, // M1:8 (no answers)
          QuestionFilter.CurrentUserHasAnswered,
          'next',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-m2-0'); // M2:0 (answered by 'ownerId')
      }));

      it('should find previous question answered by current user, skipping unanswered', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          questions.find(q => q.data?.dataId === 'question-j1-0')!.data!, // J1:0 (no answers)
          QuestionFilter.CurrentUserHasAnswered,
          'prev',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-m2-9'); // M2:9 (answered by 'ownerId')
      }));

      it('should find immediate next question if answered by current user', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          questions.find(q => q.data?.dataId === 'question-m2-0')!.data!, // M2:0 (answered by 'ownerId')
          QuestionFilter.CurrentUserHasAnswered,
          'next',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-m2-1'); // M2:1 (answered by 'ownerId')
      }));

      it('should return empty if no further questions are answered by current user (next)', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          questions.find(q => q.data?.dataId === 'question-j2-9')!.data!, // J2:9 (last question answered by 'ownerId')
          QuestionFilter.CurrentUserHasAnswered,
          'next',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(0);
      }));

      it('should return empty if no prior questions are answered by current user (prev)', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          questions.find(q => q.data?.dataId === 'question-m2-0')!.data!, // M2:0 (first question answered by 'ownerId')
          QuestionFilter.CurrentUserHasAnswered,
          'prev',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(0); // M1 questions have no answers
      }));
    });

    describe('with CurrentUserHasNotAnswered filter', () => {
      const testUserId = 'testUser01';
      let modifiedQuestionsView: Partial<Snapshot<Question>>[];

      beforeEach(() => {
        modifiedQuestionsView = JSON.parse(JSON.stringify(questions));

        const q_m2_5_data = modifiedQuestionsView.find(q => q.data?.dataId === 'question-m2-5')?.data;
        if (q_m2_5_data?.answers) {
          q_m2_5_data.answers.push({
            dataId: `question-m2-5-ansByTestUser`,
            ownerRef: testUserId,
            text: `answer by testUser for M2:5`,
            verseRef: { bookNum: 40, chapterNum: 2, verseNum: 6 },
            scriptureText: 'Quoted scripture',
            likes: [],
            dateCreated: new Date().toISOString(),
            dateModified: new Date().toISOString(),
            deleted: false,
            comments: [],
            status: AnswerStatus.None
          });
        }

        const q_m2_6_data = modifiedQuestionsView.find(q => q.data?.dataId === 'question-m2-6')?.data;
        if (q_m2_6_data) {
          q_m2_6_data.answers = [
            {
              dataId: `question-m2-6-ansByTestUser`,
              ownerRef: testUserId,
              text: `answer by testUser for M2:6`,
              verseRef: { bookNum: 40, chapterNum: 2, verseNum: 7 },
              scriptureText: 'Quoted scripture',
              likes: [],
              dateCreated: new Date().toISOString(),
              dateModified: new Date().toISOString(),
              deleted: false,
              comments: [],
              status: AnswerStatus.None
            }
          ];
        }

        realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, modifiedQuestionsView);
        mockUserService.currentUserId = testUserId;
      });

      it('should find next question not answered by current user, skipping those answered by them', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          modifiedQuestionsView.find(q => q.data?.dataId === 'question-m2-4')!.data!, // M2:4 (by 'ownerId')
          QuestionFilter.CurrentUserHasNotAnswered,
          'next',
          noopDestroyRef
        );
        tick();
        // M2:5 is answered by ownerId and testUserId (skip)
        // M2:6 is answered by testUserId (skip)
        // M2:7 is answered by ownerId (select)
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-m2-7');
      }));

      it('should find previous question not answered by current user, skipping those answered by them', fakeAsync(async () => {
        // Start at M2:8 (by 'ownerId'). Prev should be M2:7 (by 'ownerId').
        // M2:6 (by testUserId) and M2:5 (by testUserId and ownerId) should be skipped if we started later.
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          modifiedQuestionsView.find(q => q.data?.dataId === 'question-m2-8')!.data!,
          QuestionFilter.CurrentUserHasNotAnswered,
          'prev',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-m2-7'); // M2:7 (by 'ownerId')
      }));

      it('should find next question with no answers at all', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          modifiedQuestionsView.find(q => q.data?.dataId === 'question-m2-9')!.data!, // M2:9 (by 'ownerId')
          QuestionFilter.CurrentUserHasNotAnswered,
          'next',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-j1-0'); // J1:0 (no answers)
      }));

      it('should find previous question with no answers at all', fakeAsync(async () => {
        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          modifiedQuestionsView.find(q => q.data?.dataId === 'question-m2-0')!.data!, // M2:0 (by 'ownerId')
          QuestionFilter.CurrentUserHasNotAnswered,
          'prev',
          noopDestroyRef
        );
        tick();
        expect(query.docs.length).toBe(1);
        expect(query.docs[0].data!.dataId).toEqual('question-m1-9'); // M1:9 (no answers)
      }));

      it('should return empty if no further questions meet "CurrentUserHasNotAnswered" (next)', fakeAsync(async () => {
        for (let i = 40; i <= 49; i++) {
          // J2 questions (indices in original `questions` array)
          const qData = modifiedQuestionsView.find(q => q.data?.dataId === `question-j2-${i - 40}`)?.data;
          if (qData) {
            qData.answers = [
              {
                dataId: `${qData.dataId}-ansByTestUser`,
                ownerRef: testUserId,
                text: 'ans',
                verseRef: { bookNum: 43, chapterNum: 2, verseNum: i - 40 + 1 },
                scriptureText: '',
                likes: [],
                dateCreated: '',
                dateModified: '',
                deleted: false,
                comments: [],
                status: AnswerStatus.None
              }
            ];
          }
        }
        realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, modifiedQuestionsView);

        const query = await questionsService.queryAdjacentQuestion(
          projectId,
          modifiedQuestionsView.find(q => q.data?.dataId === 'question-j1-9')!.data!, // J1:9 (no answers)
          QuestionFilter.CurrentUserHasNotAnswered,
          'next',
          noopDestroyRef
        );
        tick();
        // All J2 questions are now answered by testUserId, so they should be skipped.
        expect(query.docs.length).toBe(0);
      }));
    });
  });
});
