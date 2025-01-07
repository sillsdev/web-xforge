import { Injectable } from '@angular/core';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TranslateConfig, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, defer, from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
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

export interface DraftSources {
  target?: Readonly<DraftSource>;
  source?: Readonly<DraftSource>;
  alternateSource?: Readonly<DraftSource>;
  alternateTrainingSource?: Readonly<DraftSource>;
  additionalTrainingSource?: Readonly<DraftSource>;
}

export interface TranslateSourcesAsArrays {
  trainingSources: [TranslateSource?, TranslateSource?];
  trainingTargets: [TranslateSource];
  draftingSources: [TranslateSource?];
}

@Injectable({
  providedIn: 'root'
})
export class DraftSourcesService {
  private readonly currentUser$: Observable<UserDoc> = defer(() => from(this.userService.getCurrentUser()));

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}

  /**
   * Gets the configured draft project sources for the activated project.
   */
  getDraftProjectSources(): Observable<DraftSources> {
    return combineLatest([this.activatedProject.projectDoc$, this.currentUser$]).pipe(
      switchMap(([targetDoc, currentUser]) => {
        const translateConfig: TranslateConfig | undefined = targetDoc?.data?.translateConfig;

        // If the user cannot access the source project, populate using the target's source information
        const sourceProjectId: string | undefined = translateConfig?.source?.projectRef;
        let sourceProject = this.getDraftSource(
          sourceProjectId,
          currentUser,
          targetDoc?.data?.translateConfig?.source,
          targetDoc?.data?.texts.filter(text => text.hasSource) ?? []
        );

        // If the user cannot access the alternate source project, populate using the target's alternate source info
        const alternateSourceProjectId: string | undefined = translateConfig?.draftConfig.alternateSourceEnabled
          ? translateConfig.draftConfig.alternateSource?.projectRef
          : undefined;
        let alternateSourceProject = this.getDraftSource(
          alternateSourceProjectId,
          currentUser,
          targetDoc?.data?.translateConfig?.draftConfig?.alternateSource
        );

        // If the user cannot access the alternate training source project,
        // populate using the target's alternate training source information, if enabled
        let alternateTrainingSourceProjectId: string | undefined = translateConfig?.draftConfig
          .alternateTrainingSourceEnabled
          ? translateConfig.draftConfig.alternateTrainingSource?.projectRef
          : undefined;
        let alternateTrainingSourceProject = this.getDraftSource(
          alternateTrainingSourceProjectId,
          currentUser,
          targetDoc?.data?.translateConfig?.draftConfig?.alternateTrainingSource
        );

        // If the user cannot access the additional training source project,
        // populate using the target's additional training source information, if enabled
        let additionalTrainingSourceProjectId: string | undefined = translateConfig?.draftConfig
          .additionalTrainingSourceEnabled
          ? translateConfig.draftConfig.additionalTrainingSource?.projectRef
          : undefined;
        let additionalTrainingSourceProject = this.getDraftSource(
          additionalTrainingSourceProjectId,
          currentUser,
          targetDoc?.data?.translateConfig?.draftConfig?.additionalTrainingSource
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
            return {
              target: { ...targetDoc?.data, projectRef: this.activatedProject.projectId },
              source: { ...sourceDoc?.data, projectRef: sourceProjectId },
              alternateSource: { ...alternateSourceDoc?.data, projectRef: alternateSourceProjectId },
              alternateTrainingSource: {
                ...alternateTrainingSourceDoc?.data,
                projectRef: alternateTrainingSourceProjectId
              },
              additionalTrainingSource: {
                ...additionalTrainingSourceProjectDoc?.data,
                projectRef: additionalTrainingSourceProjectId
              }
            };
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

  /**
   * Returns the training and drafting sources for the current project as three arrays.
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
   * length for each of these arrays are encouraged to write there code in such a way that it will noticeably break
   * (preferably at build time) if these guarantees are changed, to make it easier to find code that relies on the
   * current limit on the number of sources in each category.
   * @param target The project to get the sources for
   * @param targetId The projectRef of the target
   * @returns An object with three arrays: trainingSources, trainingTargets, and draftingSources
   */
  getTranslateSources(): TranslateSourcesAsArrays {
    const target = this.activatedProject.projectDoc.data;
    const trainingSources: [TranslateSource?, TranslateSource?] = [];
    const draftingSources: [TranslateSource?] = [];
    const trainingTargets: [TranslateSource] = [{ ...target, projectRef: this.activatedProject.projectId }];

    const draftConfig = target.translateConfig.draftConfig;

    let trainingSource: TranslateSource | undefined;
    if (draftConfig.alternateTrainingSourceEnabled && draftConfig.alternateTrainingSource != null) {
      trainingSource = draftConfig.alternateTrainingSource;
    } else {
      trainingSource = target.translateConfig.source;
    }

    if (trainingSource != null) {
      trainingSources.push(trainingSource);
    }

    if (draftConfig.additionalTrainingSourceEnabled && draftConfig.additionalTrainingSource != null) {
      trainingSources.push(draftConfig.additionalTrainingSource);
    }

    let draftingSource: TranslateSource | undefined;
    if (draftConfig.alternateSourceEnabled && draftConfig.alternateSource != null) {
      draftingSource = draftConfig.alternateSource;
    } else {
      draftingSource = target.translateConfig.source;
    }

    if (draftingSource != null) {
      draftingSources.push(draftingSource);
    }

    return { trainingSources, trainingTargets, draftingSources };
  }
}
