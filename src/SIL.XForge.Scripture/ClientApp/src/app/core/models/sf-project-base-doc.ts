import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TEXTS_COLLECTION } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
import { QuestionDoc } from './question-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc, TextDocId } from './text-doc';

export abstract class SFProjectBaseDoc<T extends SFProjectProfile> extends ProjectDoc<T> {
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
      if (this.realtimeService.isSet(TEXTS_COLLECTION, textDocId.toString())) {
        const doc = this.realtimeService.get(TEXTS_COLLECTION, textDocId.toString());
        await doc.dispose();
      }
    }
  }

  protected async onDelete(): Promise<void> {
    await super.onDelete();
    await this.deleteProjectDocs(SFProjectUserConfigDoc.COLLECTION);
    await this.deleteProjectDocs(TextDoc.COLLECTION);
    await this.deleteProjectDocs(QuestionDoc.COLLECTION);
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
