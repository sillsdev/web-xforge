import ShareDB from 'sharedb';
import { RealtimeServer } from '../common/realtime-server';
import { SchemaVersionRepository } from '../common/schema-version-repository';
import { DocService } from '../common/services/doc-service';
import { UserService } from '../common/services/user-service';
import { Operation } from '../common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from './models/sf-project-rights';
import { NOTE_THREAD_COLLECTION } from './models/note-thread';
import { SF_PROJECTS_COLLECTION } from './models/sf-project';
import { BiblicalTermService } from './services/biblical-term-service';
import { NoteThreadService } from './services/note-thread-service';
import { QuestionService } from './services/question-service';
import { SFProjectService } from './services/sf-project-service';
import { SFProjectUserConfigService } from './services/sf-project-user-config-service';
import { TextService } from './services/text-service';
import { SF_PROJECT_MIGRATIONS } from './services/sf-project-migrations';
import { TextAudioService } from './services/text-audio-service';

const SF_DOC_SERVICES: DocService[] = [
  new UserService(),
  new SFProjectService(SF_PROJECT_MIGRATIONS),
  new SFProjectUserConfigService(),
  new TextService(),
  new QuestionService(),
  new BiblicalTermService(),
  new NoteThreadService(),
  new TextAudioService()
];

/**
 * This class represents the SF real-time server.
 */
export default class SFRealtimeServer extends RealtimeServer {
  constructor(
    siteId: string,
    migrationsDisabled: boolean,
    dataValidationDisabled: boolean,
    db: ShareDB.DB,
    schemaVersions: SchemaVersionRepository,
    milestoneDb?: ShareDB.MilestoneDB
  ) {
    super(
      siteId,
      migrationsDisabled,
      dataValidationDisabled,
      SF_DOC_SERVICES,
      SF_PROJECTS_COLLECTION,
      db,
      schemaVersions,
      milestoneDb
    );
    this.use('query', (context: ShareDB.middleware.QueryContext, next: (err?: any) => void): void => {
      if (context.collection === NOTE_THREAD_COLLECTION) {
        if (context.agent.connectSession.isServer) {
          next();
          return;
        }
        const userId: string = context.agent.connectSession.userId;
        this.getProject(context.query.projectRef).then(p => {
          if (
            p != null &&
            !SF_PROJECT_RIGHTS.hasRight(p, userId, SFProjectDomain.PTNoteThreads, Operation.View) &&
            SF_PROJECT_RIGHTS.hasRight(p, userId, SFProjectDomain.SFNoteThreads, Operation.View)
          ) {
            context.query = { ...context.query, publishedToSF: true };
          }
          next();
        });
      } else {
        next();
      }
    });
  }
}
