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
import { CommandService } from 'xforge-common/command.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ProjectService } from 'xforge-common/project.service';
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
    http: HttpClient,
    private readonly machineHttp: MachineHttpClient
  ) {
    super(realtimeService, commandService, SF_PROJECT_ROLES, http);
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

  queryQuestionCount(
    id: string,
    options: { bookNum?: number; activeOnly?: boolean } = {}
  ): Promise<RealtimeQuery<QuestionDoc>> {
    const queryParams: QueryParameters = {
      $count: true,
      [obj<Question>().pathStr(q => q.projectRef)]: id
    };
    if (options.bookNum != null) {
      queryParams[obj<Question>().pathStr(q => q.verseRef.bookNum)] = options.bookNum;
    }
    if (options.activeOnly != null && options.activeOnly) {
      queryParams[obj<Question>().pathStr(q => q.isArchived)] = false;
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
}
