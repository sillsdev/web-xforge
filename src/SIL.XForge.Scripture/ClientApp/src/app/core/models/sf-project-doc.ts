import { SF_PROJECTS_COLLECTION, SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { QuestionListDoc } from './question-list-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc } from './text-doc';

export class SFProjectDoc extends ProjectDoc<SFProject> {
  static readonly COLLECTION = SF_PROJECTS_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(SFProjectDoc.COLLECTION, adapter, store);
  }

  get taskNames(): string[] {
    const names: string[] = ['Translate'];
    if (this.data.checkingEnabled != null && this.data.checkingEnabled) {
      names.push('Community Checking');
    }
    return names;
  }

  protected onDelete(): void {
    super.onDelete();
    this.deleteProjectDocs(SFProjectUserConfigDoc.COLLECTION);
    this.deleteProjectDocs(TextDoc.COLLECTION);
    this.deleteProjectDocs(QuestionListDoc.COLLECTION);
  }

  private async deleteProjectDocs(collection: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const id of await this.store.getAllIds(collection)) {
      if (id.startsWith(this.id)) {
        tasks.push(this.store.delete(collection, id));
      }
    }
    await Promise.all(tasks);
  }
}
