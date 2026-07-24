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
      name: 'Enable chapter-level drafting & training',
      description:
        'Choose which chapters to generate, so that your existing translations of other chapters in the same book can be used to train the language model and improve draft quality.',
      available: () =>
        this.doesUserHaveAnyOfRolesOnAnyProject([
          SFProjectRole.ParatextAdministrator,
          SFProjectRole.ParatextTranslator
        ]),
      featureFlag: this.featureFlagService.partialBookDrafting
    }
  ];

  public get availableExperimentalFeatures(): ExperimentalFeature[] {
    return this.experimentalFeatures.filter(feature => feature.available());
  }

  public get showExperimentalFeaturesInMenu(): boolean {
    return this.availableExperimentalFeatures.length > 0;
  }

  /** Helper method for experimental features, since many of them will be limited to particular roles */
  private doesUserHaveAnyOfRolesOnAnyProject(roles: SFProjectRole[]): boolean {
    const projectDocs = this.userProjectsService.projectDocs ?? [];
    return projectDocs.some(projectDoc => {
      const userRoleOnProject = projectDoc.data?.userRoles[this.userService.currentUserId];
      return roles.some(role => role === userRoleOnProject);
    });
  }
}
