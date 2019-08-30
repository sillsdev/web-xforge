import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RemoteTranslationEngine } from '@sillsdev/machine';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { CommandService } from 'xforge-common/command.service';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { MachineHttpClient } from './machine-http-client';
import { QuestionListDoc } from './models/question-list-doc';
import { SFProjectDoc } from './models/sf-project-doc';
import { SF_PROJECT_ROLES } from './models/sf-project-role-info';
import { SFProjectSettings } from './models/sf-project-settings';
import { SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
import { TextDoc } from './models/text-doc';
import { TextDocId } from './models/text-doc-id';
import { TranslateMetrics } from './models/translate-metrics';

@Injectable({
  providedIn: 'root'
})
export class SFProjectService extends ProjectService<SFProject, SFProjectDoc> {
  protected readonly collection = SFProjectDoc.COLLECTION;

  constructor(
    realtimeService: RealtimeService,
    commandService: CommandService,
    http: HttpClient,
    private readonly machineHttp: MachineHttpClient
  ) {
    super(realtimeService, commandService, SF_PROJECT_ROLES, http);
  }

  getUserConfig(id: string, userId: string): Promise<SFProjectUserConfigDoc> {
    return this.realtimeService.get(SFProjectUserConfigDoc.COLLECTION, `${id}:${userId}`);
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
  }

  onlineAddTranslateMetrics(id: string, metrics: TranslateMetrics): Promise<void> {
    return this.onlineInvoke('addTranslateMetrics', { projectId: id, metrics });
  }

  getText(id: TextDocId): Promise<TextDoc> {
    return this.realtimeService.get(TextDoc.COLLECTION, id.toString());
  }

  getQuestionList(id: TextDocId): Promise<QuestionListDoc> {
    return this.realtimeService.get(QuestionListDoc.COLLECTION, id.toString());
  }

  onlineSync(id: string): Promise<void> {
    return this.onlineInvoke('sync', { projectId: id });
  }

  onlineUpdateSettings(id: string, settings: SFProjectSettings): Promise<void> {
    return this.onlineInvoke('updateSettings', { projectId: id, settings });
  }
}
