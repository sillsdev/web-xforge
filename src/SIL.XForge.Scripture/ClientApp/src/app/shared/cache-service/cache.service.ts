import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

const KEEP_PRIOR_PROJECT_CACHED_UNTIL_NEW_PROJECT_ACTIVATED = false;

@Injectable({ providedIn: 'root' })
export class CacheService {
  private subscribedTexts: TextDoc[] = [];
  private docSubscription?: DocSubscription;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly currentProject: ActivatedProjectService,
    private readonly destroyRef: DestroyRef
  ) {
    currentProject.projectId$.pipe(takeUntilDestroyed(destroyRef)).subscribe(async projectId => {
      if (projectId == null && KEEP_PRIOR_PROJECT_CACHED_UNTIL_NEW_PROJECT_ACTIVATED) return;

      this.uncache();
      if (projectId != null) {
        this.docSubscription = new DocSubscription('CacheService');
        const project = await this.projectService.subscribeProfile(projectId, this.docSubscription);
        await this.loadAllChapters(project, this.docSubscription);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.uncache();
    });
  }

  private uncache(): void {
    this.docSubscription?.unsubscribe();
    this.subscribedTexts = [];
  }

  private async loadAllChapters(project: SFProjectProfileDoc, docSubscription: DocSubscription): Promise<void> {
    if (project?.data != null) {
      const sourceId = project.data.translateConfig.source?.projectRef;

      for (const text of project.data.texts) {
        for (const chapter of text.chapters) {
          if (this.currentProject.projectId != null && this.currentProject.projectId !== project.id) return;

          const textDocId = new TextDocId(project.id, text.bookNum, chapter.number, 'target');
          if (await this.permissionsService.canAccessText(textDocId)) {
            this.subscribedTexts.push(await this.projectService.getText(textDocId, docSubscription));
          }

          if (text.hasSource && sourceId != null) {
            const sourceTextDocId = new TextDocId(sourceId, text.bookNum, chapter.number, 'target');
            if (await this.permissionsService.canAccessText(sourceTextDocId)) {
              this.subscribedTexts.push(await this.projectService.getText(sourceTextDocId, docSubscription));
            }
          }
        }
      }
    }
  }
}
