import { ProjectDoc } from 'xforge-common/models/project-doc';
import { CommentListDoc } from './comment-list-doc';
import { QuestionListDoc } from './question-list-doc';
import { SFProject } from './sfproject';
import { SFProjectUserConfigDoc } from './sfproject-user-config-doc';
import { TextDoc } from './text-doc';

export class SFProjectDoc extends ProjectDoc<SFProject> {
  get taskNames(): string[] {
    const names: string[] = [];
    if (this.data.checkingEnabled != null && this.data.checkingEnabled) {
      names.push('Community Checking');
    }
    if (this.data.translateEnabled != null && this.data.translateEnabled) {
      names.push('Translate');
    }
    return names;
  }

  protected onDelete(): void {
    super.onDelete();
    this.deleteProjectDocs(SFProjectUserConfigDoc.TYPE);
    this.deleteProjectDocs(TextDoc.TYPE);
    this.deleteProjectDocs(QuestionListDoc.TYPE);
    this.deleteProjectDocs(CommentListDoc.TYPE);
  }

  private async deleteProjectDocs(type: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const id of await this.store.getAllIds(type)) {
      if (id.startsWith(this.id)) {
        tasks.push(this.store.delete(type, id));
      }
    }
    await Promise.all(tasks);
  }
}
