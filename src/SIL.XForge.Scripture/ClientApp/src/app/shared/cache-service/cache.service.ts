import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedProjectService } from '../../../xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly subscribedTexts: TextDoc[] = [];

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly currentProject: ActivatedProjectService,
    destroyRef: DestroyRef
  ) {
    currentProject.projectId$.pipe(takeUntilDestroyed(destroyRef)).subscribe(async projectId => {
      if (projectId == null) return;

      this.uncache();
      const project = await this.projectService.getProfile(projectId);
      await this.cache(project);
    });
  }

  private uncache(): void {
    for (const t of this.subscribedTexts) {
      t.adapter.destroy();
    }

    this.subscribedTexts.length = 0;
  }

  private async cache(project: SFProjectProfileDoc): Promise<void> {
    await this.loadAllChapters(project);
  }

  private async loadAllChapters(project: SFProjectProfileDoc): Promise<void> {
    if (project?.data != null) {
      const sourceId = project.data.translateConfig.source?.projectRef;

      for (const text of project.data.texts) {
        for (const chapter of text.chapters) {
          if (this.currentProject.projectId != null && this.currentProject.projectId !== project.id) return;

          const textDocId = new TextDocId(project.id, text.bookNum, chapter.number, 'target');
          if (await this.permissionsService.canAccessText(textDocId)) {
            this.subscribedTexts.push(await this.projectService.getText(textDocId));
          }

          if (text.hasSource && sourceId != null) {
            const sourceTextDocId = new TextDocId(sourceId, text.bookNum, chapter.number, 'target');
            if (await this.permissionsService.canAccessText(sourceTextDocId)) {
              this.subscribedTexts.push(await this.projectService.getText(sourceTextDocId));
            }
          }
        }
      }
    }
  }
}
