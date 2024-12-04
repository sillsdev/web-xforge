import ShareDB from 'sharedb';
import { Operation } from '../common/models/project-rights';
import { RealtimeServer } from '../common/realtime-server';
import { SchemaVersionRepository } from '../common/schema-version-repository';
import { DocService } from '../common/services/doc-service';
import { NotificationService } from '../common/services/notification-service';
import { UserService } from '../common/services/user-service';
import { NOTE_THREAD_COLLECTION } from './models/note-thread';
import { SF_PROJECTS_COLLECTION } from './models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from './models/sf-project-rights';
import { BiblicalTermService } from './services/biblical-term-service';
import { NoteThreadService } from './services/note-thread-service';
import { QuestionService } from './services/question-service';
import { SF_PROJECT_MIGRATIONS } from './services/sf-project-migrations';
import { SFProjectService } from './services/sf-project-service';
import { SF_PROJECT_USER_CONFIG_MIGRATIONS } from './services/sf-project-user-config-migrations';
import { SFProjectUserConfigService } from './services/sf-project-user-config-service';
import { TextAudioService } from './services/text-audio-service';
import { TextService } from './services/text-service';
import { TrainingDataService } from './services/training-data-service';

const SF_DOC_SERVICES: DocService[] = [
  new UserService(),
  new NotificationService(),
  new SFProjectService(SF_PROJECT_MIGRATIONS),
  new SFProjectUserConfigService(SF_PROJECT_USER_CONFIG_MIGRATIONS),
  new TextService(),
  new QuestionService(),
  new BiblicalTermService(),
  new NoteThreadService(),
  new TextAudioService(),
  new TrainingDataService()
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
