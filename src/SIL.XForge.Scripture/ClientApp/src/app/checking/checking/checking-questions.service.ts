import { DestroyRef, Injectable } from '@angular/core';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { Answer, AnswerStatus } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Subject } from 'rxjs';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ComparisonOperator, PropertyFilter, QueryParameters, Sort } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { QuestionDoc } from '../../core/models/question-doc';

export enum QuestionFilter {
  None,
  CurrentUserHasAnswered,
  CurrentUserHasNotAnswered,
  HasAnswers,
  NoAnswers,
  StatusNone,
  StatusExport,
  StatusResolved
}

export interface PreCreationQuestionData {
  docId: string;
  question: Question;
}

@Injectable({
  providedIn: 'root'
})
export class CheckingQuestionsService {
  /**
   * Emits the question that is about to be created.
   */
  beforeQuestionCreated$ = new Subject<PreCreationQuestionData>();

  /**
   * Emits the question that was just created.
   */
  afterQuestionCreated$ = new Subject<QuestionDoc>();

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly fileService: FileService
  ) {}

  /**
   * Query project questions that match the supplied criteria.
   */
  queryQuestions(
    projectId: string,
    options: { bookNum?: number; chapterNum?: number; activeOnly?: boolean; sort?: boolean; limit?: number } = {},
    destroyRef: DestroyRef
  ): Promise<RealtimeQuery<QuestionDoc>> {
    const queryParams: QueryParameters = {
      [obj<Question>().pathStr(q => q.projectRef)]: projectId
    };

    if (options.bookNum != null) {
      queryParams[obj<Question>().pathStr(q => q.verseRef.bookNum)] = options.bookNum;
    }

    if (options.chapterNum != null) {
      queryParams[obj<Question>().pathStr(q => q.verseRef.chapterNum)] = options.chapterNum;
    }

    if (options.activeOnly != null && options.activeOnly) {
      queryParams[obj<Question>().pathStr(q => q.isArchived)] = false;
    }

    if (options.sort != null) {
      queryParams.$sort = this.getQuestionSortParams('ascending');
    }

    if (options.limit != null) {
      queryParams.$limit = options.limit;
    }

    return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, queryParams, destroyRef);
  }

  /**
   * Query the question that precedes or follows the supplied question, skipping questions that the filter hides.
   * @param projectId The ID of the project to query
   * @param relativeTo The question or verse to use as a reference point
   * @param prevOrNext Whether to query the question before or after the reference point
   * @param questionFilter The filter the adjacent question must match
   * @param userId The ID of the current user, used by the filters that depend on whether the user has answered
   * @param destroyRef The reference to destroy the query when the component gets destroyed.
   */
  queryAdjacentQuestion(
    projectId: string,
    relativeTo: Question | VerseRefData,
    prevOrNext: 'prev' | 'next',
    questionFilter: QuestionFilter,
    userId: string,
    destroyRef: DestroyRef
  ): Promise<RealtimeQuery<QuestionDoc>> {
    const verseRef: VerseRefData = this.isVerseRefData(relativeTo) ? relativeTo : relativeTo.verseRef;
    const currentQuestion: Question | undefined = this.isVerseRefData(relativeTo) ? undefined : relativeTo;
    const comparisonOperator: ComparisonOperator = prevOrNext === 'prev' ? '$lt' : '$gt';

    const queryParams: QueryParameters = {
      [obj<Question>().pathStr(q => q.projectRef)]: projectId,
      [obj<Question>().pathStr(q => q.isArchived)]: false,
      ...this.getQuestionFilterParams(questionFilter, userId),

      $and: [
        // Exclude the current question if supplied
        currentQuestion != null ? { [obj<Question>().pathStr(q => q.dataId)]: { $ne: currentQuestion.dataId } } : {},
        {
          $or: [
            // If same book/chapter/verse, compare using date created
            {
              $and: [
                { [obj<Question>().pathStr(q => q.verseRef.bookNum)]: verseRef.bookNum },
                { [obj<Question>().pathStr(q => q.verseRef.chapterNum)]: verseRef.chapterNum },
                { [obj<Question>().pathStr(q => q.verseRef.verseNum)]: verseRef.verseNum },

                // If current question supplied, compare using date created
                currentQuestion != null
                  ? {
                      [obj<Question>().pathStr(q => q.dateCreated)]: {
                        [comparisonOperator]: currentQuestion.dateCreated
                      }
                    }
                  : {}
              ]
            },
            {
              // If same book/chapter, compare using verse
              $and: [
                { [obj<Question>().pathStr(q => q.verseRef.bookNum)]: verseRef.bookNum },
                { [obj<Question>().pathStr(q => q.verseRef.chapterNum)]: verseRef.chapterNum },
                { [obj<Question>().pathStr(q => q.verseRef.verseNum)]: { [comparisonOperator]: verseRef.verseNum } }
              ]
            },
            {
              // If same book, compare using chapter
              $and: [
                { [obj<Question>().pathStr(q => q.verseRef.bookNum)]: verseRef.bookNum },
                { [obj<Question>().pathStr(q => q.verseRef.chapterNum)]: { [comparisonOperator]: verseRef.chapterNum } }
              ]
            },
            // Otherwise, compare using closest book
            { [obj<Question>().pathStr(q => q.verseRef.bookNum)]: { [comparisonOperator]: verseRef.bookNum } }
          ]
        }
      ],

      $sort: this.getQuestionSortParams(prevOrNext === 'next' ? 'ascending' : 'descending'),
      // Only the nearest question is needed. Without a limit, this would load every question before or after the
      // reference point, which in a large project can be most of its questions.
      $limit: 1
    };

    return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, queryParams, destroyRef);
  }

  async queryFirstUnansweredQuestion(
    projectId: string,
    userId: string,
    destroyRef: DestroyRef
  ): Promise<RealtimeQuery<QuestionDoc>> {
    const queryParams: QueryParameters = {
      [obj<Question>().pathStr(q => q.projectRef)]: projectId,
      [obj<Question>().pathStr(q => q.isArchived)]: false,
      [obj<Question>().pathStr(q => q.answers)]: {
        $not: {
          $elemMatch: {
            [obj<Answer>().pathStr(a => a.ownerRef)]: userId,
            deleted: false
          }
        }
      },
      $sort: this.getQuestionSortParams('ascending'),
      $limit: 1
    };
    return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, queryParams, destroyRef);
  }

  async createQuestion(
    id: string,
    question: Question,
    audioFileName?: string,
    audioBlob?: Blob
  ): Promise<QuestionDoc | undefined> {
    const docId = getQuestionDocId(id, question.dataId);

    if (audioFileName != null && audioBlob != null) {
      const audioUrl = await this.fileService.uploadFile(
        FileType.Audio,
        id,
        QuestionDoc.COLLECTION,
        question.dataId,
        docId,
        audioBlob,
        audioFileName,
        true
      );

      if (audioUrl == null) {
        return undefined;
      }

      question.audioUrl = audioUrl;
    }

    this.beforeQuestionCreated$.next({
      docId,
      question
    });

    return this.realtimeService
      .create<QuestionDoc>(QuestionDoc.COLLECTION, docId, question)
      .then((questionDoc: QuestionDoc) => {
        this.afterQuestionCreated$.next(questionDoc);
        return questionDoc;
      });
  }

  /**
   * Gets the query criteria for the questions that a filter shows. Deleted answers are ignored. These criteria are used
   * both in queries and to filter questions that are already loaded.
   */
  getQuestionFilterParams(questionFilter: QuestionFilter, userId: string): PropertyFilter {
    const answersPath: string = obj<Question>().pathStr(q => q.answers);
    const notDeleted: PropertyFilter = { [obj<Answer>().pathStr(a => a.deleted)]: { $ne: true } };
    const ownedByUser: PropertyFilter = { ...notDeleted, [obj<Answer>().pathStr(a => a.ownerRef)]: userId };
    const statusPath: string = obj<Answer>().pathStr(a => a.status);
    switch (questionFilter) {
      case QuestionFilter.None:
        return {};
      case QuestionFilter.CurrentUserHasAnswered:
        return { [answersPath]: { $elemMatch: ownedByUser } };
      case QuestionFilter.CurrentUserHasNotAnswered:
        return { [answersPath]: { $not: { $elemMatch: ownedByUser } } };
      case QuestionFilter.HasAnswers:
        return { [answersPath]: { $elemMatch: notDeleted } };
      case QuestionFilter.NoAnswers:
        return { [answersPath]: { $not: { $elemMatch: notDeleted } } };
      case QuestionFilter.StatusNone:
        // A null status also matches answers that have no status
        return { [answersPath]: { $elemMatch: { ...notDeleted, [statusPath]: { $in: [AnswerStatus.None, null] } } } };
      case QuestionFilter.StatusExport:
        return { [answersPath]: { $elemMatch: { ...notDeleted, [statusPath]: AnswerStatus.Exportable } } };
      case QuestionFilter.StatusResolved:
        return { [answersPath]: { $elemMatch: { ...notDeleted, [statusPath]: AnswerStatus.Resolved } } };
    }
  }

  private isVerseRefData(item: Question | VerseRefData): item is VerseRefData {
    const verseRef: VerseRefData = item as VerseRefData;
    return verseRef.bookNum != null && verseRef.chapterNum != null && verseRef.verseNum != null;
  }

  private getQuestionSortParams(direction: 'ascending' | 'descending'): Sort {
    const sortOrder = direction === 'ascending' ? 1 : -1;
    return {
      [obj<Question>().pathStr(q => q.verseRef.bookNum)]: sortOrder,
      [obj<Question>().pathStr(q => q.verseRef.chapterNum)]: sortOrder,
      [obj<Question>().pathStr(q => q.verseRef.verseNum)]: sortOrder,
      [obj<Question>().pathStr(q => q.dateCreated)]: sortOrder
    };
  }
}
