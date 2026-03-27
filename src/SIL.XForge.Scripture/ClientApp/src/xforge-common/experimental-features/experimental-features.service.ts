import { Injectable } from '@angular/core';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { FeatureFlag, FeatureFlagService } from '../feature-flags/feature-flag.service';
import { SFUserProjectsService } from '../user-projects.service';
import { UserService } from '../user.service';

/** Wraps a feature flag as an experimental feature, giving it a name, description, and availability check */
export interface ExperimentalFeature {
  name: string;
  description: string;
  available: () => boolean;
  featureFlag: FeatureFlag;
}

@Injectable({ providedIn: 'root' })
export class ExperimentalFeaturesService {
  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly userService: UserService,
    private readonly userProjectsService: SFUserProjectsService
  ) {}

  public experimentalFeatures: ExperimentalFeature[] = [
    {
      name: 'New configure sources page',
      description: `A new configure sources page is available for testing. It has the same functionality as the current page, but with an updated design and some additional information to help users understand the options.`,
      available: () => this.doesUserHaveRoleOnAnyProject(SFProjectRole.ParatextAdministrator),
      featureFlag: this.featureFlagService.newConfigureSourcesPage
    }
  ];

  public get availableExperimentalFeatures(): ExperimentalFeature[] {
    return this.experimentalFeatures.filter(feature => feature.available());
  }

  public get showExperimentalFeaturesInMenu(): boolean {
    return this.availableExperimentalFeatures.length > 0;
  }

  /** Helper method for experimental features, since many of them will be limited to a particular role */
  private doesUserHaveRoleOnAnyProject(role: SFProjectRole): boolean {
    const projectDocs = this.userProjectsService.projectDocs ?? [];
    return projectDocs.some(projectDoc => projectDoc.data?.userRoles[this.userService.currentUserId] === role);
  }
}
