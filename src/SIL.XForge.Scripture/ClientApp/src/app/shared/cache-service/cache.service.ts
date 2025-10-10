import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

/** Fetches and holds a DocSubscription to chapter texts for the last activated project. (i.e. the currently activated
 * project, or the most recent one if there is no currently activated project.) */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private docSubscription?: DocSubscription;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      this.uncache();
    });
    activatedProjectService.projectDoc$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(async (sfProjectProfileDoc?: SFProjectProfileDoc) => {
        // Do not uncache until the next project is activated.
        if (sfProjectProfileDoc == null) return;
        this.uncache();
        this.docSubscription = new DocSubscription('CacheService');
        await this.loadAllChapters(sfProjectProfileDoc, this.docSubscription);
      });
  }

  private uncache(): void {
    this.docSubscription?.unsubscribe();
  }

  private async loadAllChapters(project: SFProjectProfileDoc, docSubscription: DocSubscription): Promise<void> {
    if (project.data == null) return;
    const sourceId: string | undefined = project.data.translateConfig.source?.projectRef;

    for (const text of project.data.texts) {
      for (const chapter of text.chapters) {
        // Keep caching if the activated project merely became undefined and is only potentially going to change. But
        // stop if the activated project has changed to a different one while we are still caching.
        if (this.activatedProjectService.projectDoc != null && this.activatedProjectService.projectDoc !== project)
          return;

        const textDocId = new TextDocId(project.id, text.bookNum, chapter.number, 'target');
        if (await this.permissionsService.canAccessText(textDocId)) {
          await this.projectService.getText(textDocId, docSubscription);
        }

        if (text.hasSource && sourceId != null) {
          const sourceTextDocId = new TextDocId(sourceId, text.bookNum, chapter.number, 'target');
          if (await this.permissionsService.canAccessText(sourceTextDocId)) {
            await this.projectService.getText(sourceTextDocId, docSubscription);
          }
        }
      }
    }
  }
}
