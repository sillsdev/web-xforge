import ShareDB = require('sharedb');
import { Doc } from 'sharedb/lib/client';
import { createProxy, getPath } from 'ts-object-path';
import { OwnedData } from '../../common/models/owned-data';
import { ANY_INDEX } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { createFetchQuery, docSubmitOp } from '../../common/utils';
import { Answer } from '../models/answer';
import { Comment } from '../models/comment';
import { Question, QUESTIONS_COLLECTION } from '../models/question';
import { SFProjectDomain } from '../models/sf-project-rights';
import { SF_PROJECT_USER_CONFIGS_COLLECTION, SFProjectUserConfig } from '../models/sf-project-user-config';
import { QUESTION_MIGRATIONS } from './question-migrations';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages question list docs.
 */
export class QuestionService extends SFProjectDataService<Question> {
  readonly collection = QUESTIONS_COLLECTION;
  readonly listenForUpdates = true;

  constructor() {
    super(QUESTION_MIGRATIONS);

    const immutableProps = [
      this.createPathTemplate(q => q.dataId),
      this.createPathTemplate(q => q.dateCreated),
      this.createPathTemplate(q => q.answers[ANY_INDEX].dataId),
      this.createPathTemplate(q => q.answers[ANY_INDEX].ownerRef),
      this.createPathTemplate(q => q.answers[ANY_INDEX].syncUserRef!),
      this.createPathTemplate(q => q.answers[ANY_INDEX].dateCreated),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].dataId),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].ownerRef),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].syncUserRef!),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].dateCreated),
      this.createPathTemplate(q => q.answers[ANY_INDEX].likes[ANY_INDEX].ownerRef)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.Questions,
        pathTemplate: this.createPathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Answers,
        pathTemplate: this.createPathTemplate(q => q.answers[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.AnswerComments,
        pathTemplate: this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.Likes,
        pathTemplate: this.createPathTemplate(q => q.answers[ANY_INDEX].likes[ANY_INDEX])
      }
    ];
  }

  protected onDelete(userId: string, docId: string, projectDomain: SFProjectDomain, entity: OwnedData): Promise<void> {
    if (projectDomain === SFProjectDomain.Answers || projectDomain === SFProjectDomain.AnswerComments) {
      this.removeEntityReadRefs(userId, docId, projectDomain, entity);
    }
    return Promise.resolve();
  }

  private async removeEntityReadRefs(
    userId: string,
    docId: string,
    projectDomain: SFProjectDomain,
    entity: OwnedData
  ): Promise<void> {
    const parts = docId.split(':');
    const projectId = parts[0];
    const conn = this.server!.backend.connect(undefined, { userId });
    const query = await createFetchQuery(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, { projectRef: projectId });
    const promises: Promise<void>[] = [];
    for (const doc of query.results) {
      let ops: ShareDB.Op[] | undefined;
      switch (projectDomain) {
        case SFProjectDomain.Answers:
          ops = this.removeAnswerReadRefs(doc, entity as Answer);
          break;
        case SFProjectDomain.AnswerComments:
          ops = this.removeCommentReadRefs(doc, entity as Comment);
          break;
      }
      if (ops != null && ops.length > 0) {
        promises.push(docSubmitOp(doc, ops));
      }
    }
    await Promise.all(promises);
  }

  private removeAnswerReadRefs(doc: Doc, answer: Answer): ShareDB.Op[] {
    const puc = createProxy<SFProjectUserConfig>();
    const data = doc.data as SFProjectUserConfig;
    const index = data.answerRefsRead.indexOf(answer.dataId);
    const ops: ShareDB.Op[] = [];
    if (index !== -1) {
      const op: ShareDB.ListDeleteOp = {
        p: getPath(puc.answerRefsRead[index]),
        ld: answer.dataId
      };
      ops.push(op);
    }

    const commentIds = new Set<string>(answer.comments.map(c => c.dataId));
    for (let i = data.commentRefsRead.length - 1; i >= 0; i--) {
      if (commentIds.has(data.commentRefsRead[i])) {
        const op: ShareDB.ListDeleteOp = {
          p: getPath(puc.commentRefsRead[i]),
          ld: data.commentRefsRead[i]
        };
        ops.push(op);
      }
    }
    return ops;
  }

  private removeCommentReadRefs(doc: Doc, comment: Comment): ShareDB.Op[] {
    const puc = createProxy<SFProjectUserConfig>();
    const data = doc.data as SFProjectUserConfig;
    const index = data.commentRefsRead.indexOf(comment.dataId);
    if (index !== -1) {
      const op: ShareDB.ListDeleteOp = {
        p: getPath(puc.commentRefsRead[index]),
        ld: comment.dataId
      };
      return [op];
    }
    return [];
  }
}
