import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TEXTS_COLLECTION } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { ActivatedProjectService } from '../../../xforge-common/activated-project.service';
import { RealtimeQuery } from '../../../xforge-common/models/realtime-query';
import { RealtimeService } from '../../../xforge-common/realtime.service';
import { filterNullish } from '../../../xforge-common/util/rxjs-util';
import { TextDoc } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private query?: RealtimeQuery<TextDoc>;
  private sourceQuery?: RealtimeQuery<TextDoc>;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly realtimeService: RealtimeService,
    private readonly destroyRef: DestroyRef,
    currentProject: ActivatedProjectService
  ) {
    currentProject.projectId$.pipe(takeUntilDestroyed(destroyRef), filterNullish()).subscribe(async projectId => {
      this.query?.dispose();
      this.sourceQuery?.dispose();

      this.query = await this.cache(projectId);

      const project = await this.projectService.getProfile(projectId);
      const sourceId = project.data!.translateConfig.source?.projectRef;
      if (sourceId != null) {
        this.sourceQuery = await this.cache(sourceId);
      }
    });
  }

  private async cache(projectId: string): Promise<RealtimeQuery<TextDoc>> {
    const params = {
      ['_id']: { $regex: `^${projectId}:.*` }
    };
    const query = await this.realtimeService.subscribeQuery<TextDoc>(TEXTS_COLLECTION, params, this.destroyRef);
    query.subscribe();

    return query;
  }
}
