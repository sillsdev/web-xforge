import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { QuestionDoc } from './question-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc } from './text-doc';

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
