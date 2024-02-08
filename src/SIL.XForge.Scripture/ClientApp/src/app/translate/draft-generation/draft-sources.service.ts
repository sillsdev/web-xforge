import { Injectable } from '@angular/core';
import { WritingSystem } from 'realtime-server/lib/esm/common/models/writing-system';
import { TranslateConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, defer, from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { SFProjectService } from '../../core/sf-project.service';

interface DraftTextInfo {
  bookNum: number;
}
export interface DraftSource {
  name: string;
  shortName: string;
  texts: DraftTextInfo[];
  writingSystem: WritingSystem;
  noAccess?: boolean;
}

export interface DraftSources {
  target?: Readonly<DraftSource>;
  source?: Readonly<DraftSource>;
  alternateSource?: Readonly<DraftSource>;
  alternateTrainingSource?: Readonly<DraftSource>;
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
        let sourceProject = undefined;
        if (
          sourceProjectId != null &&
          !currentUser.data?.sites[environment.siteId].projects?.includes(sourceProjectId) &&
          targetDoc?.data != null &&
          targetDoc.data.translateConfig?.source != null
        ) {
          // Construct a source project doc based on the target's source configuration
          sourceProject = {
            data: {
              name: targetDoc.data.translateConfig.source.name,
              shortName: targetDoc.data.translateConfig.source.shortName,
              texts: targetDoc.data.texts.filter(text => text.hasSource),
              writingSystem: targetDoc.data.translateConfig.source.writingSystem,
              noAccess: true
            }
          };
        }

        // If the user cannot access the alternate source project, populate using the target's alternate source info
        const alternateSourceProjectId: string | undefined = translateConfig?.draftConfig.alternateSource?.projectRef;
        let alternateSourceProject = undefined;
        if (
          alternateSourceProjectId != null &&
          !currentUser.data?.sites[environment.siteId].projects?.includes(alternateSourceProjectId) &&
          targetDoc?.data != null &&
          targetDoc.data.translateConfig?.draftConfig?.alternateSource != null
        ) {
          // Construct an alternate source project doc based on the target's alternate source configuration
          alternateSourceProject = {
            data: {
              name: targetDoc.data.translateConfig.draftConfig?.alternateSource.name,
              shortName: targetDoc.data.translateConfig.draftConfig?.alternateSource.shortName,
              texts: [],
              writingSystem: targetDoc.data.translateConfig.draftConfig?.alternateSource.writingSystem,
              noAccess: true
            }
          };
        }

        // If the user cannot access the alternate training source project,
        // populate using the target's alternate training source information, if enabled
        let alternateTrainingSourceProjectId: string | undefined = translateConfig?.draftConfig
          .alternateTrainingSourceEnabled
          ? translateConfig.draftConfig.alternateTrainingSource?.projectRef
          : undefined;
        let alternateTrainingSourceProject = undefined;
        if (
          alternateTrainingSourceProjectId != null &&
          !currentUser.data?.sites[environment.siteId].projects?.includes(alternateTrainingSourceProjectId)
        ) {
          // Ensure that we have the alternate training source
          if (targetDoc?.data?.translateConfig?.draftConfig?.alternateTrainingSource == null) {
            // The alternate training source is not set, clear the id
            alternateTrainingSourceProjectId = undefined;
          } else {
            // Construct an alternate training source project doc based on the target's alternate training source config
            alternateTrainingSourceProject = {
              data: {
                name: targetDoc.data.translateConfig.draftConfig.alternateTrainingSource.name,
                shortName: targetDoc.data.translateConfig.draftConfig.alternateTrainingSource.shortName,
                texts: [],
                writingSystem: targetDoc.data.translateConfig.draftConfig.alternateTrainingSource.writingSystem,
                noAccess: true
              }
            };
          }
        }

        // Include alternate training source project if it exists
        return from(
          Promise.all([
            sourceProjectId
              ? sourceProject ?? this.projectService.getProfile(sourceProjectId)
              : Promise.resolve(undefined),
            alternateSourceProjectId
              ? alternateSourceProject ?? this.projectService.getProfile(alternateSourceProjectId)
              : Promise.resolve(undefined),
            alternateTrainingSourceProjectId
              ? alternateTrainingSourceProject ?? this.projectService.getProfile(alternateTrainingSourceProjectId)
              : Promise.resolve(undefined)
          ])
        ).pipe(
          map(([sourceDoc, alternateSourceDoc, alternateTrainingSourceDoc]) => {
            return {
              target: targetDoc?.data,
              source: sourceDoc?.data,
              alternateSource: alternateSourceDoc?.data,
              alternateTrainingSource: alternateTrainingSourceDoc?.data
            };
          })
        );
      })
    );
  }
}
