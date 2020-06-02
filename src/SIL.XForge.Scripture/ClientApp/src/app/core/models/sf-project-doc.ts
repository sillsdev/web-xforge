import {
  SF_PROJECT_INDEX_PATHS,
  SF_PROJECTS_COLLECTION,
  SFProject
} from 'realtime-server/lib/scriptureforge/models/sf-project';
import { TEXTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/text-data';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
import { QuestionDoc } from './question-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc, TextDocId } from './text-doc';

export class SFProjectDoc extends ProjectDoc<SFProject> {
  static readonly COLLECTION = SF_PROJECTS_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECT_INDEX_PATHS;

  get taskNames(): string[] {
    if (this.data == null) {
      return [];
    }
    const names: string[] = ['Translate'];
    if (this.data.checkingConfig.checkingEnabled) {
      names.push('Community Checking');
    }
    return names;
  }

  loadTextDocs(bookNum?: number): Promise<RealtimeDoc[]> {
    const texts: Promise<RealtimeDoc>[] = [];
    for (const textDocId of this.getTextDocs(bookNum)) {
      texts.push(this.realtimeService.subscribe(TEXTS_COLLECTION, textDocId.toString()));
    }
    return Promise.all(texts);
  }

  async unLoadTextDocs(bookNum?: number): Promise<void> {
    for (const textDocId of this.getTextDocs(bookNum)) {
      const doc = this.realtimeService.get(TEXTS_COLLECTION, textDocId.toString());
      await doc.dispose();
    }
  }

  private getTextDocs(bookNum?: number): TextDocId[] {
    const texts: TextDocId[] = [];
    if (this.data != null) {
      for (const text of this.data.texts) {
        if (bookNum == null || bookNum === text.bookNum) {
          for (const chapter of text.chapters) {
            texts.push(new TextDocId(this.id, text.bookNum, chapter.number, 'target'));
          }
        }
      }
    }
    return texts;
  }

  protected async onDelete(): Promise<void> {
    await super.onDelete();
    await this.deleteProjectDocs(SFProjectUserConfigDoc.COLLECTION);
    await this.deleteProjectDocs(TextDoc.COLLECTION);
    await this.deleteProjectDocs(QuestionDoc.COLLECTION);
  }

  private async deleteProjectDocs(collection: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const id of await this.realtimeService.offlineStore.getAllIds(collection)) {
      if (id.startsWith(this.id)) {
        tasks.push(this.realtimeService.offlineStore.delete(collection, id));
      }
    }
    await Promise.all(tasks);
  }
}
