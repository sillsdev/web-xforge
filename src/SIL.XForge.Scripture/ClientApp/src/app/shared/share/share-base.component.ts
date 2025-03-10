import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_PROJECT_ROLES } from '../../core/models/sf-project-role-info';

export abstract class ShareBaseComponent {
  protected projectDoc?: SFProjectProfileDoc;

  constructor(protected readonly userService: UserService) {}

  get availableRoles(): SFProjectRole[] {
    return SF_PROJECT_ROLES.filter(info => info.canBeShared && this.userShareableRoles.includes(info.role)).map(
      r => r.role
    ) as SFProjectRole[];
  }

  protected get userShareableRoles(): string[] {
    const project = this.projectDoc?.data;
    if (project == null) {
      return [];
    }
    const userRole = project.userRoles[this.userService.currentUserId];
    return [
      {
        role: SFProjectRole.CommunityChecker,
        permission:
          project.checkingConfig.checkingEnabled &&
          SF_PROJECT_RIGHTS.hasRight(
            project,
            this.userService.currentUserId,
            SFProjectDomain.Questions,
            Operation.View
          ) &&
          userRole !== SFProjectRole.Commenter &&
          userRole !== SFProjectRole.Viewer
      },
      {
        role: SFProjectRole.Viewer,
        permission:
          SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.View) &&
          userRole !== SFProjectRole.CommunityChecker &&
          userRole !== SFProjectRole.Commenter
      },
      {
        role: SFProjectRole.Commenter,
        permission:
          SF_PROJECT_RIGHTS.hasRight(
            project,
            this.userService.currentUserId,
            SFProjectDomain.Notes,
            Operation.Create
          ) &&
          userRole !== SFProjectRole.CommunityChecker &&
          userRole !== SFProjectRole.Viewer
      }
    ]
      .filter(
        info =>
          info.permission &&
          this.projectDoc?.data != null &&
          SF_PROJECT_RIGHTS.hasRight(
            this.projectDoc.data,
            this.userService.currentUserId,
            SFProjectDomain.UserInvites,
            Operation.Create
          )
      )
      .map(info => info.role as string);
  }
}
