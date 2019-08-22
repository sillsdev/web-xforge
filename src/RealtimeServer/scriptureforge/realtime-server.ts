import { RealtimeServer, RealtimeServerOptions } from '../common/realtime-server';
import { DocService } from '../common/services/doc-service';
import { CommentListService } from './services/comment-list-service';
import { QuestionListService } from './services/question-list-service';
import { SFProjectService } from './services/sf-project-service';
import { SFProjectUserConfigService } from './services/sf-project-user-config-service';
import { TextService } from './services/text-service';

const SF_DOC_SERVICES: DocService[] = [
  new SFProjectService(),
  new SFProjectUserConfigService(),
  new TextService(),
  new QuestionListService(),
  new CommentListService()
];

/**
 * This class represents the SF real-time server.
 */
class SFRealtimeServer extends RealtimeServer {
  constructor(options: RealtimeServerOptions) {
    super(SF_DOC_SERVICES, 'sf_projects', options);
  }
}

export = SFRealtimeServer;
