import ShareDB from 'sharedb';
import { RealtimeServer } from '../common/realtime-server';
import { SchemaVersionRepository } from '../common/schema-version-repository';
import { DocService } from '../common/services/doc-service';
import { UserService } from '../common/services/user-service';
import { SF_PROJECTS_COLLECTION } from './models/sf-project';
import { QuestionService } from './services/question-service';
import { SFProjectService } from './services/sf-project-service';
import { SFProjectUserConfigService } from './services/sf-project-user-config-service';
import { TextService } from './services/text-service';

const SF_DOC_SERVICES: DocService[] = [
  new UserService(),
  new SFProjectService(),
  new SFProjectUserConfigService(),
  new TextService(),
  new QuestionService()
];

/**
 * This class represents the SF real-time server.
 */
class SFRealtimeServer extends RealtimeServer {
  constructor(siteId: string, migrationsDisabled: boolean, db: ShareDB.DB, schemaVersions: SchemaVersionRepository) {
    super(siteId, migrationsDisabled, SF_DOC_SERVICES, SF_PROJECTS_COLLECTION, db, schemaVersions);
  }
}

export = SFRealtimeServer;
