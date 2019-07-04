import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RemoteTranslationEngine } from '@sillsdev/machine';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JsonApiService } from 'xforge-common/json-api.service';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { MachineHttpClient } from './machine-http-client';
import { CommentsDoc } from './models/comments-doc';
import { QuestionsDoc } from './models/questions-doc';
import { SFProject } from './models/sfproject';
import { SFProjectDataDoc } from './models/sfproject-data-doc';
import { ProjectRole, SFProjectRoles } from './models/sfproject-roles';
import { TextDoc } from './models/text-doc';
import { TextDocId } from './models/text-doc-id';
import { TranslateMetrics } from './models/translate-metrics';

@Injectable({
  providedIn: 'root'
})
export class SFProjectService extends ProjectService<SFProject> {
  private static readonly ROLES: ProjectRole[] = [
    { role: SFProjectRoles.ParatextAdministrator, displayName: 'Administrator' },
    { role: SFProjectRoles.ParatextTranslator, displayName: 'Translator' }
  ];

  constructor(
    jsonApiService: JsonApiService,
    private readonly machineHttp: MachineHttpClient,
    private readonly realtimeService: RealtimeService,
    readonly http: HttpClient
  ) {
    super(SFProject.TYPE, jsonApiService, SFProjectService.ROLES, http);
  }

  init(): void {
    this.jsonApiService.resourceDeleted<SFProject>(this.type).subscribe(project => {
      this.realtimeService.localDeleteProjectDocs(TextDoc.TYPE, project.id);
      this.realtimeService.localDeleteProjectDocs(QuestionsDoc.TYPE, project.id);
      this.realtimeService.localDeleteProjectDocs(CommentsDoc.TYPE, project.id);
      this.realtimeService.localDeleteProjectDocs(SFProjectDataDoc.TYPE, project.id);
    });
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
  }

  getDataDoc(id: string): Promise<SFProjectDataDoc> {
    return this.realtimeService.get(this.identity(id));
  }

  addTranslateMetrics(id: string, metrics: TranslateMetrics): Promise<void> {
    return this.jsonApiService.onlineInvoke(this.identity(id), 'addTranslateMetrics', { metrics });
  }

  getTextDoc(id: TextDocId): Promise<TextDoc> {
    return this.realtimeService.get({ type: TextDoc.TYPE, id: id.toString() });
  }

  getQuestionsDoc(id: TextDocId): Promise<QuestionsDoc> {
    return this.realtimeService.get({ type: QuestionsDoc.TYPE, id: id.toString() });
  }

  getCommentsDoc(id: TextDocId): Promise<CommentsDoc> {
    return this.realtimeService.get({ type: CommentsDoc.TYPE, id: id.toString() });
  }

  sync(id: string): Promise<void> {
    return this.jsonApiService.onlineInvoke(this.identity(id), 'sync');
  }
}
