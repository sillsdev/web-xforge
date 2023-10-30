import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { roleCanAccessCommunityChecking, roleCanAccessTranslate } from 'src/app/core/models/sf-project-role-info';
import { UserService } from './user.service';

export class PermissionsService {
  constructor(private readonly userService: UserService) {}

  canAccessCommunityChecking(project: SFProjectProfileDoc, userId: string = ''): boolean {
    if (project == null || project.data == null) return false;
    const roles = project.data.userRoles;
    if (userId === '') {
      userId = this.userService.currentUserId;
    }

    return (
      project.data.checkingConfig.checkingEnabled && roleCanAccessCommunityChecking(roles[userId] as SFProjectRole)
    );
  }

  canAccessTranslate(project: SFProjectProfileDoc, userId: string = ''): boolean {
    if (project == null || project.data == null) return false;
    const roles = project.data.userRoles;
    if (userId === '') {
      userId = this.userService.currentUserId;
    }

    return roleCanAccessTranslate(roles[userId] as SFProjectRole);
  }
}
