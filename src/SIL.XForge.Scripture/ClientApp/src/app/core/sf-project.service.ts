import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RemoteTranslationEngine } from '@sillsdev/machine';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { CommandService } from 'xforge-common/command.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ProjectService } from 'xforge-common/project.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { getObjPathStr, objProxy } from 'xforge-common/utils';
import { MachineHttpClient } from './machine-http-client';
import { getQuestionDocId, QuestionDoc } from './models/question-doc';
import { SFProjectDoc } from './models/sf-project-doc';
import { SF_PROJECT_ROLES } from './models/sf-project-role-info';
import { SFProjectSettings } from './models/sf-project-settings';
import { getSFProjectUserConfigDocId, SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
import { TextDoc, TextDocId } from './models/text-doc';
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
    return this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId));
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
  }

  onlineAddTranslateMetrics(id: string, metrics: TranslateMetrics): Promise<void> {
    return this.onlineInvoke('addTranslateMetrics', { projectId: id, metrics });
  }

  getText(textId: TextDocId | string): Promise<TextDoc> {
    return this.realtimeService.subscribe(TextDoc.COLLECTION, textId instanceof TextDocId ? textId.toString() : textId);
  }

  getQuestions(
    id: string,
    options?: { bookId?: string; activeOnly?: boolean; sort?: boolean }
  ): Promise<RealtimeQuery<QuestionDoc>> {
    const q = objProxy<Question>();
    const queryParams: QueryParameters = {
      [getObjPathStr(q.projectRef)]: id
    };
    if (options != null) {
      if (options.bookId != null) {
        queryParams[getObjPathStr(q.scriptureStart.book)] = options.bookId;
      }
      if (options.activeOnly != null && options.activeOnly) {
        queryParams[getObjPathStr(q.isArchived)] = false;
      }
      if (options.sort != null) {
        queryParams.$sort = { [getObjPathStr(q.dateCreated)]: -1 };
      }
    }
    return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, queryParams);
  }

  createQuestion(id: string, question: Question): Promise<QuestionDoc> {
    return this.realtimeService.create(QuestionDoc.COLLECTION, getQuestionDocId(id, question.dataId), question);
  }

  onlineSync(id: string): Promise<void> {
    return this.onlineInvoke('sync', { projectId: id });
  }

  onlineUpdateSettings(id: string, settings: SFProjectSettings): Promise<void> {
    return this.onlineInvoke('updateSettings', { projectId: id, settings });
  }
}
