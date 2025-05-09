import { DestroyRef, Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { asyncScheduler, combineLatest, defer, from, Observable } from 'rxjs';
import { switchMap, throttleTime } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../environments/environment';
import { hasStringProp } from '../../../type-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { projectToDraftSources } from './draft-utils';

interface DraftTextInfo {
  bookNum: number;
}
export interface DraftSource extends TranslateSource {
  texts: DraftTextInfo[];
  noAccess?: boolean;
}

export interface DraftSourcesAsArrays {
  trainingSources: DraftSource[];
  trainingTargets: DraftSource[];
  draftingSources: DraftSource[];
}

@Injectable({
  providedIn: 'root'
})
export class DraftSourcesService {
  private readonly currentUser$: Observable<UserDoc> = defer(() =>
    from(this.userService.subscribeCurrentUser(new DocSubscription('DraftSourcesService', this.destroyRef)))
  ); /** Duration to throttle large amounts of incoming project changes. 100 is a guess for what may be useful. */
  private readonly projectChangeThrottlingMs = 100;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly destroyRef: DestroyRef
  ) {}

  /**
   * Provides an observable of the latest copy of each of the sources used in drafting (sources and targets for
   * training, and source and targets for translating). All the sources are fully loaded if the user has access to them.
   * If the user does not have access to a source, the source will be returned with the noAccess property set to true,
   * and metadata about the source.
   *
   * @see {@link projectToDraftSources} is a utility function that converts a project profile into a set of draft
   * sources without any network requirements. If only metadata is needed (and not the source projects themselves),
   * calling that function is preferred.
   *
   * @returns An observable for a {@link DraftSourcesAsArrays} object.
   */
  getDraftProjectSources(): Observable<DraftSourcesAsArrays> {
    return combineLatest([this.activatedProject.changes$, this.currentUser$]).pipe(
      throttleTime(this.projectChangeThrottlingMs, asyncScheduler, { leading: true, trailing: true }),
      switchMap(([targetDoc, _currentUser]) => this.getDraftSourcesAsArrays(targetDoc))
    );
  }

  private async getDraftSourcesAsArrays(targetDoc?: SFProjectProfileDoc): Promise<DraftSourcesAsArrays> {
    if (targetDoc?.data == null) {
      return { trainingSources: [], trainingTargets: [], draftingSources: [] };
    }

    const sources = projectToDraftSources(targetDoc.data);

    const [trainingSources, trainingTargets, draftingSources] = await Promise.all([
      this.mapDraftSourceArrayToFullSourceArray(sources.trainingSources, targetDoc),
      this.mapDraftSourceArrayToFullSourceArray(sources.trainingTargets, targetDoc),
      this.mapDraftSourceArrayToFullSourceArray(sources.draftingSources, targetDoc)
    ]);

    return { trainingSources, trainingTargets, draftingSources };
  }

  private async mapDraftSourceArrayToFullSourceArray(
    sources: (TranslateSource | SFProjectProfile)[],
    currentProjectDoc: SFProjectProfileDoc
  ): Promise<DraftSource[]> {
    return await Promise.all(sources.map(source => this.mapDraftSourceToFullSource(source, currentProjectDoc)));
  }

  private async mapDraftSourceToFullSource(
    source: TranslateSource | SFProjectProfile,
    currentProjectDoc: SFProjectProfileDoc
  ): Promise<DraftSource> {
    const currentUser = await this.userService.getCurrentUser();
    const projectId = hasStringProp(source, 'projectRef') ? source.projectRef : currentProjectDoc.id;

    // The current project is an SFProjectProfile, which does not have a projectRef property, and doesn't need to be
    // fetched
    let project: SFProjectProfile | undefined;
    if (source === currentProjectDoc?.data) project = currentProjectDoc.data;
    else if (currentUser.data?.sites[environment.siteId].projects?.includes(projectId)) {
      project = (await this.projectService.getProfile(projectId)).data;
    }

    if (project != null) {
      return { ...project, projectRef: projectId };
    } else
      return {
        name: source.name,
        shortName: source.shortName,
        paratextId: source.paratextId,
        projectRef: projectId,
        texts: [],
        writingSystem: source.writingSystem,
        noAccess: true
      };
  }
}
