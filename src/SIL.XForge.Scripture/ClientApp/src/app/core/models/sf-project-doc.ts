import { SF_PROJECTS_COLLECTION, SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { QuestionDoc } from './question-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc } from './text-doc';

export class SFProjectDoc extends ProjectDoc<SFProject> {
  static readonly COLLECTION = SF_PROJECTS_COLLECTION;

  get taskNames(): string[] {
    const names: string[] = ['Translate'];
    if (this.data.checkingConfig.checkingEnabled) {
      names.push('Community Checking');
    }
    return names;
  }

  protected onDelete(): void {
    super.onDelete();
    this.deleteProjectDocs(SFProjectUserConfigDoc.COLLECTION);
    this.deleteProjectDocs(TextDoc.COLLECTION);
    this.deleteProjectDocs(QuestionDoc.COLLECTION);
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
