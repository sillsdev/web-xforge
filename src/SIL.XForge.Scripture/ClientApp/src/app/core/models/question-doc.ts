import { obj, PathItem } from 'realtime-server/lib/common/utils/obj-path';
import {
  Question,
  QUESTION_INDEX_PATHS,
  QUESTIONS_COLLECTION
} from 'realtime-server/lib/scriptureforge/models/question';
import { FileType } from 'xforge-common/models/file-offline-data';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

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
}
