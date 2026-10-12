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
    if (project?.data == null) return;

    let abort = false;
    const abortSub = this.abortCurrent.subscribe(() => (abort = true));
    // Stop caching if the project is deleted, because its chapters can no longer be loaded
    const deleteSub = project.delete$.subscribe(() => (abort = true));

    try {
      const sourceId = project.data.translateConfig.source?.projectRef;

      for (const text of project.data.texts) {
        for (const chapter of text.chapters) {
          if (abort) return;

          const textDocId = new TextDocId(project.id, text.bookNum, chapter.number, 'target');
          if (await this.permissionsService.canAccessTextAsync(textDocId)) {
            await this.projectService.getText(textDocId);
          }

          if (text.hasSource && sourceId != null) {
            const sourceTextDocId = new TextDocId(sourceId, text.bookNum, chapter.number, 'target');
            if (await this.permissionsService.canAccessTextAsync(sourceTextDocId)) {
              await this.projectService.getText(sourceTextDocId);
            }
          }
        }
      }
    } catch (error) {
      // A chapter that was loading when the project was deleted can fail to load. Caching has stopped, so ignore it.
      if (!abort) throw error;
    } finally {
      abortSub.unsubscribe();
      deleteSub.unsubscribe();
    }
  }
}
