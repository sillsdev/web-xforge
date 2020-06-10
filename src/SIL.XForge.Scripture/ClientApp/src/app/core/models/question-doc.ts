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

  isFileAvailableOffline(fileType: FileType, dataId: string): boolean {
    if (this.data == null || fileType !== FileType.Audio) {
      return false;
    }
    return this.data.dataId === dataId && !this.data.isArchived;
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
