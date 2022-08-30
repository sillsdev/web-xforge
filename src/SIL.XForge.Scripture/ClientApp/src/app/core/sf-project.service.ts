import { Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { NoteThread, NoteStatus, getNoteThreadDocId } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProject, SF_PROJECTS_COLLECTION } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { getSFProjectUserConfigDocId } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { Subject } from 'rxjs';
import { CommandService } from 'xforge-common/command.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ProjectService } from 'xforge-common/project.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RetryingRequest, RetryingRequestService } from 'xforge-common/retrying-request.service';
import { TransceleratorQuestion } from '../checking/import-questions-dialog/import-questions-dialog.component';
import { InviteeStatus } from '../users/collaborators/collaborators.component';
import { NoteThreadDoc } from './models/note-thread-doc';
import { QuestionDoc } from './models/question-doc';
import { SFProjectCreateSettings } from './models/sf-project-create-settings';
import { SFProjectDoc } from './models/sf-project-doc';
import { SF_PROJECT_ROLES } from './models/sf-project-role-info';
import { SFProjectSettings } from './models/sf-project-settings';
import { SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
import { SFProjectProfileDoc } from './models/sf-project-profile-doc';
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
    private readonly fileService: FileService,
    protected readonly retryingRequestService: RetryingRequestService
  ) {
    super(realtimeService, commandService, retryingRequestService, SF_PROJECT_ROLES);
  }

  async onlineCreate(settings: SFProjectCreateSettings): Promise<string> {
    return (await this.onlineInvoke<string>('create', { settings }))!;
  }

  /**
   * Returns the SF project if the user has a role that allows access (i.e. a paratext role),
   * otherwise returns undefined.
   */
  async tryGetForRole(id: string, role: string): Promise<SFProjectDoc | undefined> {
    if (SF_PROJECT_RIGHTS.roleHasRight(role, SFProjectDomain.Project, Operation.View)) {
      return await this.get(id);
    }
    return undefined;
  }

  /** Returns the project profile with the project data that all project members can access. */
  getProfile(id: string): Promise<SFProjectProfileDoc> {
    return this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id);
  }

  getUserConfig(id: string, userId: string): Promise<SFProjectUserConfigDoc> {
    return this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId));
  }

  async isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
    const projectDoc = await this.getProfile(projectId);
    return (
      projectDoc != null &&
      projectDoc.data != null &&
      projectDoc.data.userRoles[userId] === SFProjectRole.ParatextAdministrator
    );
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

  getNoteThread(threadId: string): Promise<NoteThreadDoc> {
    return this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, threadId);
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
      queryParams.$sort = {
        [obj<Question>().pathStr(q => q.verseRef.bookNum)]: 1,
        [obj<Question>().pathStr(q => q.verseRef.chapterNum)]: 1,
        [obj<Question>().pathStr(q => q.verseRef.verseNum)]: 1,
        [obj<Question>().pathStr(q => q.dateCreated)]: 1
      };
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

  async createNoteThread(projectId: string, noteThread: NoteThread): Promise<void> {
    const docId: string = getNoteThreadDocId(projectId, noteThread.dataId);
    await this.realtimeService.create<NoteThreadDoc>(NoteThreadDoc.COLLECTION, docId, noteThread);
  }

  queryNoteThreads(id: string): Promise<RealtimeQuery<NoteThreadDoc>> {
    const queryParams: QueryParameters = {
      [obj<NoteThread>().pathStr(t => t.projectRef)]: id,
      [obj<NoteThread>().pathStr(t => t.status)]: NoteStatus.Todo
    };
    return this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, queryParams);
  }

  onlineSync(id: string): Promise<void> {
    return this.onlineInvoke('sync', { projectId: id });
  }

  onlineCancelSync(id: string): Promise<void> {
    return this.onlineInvoke('cancelSync', { projectId: id });
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

  onlineInvite(id: string, email: string, locale: string, role: string): Promise<string | undefined> {
    return this.onlineInvoke('invite', { projectId: id, email, locale, role });
  }

  async onlineUninviteUser(projectId: string, emailToUninvite: string): Promise<string> {
    return (await this.onlineInvoke<string>('uninviteUser', { projectId, emailToUninvite }))!;
  }

  async onlineIsSourceProject(projectId: string): Promise<boolean> {
    return (await this.onlineInvoke<boolean>('isSourceProject', { projectId }))!;
  }

  async onlineGetLinkSharingKey(projectId: string, role: SFProjectRole): Promise<string> {
    return (await this.onlineInvoke<string>('linkSharingKey', { projectId, role })) ?? '';
  }

  transceleratorQuestions(projectId: string, cancel: Subject<void>): RetryingRequest<TransceleratorQuestion[]> {
    return this.onlineRetryInvoke<TransceleratorQuestion[]>('transceleratorQuestions', cancel, { projectId });
  }

  async onlineSetUserProjectPermissions(projectId: string, userId: string, permissions: string[]): Promise<void> {
    return (await this.onlineInvoke<void>('setUserProjectPermissions', { projectId, userId, permissions }))!;
  }
}
