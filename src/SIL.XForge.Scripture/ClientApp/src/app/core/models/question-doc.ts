import { obj, PathItem } from 'realtime-server/lib/common/utils/obj-path';
import {
  Question,
  QUESTIONS_COLLECTION,
  QUESTION_INDEX_PATHS
} from 'realtime-server/lib/scriptureforge/models/question';
import { FileType } from 'xforge-common/models/file-offline-data';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';
import { RealtimeOfflineData } from 'xforge-common/models/realtime-offline-data';

/**
 * This is the real-time doc for a community checking question.
 */
export class QuestionDoc extends ProjectDataDoc<Question> {
  static readonly COLLECTION = QUESTIONS_COLLECTION;
  static readonly INDEX_PATHS = QUESTION_INDEX_PATHS;

  alwaysKeepFileOffline(fileType: FileType, dataId: string): boolean {
    return this.data != null && fileType === FileType.Audio && !this.data.isArchived && this.data.dataId === dataId;
  }

  async updateFileCache(): Promise<void> {
    if (this.realtimeService.fileService == null || this.data == null) {
      return;
    }

    await this.realtimeService.fileService.findOrUpdateCache(
      FileType.Audio,
      this.collection,
      this.data.dataId,
      this.data.isArchived ? undefined : this.data.audioUrl
    );
  }

  async updateAnswerFileCache() {
    if (this.realtimeService.fileService == null || this.data == null) {
      return;
    }

    for (const answer of this.data.answers) {
      await this.realtimeService.fileService.findOrUpdateCache(
        FileType.Audio,
        this.collection,
        answer.dataId,
        answer.audioUrl
      );
    }
  }

  protected getFileUrlPath(fileType: FileType, dataId: string): PathItem[] | undefined {
    if (this.data == null || fileType !== FileType.Audio) {
      return undefined;
    }

    if (this.data.dataId === dataId) {
      // The file belongs to the question
      return obj<Question>().path(q => q.audioUrl!);
    } else {
      // otherwise, it is probably belongs to an answer
      const answerIndex = this.data.answers.findIndex(a => a.dataId === dataId);
      if (answerIndex !== -1) {
        return obj<Question>().path(q => q.answers[answerIndex].audioUrl!);
      }
    }
    return undefined;
  }

  protected async updateOfflineData(force: boolean = false): Promise<void> {
    // Check to see if any answers have been removed by comparing with current offline data
    if (this.realtimeService.offlineStore != null && this.realtimeService.fileService != null) {
      const offlineData = await this.realtimeService.offlineStore.get<RealtimeOfflineData>(this.collection, this.id);
      if (offlineData != null) {
        for (const answer of offlineData.data.answers) {
          const file = await this.realtimeService.fileService!.get(FileType.Audio, answer.dataId);
          if (file != null && this.data!.answers.find(a => a.dataId === answer.dataId) == null) {
            await this.realtimeService.fileService!.findOrUpdateCache(FileType.Audio, this.collection, answer.dataId);
          }
        }
      }
    }
    await super.updateOfflineData(force);
    await this.updateFileCache();
  }
}
