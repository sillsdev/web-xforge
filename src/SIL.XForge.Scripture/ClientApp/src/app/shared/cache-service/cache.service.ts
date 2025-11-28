import { EventEmitter, Injectable } from '@angular/core';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private abortCurrent: EventEmitter<void> = new EventEmitter();
  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService
  ) {}

  async cache(project: SFProjectProfileDoc): Promise<void> {
    this.abortCurrent.emit();
    await this.loadAllChapters(project);
  }

  private async loadAllChapters(project: SFProjectProfileDoc): Promise<void> {
    let abort = false;
    const sub = this.abortCurrent.subscribe(() => (abort = true));

    if (project?.data != null) {
      const sourceId = project.data.translateConfig.source?.projectRef;

      for (const text of project.data.texts) {
        for (const chapter of text.chapters) {
          if (abort) {
            sub.unsubscribe();
            return;
          }

          const textDocId = new TextDocId(project.id, text.bookNum, chapter.number, 'target');
          if (await this.permissionsService.canAccessText(textDocId)) {
            await this.projectService.getText(textDocId);
          }

          if (text.hasSource && sourceId != null) {
            const sourceTextDocId = new TextDocId(sourceId, text.bookNum, chapter.number, 'target');
            if (await this.permissionsService.canAccessText(sourceTextDocId)) {
              await this.projectService.getText(sourceTextDocId);
            }
          }
        }
      }
    }
  }
}
