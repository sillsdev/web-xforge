import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TEXTS_COLLECTION } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { ActivatedProjectService } from '../../../xforge-common/activated-project.service';
import { RealtimeQuery } from '../../../xforge-common/models/realtime-query';
import { RealtimeService } from '../../../xforge-common/realtime.service';
import { filterNullish } from '../../../xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly subscribedTexts: TextDoc[] = [];
  private query?: RealtimeQuery<TextDoc>;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly currentProject: ActivatedProjectService,
    private readonly realtimeService: RealtimeService,
    private readonly destroyRef: DestroyRef
  ) {
    currentProject.projectId$.pipe(takeUntilDestroyed(destroyRef), filterNullish()).subscribe(async projectId => {
      // if (projectId == null) return;

      // this.uncache();
      const project = await this.projectService.getProfile(projectId);
      await this.cache(project);
    });
  }

  private uncache(): void {
    for (const t of this.subscribedTexts) {
      t.adapter.destroy();
      t.dispose();
    }

    this.subscribedTexts.length = 0;
  }

  private async cache(project: SFProjectProfileDoc): Promise<void> {
    // await this.loadAllChapters(project);
    const params = {
      // [obj<TextDoc>().pathStr(u => u.id)]: { $regex: `.*`, $options: 'i' }
      // [obj<User>().pathStr(u => u.displayName)]: { $regex: `.*Joseph Myers.*`, $options: 'i' }
    };
    this.query = await this.realtimeService.subscribeQuery<TextDoc>(TEXTS_COLLECTION, params, this.destroyRef);
    // this.query = await this.realtimeService.subscribeQuery<TextDoc>('users', params, this.destroyRef);
    const projectDocs = this.query.docs.filter(td => td.id.includes(project.id));
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
