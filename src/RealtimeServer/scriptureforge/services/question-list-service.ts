import ShareDB = require('sharedb');
import { createProxy, getPath } from 'ts-object-path';
import { PathTemplate } from '../../common/path-template';
import { RealtimeServer } from '../../common/realtime-server';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { docFetch, docSubmitOp } from '../../common/utils';
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

  constructor() {
    super(QUESTION_LIST_MIGRATIONS);
  }

  init(server: RealtimeServer): void {
    super.init(server);
    this.addUpdateListener(server, (docId, ops) => this.handleUpdate(docId, ops));
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

  private async handleUpdate(docId: string, ops: ShareDB.Op[]): Promise<void> {
    const answerPathTemplate = this.createPathTemplate(ql => ql.questions![-1].answers![-1], false);
    for (const op of ops) {
      // if an answer was deleted, then delete all comments for this answer
      if (answerPathTemplate.matches(op.p)) {
        const listDeleteOp = op as ShareDB.ListDeleteOp;
        if (listDeleteOp.ld != null) {
          await this.deleteAnswerComments(docId, listDeleteOp.ld.id);
        }
      }
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
