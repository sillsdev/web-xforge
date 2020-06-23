import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { LatinWordTokenizer, MAX_SEGMENT_LENGTH, RemoteTranslationEngine } from '@sillsdev/machine';
import * as crc from 'crc-32';
import { obj } from 'realtime-server/lib/common/utils/obj-path';
import { getQuestionDocId, Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SF_PROJECTS_COLLECTION, SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { AudioService } from 'xforge-common/audio.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandService } from 'xforge-common/command.service';
import { AudioData } from 'xforge-common/models/audio-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ProjectService } from 'xforge-common/project.service';
import { PwaService } from 'xforge-common/pwa.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { MachineHttpClient } from './machine-http-client';
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
    private readonly pwaService: PwaService,
    private readonly authService: AuthService,
    private readonly audioService: AudioService,
    http: HttpClient,
    private readonly machineHttp: MachineHttpClient
  ) {
    super(realtimeService, commandService, SF_PROJECT_ROLES, http);

    this.subscribe(this.pwaService.onlineStatus, async isOnline => {
      // Wait until logged in so that the remote store gets initialized
      if (isOnline && (await this.authService.isLoggedIn)) {
        const audioData = await this.realtimeService.offlineStore.getAllData<AudioData>(AudioData.COLLECTION);
        for (const audio of audioData) {
          if (audio.deleteRef != null && audio.projectRef != null) {
            await this.onlineDeleteAudio(audio.projectRef, audio.id, audio.deleteRef);
            await this.realtimeService.removeOfflineData(AudioData.COLLECTION, audio.id);
            continue;
          }
          if (audio.onlineUrl == null && audio.projectRef != null && audio.dataCollection === QuestionDoc.COLLECTION) {
            // The audio file has not been uploaded to the server
            const doc = this.realtimeService.get<QuestionDoc>(audio.dataCollection, audio.realtimeDocRef!);
            let url: string;
            if (doc.data != null) {
              url = await this.onlineUploadAudio(audio.projectRef, audio.id, new File([audio.blob!], audio.filename!));
              if (doc.data.dataId === audio.id) {
                // The audio belongs to the question
                doc.submitJson0Op(op => op.set(qd => qd.audioUrl!, url));
                this.findOrUpdateAudioCache(audio.dataCollection, audio.id, url);
              } else {
                const answerIndex = doc.data.answers.findIndex(a => a.dataId === audio.id);
                doc.submitJson0Op(op => op.set(qd => qd.answers[answerIndex].audioUrl!, url));
                // Audio on answers are not cached
                this.realtimeService.removeOfflineData(AudioData.COLLECTION, audio.id);
              }
            }
          }
        }
      }
    });
  }

  async onlineCreate(settings: SFProjectCreateSettings): Promise<string> {
    return (await this.onlineInvoke<string>('create', { settings }))!;
  }

  getUserConfig(id: string, userId: string): Promise<SFProjectUserConfigDoc> {
    return this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(id, userId));
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
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

  createQuestion(id: string, question: Question): Promise<QuestionDoc> {
    return this.realtimeService.create(QuestionDoc.COLLECTION, getQuestionDocId(id, question.dataId), question);
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
  async onlineInvitedUsers(projectId: string): Promise<string[]> {
    return (await this.onlineInvoke<string[]>('invitedUsers', { projectId }))!;
  }

  /** Get added into project, with optionally specified shareKey code. */
  onlineCheckLinkSharing(id: string, shareKey?: string): Promise<void> {
    return this.onlineInvoke('checkLinkSharing', { projectId: id, shareKey });
  }

  onlineInvite(id: string, email: string): Promise<string | undefined> {
    return this.onlineInvoke('invite', { projectId: id, email });
  }

  async onlineUninviteUser(projectId: string, emailToUninvite: string): Promise<string> {
    return (await this.onlineInvoke<string>('uninviteUser', { projectId, emailToUninvite }))!;
  }

  /**
   * Iterate through the questions in a project and cache the up-to-date audio data if it exists.
   */
  async onlineCacheAudio(id: string): Promise<void> {
    const questionsQuery = await this.queryQuestions(id);
    const subscription = this.subscribe(questionsQuery.ready$, () => {
      for (const qd of questionsQuery.docs) {
        if (qd.data != null) {
          if (qd.data.isArchived) {
            this.findOrUpdateAudioCache(qd.collection, qd.data.dataId, undefined);
          } else {
            this.findOrUpdateAudioCache(qd.collection, qd.data.dataId, qd.data.audioUrl);
          }
        }
      }
      subscription.unsubscribe();
    });
  }

  findOrUpdateAudioCache(dataCollection: string, dataId: string, url?: string): Promise<AudioData | undefined> {
    return this.audioService.findOrUpdateCache(dataCollection, dataId, url);
  }

  async trainSelectedSegment(projectUserConfig: SFProjectUserConfig): Promise<void> {
    if (
      projectUserConfig.selectedTask !== 'translate' ||
      projectUserConfig.selectedBookNum == null ||
      projectUserConfig.selectedChapterNum == null ||
      projectUserConfig.selectedSegment === '' ||
      projectUserConfig.selectedSegmentChecksum == null
    ) {
      return;
    }

    const targetDoc = await this.getText(
      getTextDocId(
        projectUserConfig.projectRef,
        projectUserConfig.selectedBookNum,
        projectUserConfig.selectedChapterNum,
        'target'
      )
    );
    const targetText = targetDoc.getSegmentText(projectUserConfig.selectedSegment);
    if (targetText === '') {
      return;
    }
    const checksum = crc.str(targetText);
    if (checksum === projectUserConfig.selectedSegmentChecksum) {
      return;
    }

    const sourceDoc = await this.getText(
      getTextDocId(
        projectUserConfig.projectRef,
        projectUserConfig.selectedBookNum,
        projectUserConfig.selectedChapterNum,
        'source'
      )
    );
    const sourceText = sourceDoc.getSegmentText(projectUserConfig.selectedSegment);
    if (sourceText === '') {
      return;
    }

    const wordTokenizer = new LatinWordTokenizer();
    const sourceWords = wordTokenizer.tokenizeToStrings(sourceText);
    if (sourceWords.length > MAX_SEGMENT_LENGTH) {
      return;
    }

    const translationEngine = this.createTranslationEngine(projectUserConfig.projectRef);
    const session = await translationEngine.translateInteractively(sourceWords);
    const tokenRanges = wordTokenizer.tokenize(targetText);
    const prefix = tokenRanges.map(r => targetText.substring(r.start, r.end));
    const isLastWordComplete =
      tokenRanges.length === 0 || tokenRanges[tokenRanges.length - 1].end !== targetText.length;
    session.setPrefix(prefix, isLastWordComplete);
    await session.approve(true);
    console.log(
      'Segment ' +
        projectUserConfig.selectedSegment +
        ' of document ' +
        Canon.bookNumberToId(projectUserConfig.selectedBookNum) +
        ' was trained successfully.'
    );
  }

  /**
   * Uploads the audio file to the file server, or if offline, stores the audio in IndexedDB and uploads
   * next time there is a valid connection.
   */
  async uploadAudio(
    id: string,
    dataCollection: string,
    dataId: string,
    realtimeDocRef: string,
    blob: Blob,
    filename: string
  ): Promise<string> {
    if (this.pwaService.isOnline) {
      // We are online. Upload directly to the server
      const onlineUrl = await this.onlineUploadAudio(id, dataId, new File([blob], filename));
      if (dataCollection === QuestionDoc.COLLECTION && realtimeDocRef === getQuestionDocId(id, dataId)) {
        await this.findOrUpdateAudioCache(dataCollection, dataId, onlineUrl);
      }
      return onlineUrl;
    }
    // Store the audio in indexedDB until we go online again
    let localAudioData = AudioData.createUploadData(dataCollection, dataId, id, realtimeDocRef, blob, filename);
    localAudioData = await this.realtimeService.storeOfflineData(localAudioData);
    return URL.createObjectURL(localAudioData.blob);
  }

  /**
   * Deletes the audio file from the file server, or if offline, deletes the audio file from IndexedDB if present.
   * If the file is not present in IndexedDB, delete the audio file from the file server next time there is a
   * valid connection.
   */
  async deleteAudio(id: string, dataCollection: string, dataId: string, ownerId: string): Promise<void> {
    if (this.pwaService.isOnline) {
      await this.findOrUpdateAudioCache(dataCollection, dataId, undefined);
      return this.onlineDeleteAudio(id, dataId, ownerId);
    }
    const audio = await this.realtimeService.offlineStore.getData<AudioData>(AudioData.COLLECTION, dataId);
    if (audio != null && audio.onlineUrl == null) {
      // The audio existed locally and was never uploaded, remove it and return
      await this.findOrUpdateAudioCache(audio.dataCollection, audio.id, undefined);
      return;
    }
    this.realtimeService.storeOfflineData(AudioData.createDeletionData(dataCollection, dataId, id, ownerId));
  }
}
