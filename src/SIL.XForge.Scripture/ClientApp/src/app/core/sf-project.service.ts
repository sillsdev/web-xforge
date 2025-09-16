import { DestroyRef, Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { BiblicalTerm } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { getNoteThreadDocId, NoteStatus, NoteThread } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import {
  SF_PROJECTS_COLLECTION,
  SFProject,
  SFProjectProfile
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { getSFProjectUserConfigDocId } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { Subject } from 'rxjs';
import { CommandService } from 'xforge-common/command.service';
import { LocationService } from 'xforge-common/location.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ProjectService } from 'xforge-common/project.service';
import { QueryParameters, QueryResults } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RetryingRequest, RetryingRequestService } from 'xforge-common/retrying-request.service';
import { TransceleratorQuestion } from '../checking/import-questions-dialog/import-questions-dialog.component';
import { EventMetric } from '../event-metrics/event-metric';
import { ShareLinkType } from '../shared/share/share-dialog.component';
import { InviteeStatus } from '../users/collaborators/collaborators.component';
import { BiblicalTermDoc } from './models/biblical-term-doc';
import { NoteThreadDoc } from './models/note-thread-doc';
import { SFProjectCreateSettings } from './models/sf-project-create-settings';
import { SFProjectDoc } from './models/sf-project-doc';
import { SFProjectProfileDoc } from './models/sf-project-profile-doc';
import { SF_PROJECT_ROLES } from './models/sf-project-role-info';
import { SFProjectSettings } from './models/sf-project-settings';
import { SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
import { TextAudioDoc } from './models/text-audio-doc';
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
    private readonly locationService: LocationService,
    protected readonly retryingRequestService: RetryingRequestService
  ) {
    super(realtimeService, commandService, retryingRequestService, SF_PROJECT_ROLES);
  }

  static hasDraft(project: SFProjectProfile): boolean {
    return project.texts.some(text => text.chapters.some(chapter => chapter.hasDraft));
  }

  async onlineCreate(settings: SFProjectCreateSettings): Promise<string> {
    return (await this.onlineInvoke<string>('create', { settings }))!;
  }

  /**
   * Creates an SF project/resource with the given paratext id, and adds the user to it.
   * @param paratextId The paratext id of the project or resource.
   * @returns The SF project id.
   */
  async onlineCreateResourceProject(paratextId: string): Promise<string | undefined> {
    return this.onlineInvoke<string>('createResourceProject', { paratextId });
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

  getNoteThread(threadDataId: string): Promise<NoteThreadDoc> {
    return this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, threadDataId);
  }

  getBiblicalTerm(biblicalTermId: string): Promise<BiblicalTermDoc> {
    return this.realtimeService.subscribe(BiblicalTermDoc.COLLECTION, biblicalTermId);
  }

  async createNoteThread(projectId: string, noteThread: NoteThread): Promise<void> {
    const docId: string = getNoteThreadDocId(projectId, noteThread.dataId);
    await this.realtimeService.create<NoteThreadDoc>(NoteThreadDoc.COLLECTION, docId, noteThread);
  }

  generateSharingUrl(shareKey: string, localeCode?: string): string {
    let url = `${this.locationService.origin}/join/${shareKey}`;
    if (localeCode != null) {
      url += `/${localeCode}`;
    }
    return url;
  }

  queryNoteThreads(
    sfProjectId: string,
    bookNum: number,
    chapterNum: number,
    destroyRef: DestroyRef
  ): Promise<RealtimeQuery<NoteThreadDoc>> {
    const queryParams: QueryParameters = {
      [obj<NoteThread>().pathStr(t => t.projectRef)]: sfProjectId,
      [obj<NoteThread>().pathStr(t => t.status)]: NoteStatus.Todo,
      [obj<NoteThread>().pathStr(t => t.verseRef.bookNum)]: bookNum,
      [obj<NoteThread>().pathStr(t => t.verseRef.chapterNum)]: chapterNum
    };
    return this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, queryParams, destroyRef);
  }

  queryAudioText(sfProjectId: string, destroyRef: DestroyRef): Promise<RealtimeQuery<TextAudioDoc>> {
    const queryParams: QueryParameters = {
      [obj<TextAudio>().pathStr(t => t.projectRef)]: sfProjectId
    };
    return this.realtimeService.subscribeQuery(TextAudioDoc.COLLECTION, queryParams, destroyRef);
  }

  queryBiblicalTerms(sfProjectId: string, destroyRef: DestroyRef): Promise<RealtimeQuery<BiblicalTermDoc>> {
    const queryParams: QueryParameters = {
      [obj<BiblicalTerm>().pathStr(t => t.projectRef)]: sfProjectId
    };
    return this.realtimeService.subscribeQuery(BiblicalTermDoc.COLLECTION, queryParams, destroyRef);
  }

  queryBiblicalTermNoteThreads(sfProjectId: string, destroyRef: DestroyRef): Promise<RealtimeQuery<NoteThreadDoc>> {
    const parameters: QueryParameters = {
      [obj<NoteThread>().pathStr(t => t.projectRef)]: sfProjectId,
      [obj<NoteThread>().pathStr(t => t.biblicalTermId)]: { $ne: null }
    };
    return this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, parameters, destroyRef);
  }

  onlineSync(id: string): Promise<void> {
    return this.onlineInvoke('sync', { projectId: id });
  }

  onlineCancelSync(id: string): Promise<void> {
    return this.onlineInvoke('cancelSync', { projectId: id });
  }

  onlineSetPreTranslate(projectId: string, preTranslate: boolean): Promise<void> {
    return this.onlineInvoke<void>('setPreTranslate', {
      projectId,
      preTranslate
    });
  }

  onlineAddChapters(projectId: string, book: number, chapters: number[]): Promise<void> {
    return this.onlineInvoke<void>('addChapters', { projectId, book, chapters });
  }

  onlineUpdateSettings(id: string, settings: SFProjectSettings): Promise<void> {
    return this.onlineInvoke('updateSettings', { projectId: id, settings });
  }

  async onlineIsAlreadyInvited(id: string, email: string): Promise<boolean> {
    return (await this.onlineInvoke<boolean>('isAlreadyInvited', {
      projectId: id,
      email
    }))!;
  }

  /** Get list of email addresses that have outstanding invitations on project.
   * Caller must be an admin on the project. */
  async onlineInvitedUsers(projectId: string): Promise<InviteeStatus[]> {
    return (await this.onlineInvoke<InviteeStatus[]>('invitedUsers', {
      projectId
    }))!;
  }

  /** Get added into project with specified shareKey code. */
  async onlineJoinWithShareKey(shareKey: string): Promise<string> {
    return (await this.onlineInvoke<string>('joinWithShareKey', { shareKey }))!;
  }

  onlineInvite(id: string, email: string, locale: string, role: string): Promise<string | undefined> {
    return this.onlineInvoke('invite', { projectId: id, email, locale, role });
  }

  async onlineUninviteUser(projectId: string, emailToUninvite: string): Promise<string> {
    return (await this.onlineInvoke<string>('uninviteUser', {
      projectId,
      emailToUninvite
    }))!;
  }

  async onlineIsSourceProject(projectId: string): Promise<boolean> {
    return (await this.onlineInvoke<boolean>('isSourceProject', {
      projectId
    }))!;
  }

  async onlineGetLinkSharingKey(
    projectId: string,
    role: SFProjectRole,
    shareLinkType: ShareLinkType,
    daysBeforeExpiration: number
  ): Promise<string> {
    return (
      (await this.onlineInvoke<string>('linkSharingKey', {
        projectId,
        role,
        shareLinkType,
        daysBeforeExpiration
      })) ?? ''
    );
  }

  async onlineReserveLinkSharingKey(shareKey: string, daysBeforeExpiration: number): Promise<void> {
    await this.onlineInvoke<void>('reserveLinkSharingKey', { shareKey, daysBeforeExpiration });
  }

  transceleratorQuestions(projectId: string, cancel: Subject<void>): RetryingRequest<TransceleratorQuestion[]> {
    return this.onlineRetryInvoke<TransceleratorQuestion[]>('transceleratorQuestions', cancel, { projectId });
  }

  async onlineSetRoleProjectPermissions(projectId: string, role: string, permissions: string[]): Promise<void> {
    return (await this.onlineInvoke<void>('setRoleProjectPermissions', {
      projectId,
      role,
      permissions
    }))!;
  }

  async onlineSetUserProjectPermissions(projectId: string, userId: string, permissions: string[]): Promise<void> {
    return (await this.onlineInvoke<void>('setUserProjectPermissions', {
      projectId,
      userId,
      permissions
    }))!;
  }

  async onlineCreateAudioTimingData(
    projectId: string,
    book: number,
    chapter: number,
    timingData: AudioTiming[],
    audioUrl: string
  ): Promise<void> {
    return await this.onlineInvoke('createAudioTimingData', {
      projectId,
      book,
      chapter,
      timingData,
      audioUrl
    });
  }

  async onlineDeleteAudioTimingData(projectId: string, book: number, chapter: number): Promise<void> {
    return await this.onlineInvoke('deleteAudioTimingData', {
      projectId,
      book,
      chapter
    });
  }

  async onlineSetServalConfig(projectId: string, servalConfig: string | null | undefined): Promise<void> {
    return await this.onlineInvoke<void>('setServalConfig', {
      projectId,
      servalConfig
    });
  }

  async onlineSetUsfmConfig(projectId: string, config: DraftUsfmConfig): Promise<void> {
    return await this.onlineInvoke<void>('setUsfmConfig', {
      projectId,
      config
    });
  }

  async onlineSetDraftApplied(
    projectId: string,
    book: number,
    chapter: number,
    draftApplied: boolean,
    lastVerse: number
  ): Promise<void> {
    return await this.onlineInvoke('setDraftApplied', {
      projectId,
      book,
      chapter,
      draftApplied,
      lastVerse
    });
  }

  async onlineSetIsValid(projectId: string, book: number, chapter: number, isValid: boolean): Promise<void> {
    return await this.onlineInvoke('setIsValid', {
      projectId,
      book,
      chapter,
      isValid
    });
  }

  async onlineEventMetrics(
    projectId: string,
    pageIndex: number,
    pageSize: number
  ): Promise<QueryResults<EventMetric> | undefined> {
    return await this.onlineInvoke<QueryResults<EventMetric>>('eventMetrics', { projectId, pageIndex, pageSize });
  }

  async onlineAllEventMetricsForConstructionDraftJobs(
    projectId?: string,
    daysBack?: number
  ): Promise<QueryResults<EventMetric> | undefined> {
    const params: any = {
      projectId: projectId ?? null,
      scopes: [3], // Drafting scope
      eventTypes: [
        'StartPreTranslationBuildAsync',
        'BuildProjectAsync',
        'RetrievePreTranslationStatusAsync',
        'CancelPreTranslationBuildAsync'
      ]
    };

    if (daysBack != null) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysBack);
      params.fromDate = fromDate.toISOString();
    }

    return await this.onlineInvoke<QueryResults<EventMetric>>('eventMetrics', params);
  }
}
