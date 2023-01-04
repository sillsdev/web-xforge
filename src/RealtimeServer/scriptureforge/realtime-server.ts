import ShareDB from 'sharedb';
import { RealtimeServer } from '../common/realtime-server';
import { SchemaVersionRepository } from '../common/schema-version-repository';
import { DocService } from '../common/services/doc-service';
import { UserService } from '../common/services/user-service';
import { Operation } from '../common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from './models/sf-project-rights';
import { NOTE_THREAD_COLLECTION } from './models/note-thread';
import { SF_PROJECTS_COLLECTION } from './models/sf-project';
import { NoteThreadService } from './services/note-thread-service';
import { QuestionService } from './services/question-service';
import { SFProjectService } from './services/sf-project-service';
import { SFProjectUserConfigService } from './services/sf-project-user-config-service';
import { TextService } from './services/text-service';

const SF_DOC_SERVICES: DocService[] = [
  new UserService(),
  new SFProjectService(),
  new SFProjectUserConfigService(),
  new TextService(),
  new QuestionService(),
  new NoteThreadService()
];

/**
 * This class represents the SF real-time server.
 */
class SFRealtimeServer extends RealtimeServer {
  constructor(siteId: string, migrationsDisabled: boolean, db: ShareDB.DB, schemaVersions: SchemaVersionRepository) {
    super(siteId, migrationsDisabled, SF_DOC_SERVICES, SF_PROJECTS_COLLECTION, db, schemaVersions);
    this.use('query', (context: ShareDB.middleware.QueryContext, next: (err?: any) => void) => {
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

export = SFRealtimeServer;
