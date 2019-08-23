import ShareDB = require('sharedb');
import { createProxy, getPath } from 'ts-object-path';
import { OwnedData } from '../../common/models/owned-data';
import { PathTemplate } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { docFetch, docSubmitOp } from '../../common/utils';
import { Answer } from '../models/answer';
import { CommentList, COMMENTS_COLLECTION } from '../models/comment-list';
import { QuestionList, QUESTIONS_COLLECTION } from '../models/question-list';
import { SFProjectDomain } from '../models/sf-project-rights';
import { QUESTION_LIST_MIGRATIONS } from './question-list-migrations';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages question list docs.
 */
export class QuestionListService extends SFProjectDataService<QuestionList> {
  readonly collection = QUESTIONS_COLLECTION;

  protected readonly immutableProps: PathTemplate[] = [
    this.createPathTemplate(ql => ql.questions[-1].answers![-1].syncUserRef!)
  ];
  protected readonly listenForUpdates: boolean = true;

  constructor() {
    super(QUESTION_LIST_MIGRATIONS);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      { projectDomain: SFProjectDomain.Questions, pathTemplate: this.createPathTemplate(ql => ql.questions[-1]) },
      {
        projectDomain: SFProjectDomain.Answers,
        pathTemplate: this.createPathTemplate(ql => ql.questions[-1].answers![-1])
      },
      {
        projectDomain: SFProjectDomain.Likes,
        pathTemplate: this.createPathTemplate(ql => ql.questions[-1].answers![-1].likes[-1])
      }
    ];
  }

  protected async onDelete(docId: string, projectDomain: SFProjectDomain, entity: OwnedData): Promise<void> {
    switch (projectDomain) {
      case SFProjectDomain.Answers:
        const answer = entity as Answer;
        await this.deleteAnswerComments(docId, answer.id);
        break;
    }
  }

  private async deleteAnswerComments(docId: string, answerId: string): Promise<void> {
    const conn = this.server!.backend.connect();
    const commentListDoc = conn.get(COMMENTS_COLLECTION, docId);
    await docFetch(commentListDoc);
    const commentList: CommentList = commentListDoc.data;
    const cl = createProxy<CommentList>();
    const ops: ShareDB.Op[] = [];
    for (let i = commentList.comments.length - 1; i >= 0; i--) {
      const comment = commentList.comments[i];
      if (comment.answerRef === answerId) {
        const op: ShareDB.ListDeleteOp = {
          p: getPath(cl.comments[i]),
          ld: comment
        };
        ops.push(op);
      }
    }
    await docSubmitOp(commentListDoc, ops);
  }
}
