import { Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectService } from '../../core/sf-project.service';

interface DraftSources {
  target: Readonly<SFProjectProfile>;
  draftingSource: Readonly<SFProjectProfile>;
  trainingSource?: Readonly<SFProjectProfile>;
}

@Injectable({
  providedIn: 'root'
})
export class DraftSourcesService {
  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {}

  /**
   * Gets the configured draft project sources for the activated project.
   */
  getDraftProjectSources(): Observable<DraftSources> {
    return this.activatedProject.projectDoc$.pipe(
      switchMap(targetDoc => {
        const translateConfig: TranslateConfig | undefined = targetDoc?.data?.translateConfig;

        // See if there is an alternate source project set, otherwise use the drafting source project
        const draftingSourceProjectId: string | undefined =
          translateConfig?.draftConfig.alternateSource?.projectRef ?? translateConfig?.source?.projectRef;

        if (draftingSourceProjectId == null) {
          throw new Error('Source project is not set');
        }

        const trainingSourceProjectId = translateConfig?.draftConfig.alternateTrainingSourceEnabled
          ? translateConfig.draftConfig.alternateTrainingSource?.projectRef
          : undefined;

        // Include alternate training source project if it exists
        return from(
          Promise.all([
            this.projectService.getProfile(draftingSourceProjectId),
            trainingSourceProjectId
              ? this.projectService.getProfile(trainingSourceProjectId)
              : Promise.resolve(undefined)
          ])
        ).pipe(
          map(([draftingSourceDoc, trainingSourceDoc]) => {
            if (targetDoc?.data == null || draftingSourceDoc?.data == null) {
              throw new Error('Target project or drafting source project data not found');
            }

            return {
              target: targetDoc.data,
              draftingSource: draftingSourceDoc.data,
              trainingSource: trainingSourceDoc?.data
            };
          })
        );
      })
    );
  }
}
