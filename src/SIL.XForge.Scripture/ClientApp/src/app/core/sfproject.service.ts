import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RemoteTranslationEngine } from '@sillsdev/machine';
import { JsonRpcService } from 'xforge-common/json-rpc.service';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { MachineHttpClient } from './machine-http-client';
import { CommentListDoc } from './models/comment-list-doc';
import { QuestionListDoc } from './models/question-list-doc';
import { SFProject } from './models/sfproject';
import { SFProjectDoc } from './models/sfproject-doc';
import { SF_PROJECT_ROLES } from './models/sfproject-roles';
import { SFProjectUserConfigDoc } from './models/sfproject-user-config-doc';
import { TextDoc } from './models/text-doc';
import { TextDocId } from './models/text-doc-id';
import { TranslateMetrics } from './models/translate-metrics';
import { UpdateTasksParams } from './models/update-tasks-params';

@Injectable({
  providedIn: 'root'
})
export class SFProjectService extends ProjectService<SFProject, SFProjectDoc> {
  constructor(
    realtimeService: RealtimeService,
    jsonRpcService: JsonRpcService,
    http: HttpClient,
    private readonly machineHttp: MachineHttpClient
  ) {
    super(realtimeService, jsonRpcService, SF_PROJECT_ROLES, http);
  }

  getUserConfig(id: string, userId: string): Promise<SFProjectUserConfigDoc> {
    return this.realtimeService.get(SFProjectUserConfigDoc.TYPE, `${id}:${userId}`);
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
  }

  addTranslateMetrics(id: string, metrics: TranslateMetrics): Promise<void> {
    return this.jsonRpcService.onlineInvoke(SFProjectDoc.TYPE, id, 'addTranslateMetrics', { metrics });
  }

  getText(id: TextDocId): Promise<TextDoc> {
    return this.realtimeService.get(TextDoc.TYPE, id.toString());
  }

  getQuestionList(id: TextDocId): Promise<QuestionListDoc> {
    return this.realtimeService.get(QuestionListDoc.TYPE, id.toString());
  }

  getCommentList(id: TextDocId): Promise<CommentListDoc> {
    return this.realtimeService.get(CommentListDoc.TYPE, id.toString());
  }

  sync(id: string): Promise<void> {
    return this.jsonRpcService.onlineInvoke(SFProjectDoc.TYPE, id, 'sync');
  }

  updateTasks(id: string, parameters: UpdateTasksParams): Promise<void> {
    return this.jsonRpcService.onlineInvoke(SFProjectDoc.TYPE, id, 'updateTasks', { parameters });
  }
}
