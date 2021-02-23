import { Injectable } from '@angular/core';
import { obj } from 'realtime-server/lib/common/utils/obj-path';
import { getQuestionDocId, Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject, SF_PROJECTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { getSFProjectUserConfigDocId } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { CommandService } from 'xforge-common/command.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ProjectService } from 'xforge-common/project.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { TransceleratorQuestion } from '../checking/import-questions-dialog/import-questions-dialog.component';
import { InviteeStatus } from '../users/collaborators/collaborators.component';
import { QuestionDoc } from './models/question-doc';
import { SFProjectCreateSettings } from './models/sf-project-create-settings';
import { SFProjectDoc } from './models/sf-project-doc';
import { SF_PROJECT_ROLES } from './models/sf-project-role-info';
import { SFProjectSettings } from './models/sf-project-settings';
import { SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
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
    private readonly fileService: FileService
  ) {
    super(realtimeService, commandService, SF_PROJECT_ROLES);
  }

  async onlineCreate(settings: SFProjectCreateSettings): Promise<string> {
    return (await this.onlineInvoke<string>('create', { settings }))!;
  }

  getUserConfig(id: string, userId: string): Promise<SFProjectUserConfigDoc> {
    return this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId));
  }

  /**
   * Remove project from local storage which is useful when a project is no longer accessible by a user
   */
  localDelete(projectId: string): Promise<void> {
    return this.realtimeService.offlineStore.delete(SF_PROJECTS_COLLECTION, projectId);
  }

  onlineAddTranslateMetrics(id: string, metrics: TranslateMetrics): Promise<void> {
    return this.onlineInvoke('addTranslateMetrics', { projectId: id, metrics });
  }

  getText(textId: TextDocId | string): Promise<TextDoc> {
    return this.realtimeService.subscribe(TextDoc.COLLECTION, textId instanceof TextDocId ? textId.toString() : textId);
  }

  queryQuestions(
    id: string,
    options: { bookNum?: number; activeOnly?: boolean; sort?: boolean } = {}
  ): Promise<RealtimeQuery<QuestionDoc>> {
    const queryParams: QueryParameters = {
      [obj<Question>().pathStr(q => q.projectRef)]: id
    };
    if (options.bookNum != null) {
      queryParams[obj<Question>().pathStr(q => q.verseRef.bookNum)] = options.bookNum;
    }
    if (options.activeOnly != null && options.activeOnly) {
      queryParams[obj<Question>().pathStr(q => q.isArchived)] = false;
    }
    if (options.sort != null) {
      queryParams.$sort = { [obj<Question>().pathStr(q => q.dateCreated)]: 1 };
    }
    return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, queryParams);
  }

  async createQuestion(
    id: string,
    question: Question,
    audioFileName?: string,
    audioBlob?: Blob
  ): Promise<QuestionDoc | undefined> {
    const docId = getQuestionDocId(id, question.dataId);
    if (audioFileName != null && audioBlob != null) {
      const audioUrl = await this.fileService.uploadFile(
        FileType.Audio,
        id,
        QuestionDoc.COLLECTION,
        question.dataId,
        docId,
        audioBlob,
        audioFileName,
        true
      );
      if (audioUrl == null) {
        return;
      }
      question.audioUrl = audioUrl;
    }
    return this.realtimeService.create<QuestionDoc>(QuestionDoc.COLLECTION, docId, question);
  }

  onlineSync(id: string): Promise<void> {
    return this.onlineInvoke('sync', { projectId: id });
  }

  onlineUpdateSettings(id: string, settings: SFProjectSettings): Promise<void> {
    return this.onlineInvoke('updateSettings', { projectId: id, settings });
  }

  async onlineIsAlreadyInvited(id: string, email: string): Promise<boolean> {
    return (await this.onlineInvoke<boolean>('isAlreadyInvited', { projectId: id, email }))!;
  }

  /** Get list of email addresses that have outstanding invitations on project.
   * Caller must be an admin on the project. */
  async onlineInvitedUsers(projectId: string): Promise<InviteeStatus[]> {
    return (await this.onlineInvoke<InviteeStatus[]>('invitedUsers', { projectId }))!;
  }

  /** Get added into project, with optionally specified shareKey code. */
  onlineCheckLinkSharing(id: string, shareKey?: string): Promise<void> {
    return this.onlineInvoke('checkLinkSharing', { projectId: id, shareKey });
  }

  onlineInvite(id: string, email: string, locale: string): Promise<string | undefined> {
    return this.onlineInvoke('invite', { projectId: id, email, locale });
  }

  async onlineUninviteUser(projectId: string, emailToUninvite: string): Promise<string> {
    return (await this.onlineInvoke<string>('uninviteUser', { projectId, emailToUninvite }))!;
  }

  async onlineIsSourceProject(projectId: string): Promise<boolean> {
    return (await this.onlineInvoke<boolean>('isSourceProject', { projectId }))!;
  }

  async transceleratorQuestions(projectId: string): Promise<TransceleratorQuestion[]> {
    return (await this.onlineInvoke<TransceleratorQuestion[]>('transceleratorQuestions', { projectId }))!;
  }

  async hasTransceleratorQuestions(projectId: string): Promise<boolean> {
    return (await this.onlineInvoke<boolean>('hasTransceleratorQuestions', { projectId }))!;
  }
}
