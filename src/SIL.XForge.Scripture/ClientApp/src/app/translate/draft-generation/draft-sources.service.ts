import { Injectable } from '@angular/core';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TranslateConfig, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { asyncScheduler, combineLatest, defer, from, Observable } from 'rxjs';
import { map, switchMap, throttleTime } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../environments/environment';
import { SFProjectService } from '../../core/sf-project.service';

interface DraftTextInfo {
  bookNum: number;
}
export interface DraftSource extends TranslateSource {
  texts: DraftTextInfo[];
  noAccess?: boolean;
}
interface DraftSourceDoc {
  data: DraftSource;
}

export interface DraftSourcesAsArrays {
  trainingSources: [DraftSource?, DraftSource?];
  trainingTargets: [DraftSource?];
  draftingSources: [DraftSource?];
}

@Injectable({
  providedIn: 'root'
})
export class DraftSourcesService {
  private readonly currentUser$: Observable<UserDoc> = defer(() => from(this.userService.getCurrentUser()));
  /** Duration to throttle large amounts of incoming project changes. 100 is a guess for what may be useful. */
  private readonly projectChangeThrottlingMs = 100;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}

  /**
   * Returns the training and drafting sources for the activated project as three arrays.
   *
   * This considers properties such as alternateTrainingSourceEnabled and alternateTrainingSource and makes sure to only
   * include a source if it's enabled and not null. It also considers whether the project source is implicitly the
   * training and/or drafting source.
   *
   * This method is also intended to be act as an abstraction layer to allow changing the data model in the future
   * without needing to change all the places that use this method.
   *
   * Currently this method provides guarantees via the type system that there will be at most 2 training sources,
   * exactly 1 training target, and at most 1 drafting source. Consumers of this method that cannot accept an arbitrary
   * length for each of these arrays are encouraged to write their code in such a way that it will noticeably break
   * (preferably at build time) if these guarantees are changed, to make it easier to find code that relies on the
   * current limit on the number of sources in each category.
   * @returns An object with three arrays: trainingSources, trainingTargets, and draftingSources
   */
  getDraftProjectSources(): Observable<DraftSourcesAsArrays> {
    return combineLatest([this.activatedProject.changes$, this.currentUser$]).pipe(
      throttleTime(this.projectChangeThrottlingMs, asyncScheduler, { leading: true, trailing: true }),
      switchMap(([targetDoc, currentUser]) => {
        const translateConfig: TranslateConfig | undefined = targetDoc?.data?.translateConfig;

        // If the user cannot access the source project, populate using the target's source information
        const sourceProjectId: string | undefined = translateConfig?.source?.projectRef;
        const sourceProject = this.getDraftSource(
          sourceProjectId,
          currentUser,
          targetDoc?.data?.translateConfig?.source,
          targetDoc?.data?.texts.filter(text => text.hasSource) ?? []
        );

        // If the user cannot access the alternate source project, populate using the target's alternate source info
        const alternateSourceProjectId: string | undefined = translateConfig?.draftConfig.alternateSourceEnabled
          ? translateConfig.draftConfig.alternateSource?.projectRef
          : undefined;
        const alternateSourceProject = this.getDraftSource(
          alternateSourceProjectId,
          currentUser,
          translateConfig?.draftConfig?.alternateSource
        );

        // If the user cannot access the alternate training source project,
        // populate using the target's alternate training source information, if enabled
        const alternateTrainingSourceProjectId: string | undefined = translateConfig?.draftConfig
          .alternateTrainingSourceEnabled
          ? translateConfig?.draftConfig.alternateTrainingSource?.projectRef
          : undefined;
        const alternateTrainingSourceProject = this.getDraftSource(
          alternateTrainingSourceProjectId,
          currentUser,
          translateConfig?.draftConfig?.alternateTrainingSource
        );

        // If the user cannot access the additional training source project,
        // populate using the target's additional training source information, if enabled
        const additionalTrainingSourceProjectId: string | undefined = translateConfig?.draftConfig
          .additionalTrainingSourceEnabled
          ? translateConfig.draftConfig.additionalTrainingSource?.projectRef
          : undefined;
        const additionalTrainingSourceProject = this.getDraftSource(
          additionalTrainingSourceProjectId,
          currentUser,
          translateConfig?.draftConfig?.additionalTrainingSource
        );

        // Include the source projects, if they exist
        return from(
          Promise.all([
            sourceProjectId
              ? (sourceProject ?? this.projectService.getProfile(sourceProjectId))
              : Promise.resolve(undefined),
            alternateSourceProjectId
              ? (alternateSourceProject ?? this.projectService.getProfile(alternateSourceProjectId))
              : Promise.resolve(undefined),
            alternateTrainingSourceProjectId
              ? (alternateTrainingSourceProject ?? this.projectService.getProfile(alternateTrainingSourceProjectId))
              : Promise.resolve(undefined),
            additionalTrainingSourceProjectId
              ? (additionalTrainingSourceProject ?? this.projectService.getProfile(additionalTrainingSourceProjectId))
              : Promise.resolve(undefined)
          ])
        ).pipe(
          map(([sourceDoc, alternateSourceDoc, alternateTrainingSourceDoc, additionalTrainingSourceProjectDoc]) => {
            const draftingSource: DraftSource | undefined =
              alternateSourceDoc?.data != null
                ? { ...alternateSourceDoc.data, projectRef: alternateSourceProjectId! }
                : sourceDoc?.data != null
                  ? { ...sourceDoc.data, projectRef: sourceProjectId! }
                  : undefined;
            const trainingSource: DraftSource | undefined =
              alternateTrainingSourceDoc?.data != null
                ? { ...alternateTrainingSourceDoc.data, projectRef: alternateTrainingSourceProjectId! }
                : sourceDoc?.data != null
                  ? { ...sourceDoc.data, projectRef: sourceProjectId! }
                  : undefined;
            const additionalTrainingSource: DraftSource | undefined =
              additionalTrainingSourceProjectDoc?.data != null
                ? { ...additionalTrainingSourceProjectDoc.data, projectRef: additionalTrainingSourceProjectId! }
                : undefined;
            const target: DraftSource | undefined =
              targetDoc?.data != null ? { ...targetDoc.data, projectRef: targetDoc.id } : undefined;
            const result: DraftSourcesAsArrays = {
              trainingSources: [trainingSource, additionalTrainingSource],
              trainingTargets: [target],
              draftingSources: [draftingSource]
            };
            return result;
          })
        );
      })
    );
  }

  /**
   * Get a draft source entity to substitute for a ProjectDoc when that document cannot be accessed.
   * @param projectId The project id corresponding to the translate source.
   * @param currentUser The current user.
   * @param translateSource The source, alternate source, or alternate training source.
   * @param texts (optional )The source's texts - only populated when the source is the translate source.
   * @returns The draft source
   */
  private getDraftSource(
    projectId: string | undefined,
    currentUser: UserDoc,
    translateSource: TranslateSource | undefined,
    texts: TextInfo[] | undefined = undefined
  ): DraftSourceDoc | undefined {
    if (
      projectId != null &&
      !currentUser.data?.sites[environment.siteId].projects?.includes(projectId) &&
      translateSource != null
    ) {
      // Construct a source project doc based on the translate source from the target project
      return {
        data: {
          name: translateSource.name,
          shortName: translateSource.shortName,
          paratextId: translateSource.paratextId,
          projectRef: projectId,
          texts: texts?.slice() ?? [],
          writingSystem: translateSource.writingSystem,
          noAccess: true
        }
      };
    } else {
      // The real document will be read from the realtime server, as the current user has permission
      return undefined;
    }
  }
}
