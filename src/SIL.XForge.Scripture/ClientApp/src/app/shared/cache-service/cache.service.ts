import { DestroyRef, EventEmitter, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedProjectService } from '../../../xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly abortCurrent: EventEmitter<void> = new EventEmitter();
  private readonly subscribedTexts: TextDoc[] = [];

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    currentProject: ActivatedProjectService,
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
    this.subscribedTexts.forEach(t => t.adapter.destroy());
    this.subscribedTexts.length = 0;
  }

  private async cache(project: SFProjectProfileDoc): Promise<void> {
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
