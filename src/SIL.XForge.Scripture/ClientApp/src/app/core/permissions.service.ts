import { Injectable } from '@angular/core';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from './models/sf-project-profile-doc';
import { roleCanAccessCommunityChecking, roleCanAccessTranslate } from './models/sf-project-role-info';

@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  constructor(private readonly userService: UserService) {}

  canAccessCommunityChecking(project: SFProjectProfileDoc, userId?: string): boolean {
    if (project == null || project.data == null) return false;
    const roles = project.data.userRoles;
    if (userId === undefined) {
      userId = this.userService.currentUserId;
    }

    return (
      project.data.checkingConfig.checkingEnabled && roleCanAccessCommunityChecking(roles[userId] as SFProjectRole)
    );
  }

  canAccessTranslate(project: SFProjectProfileDoc, userId?: string): boolean {
    if (project == null || project.data == null) return false;
    const roles = project.data.userRoles;
    if (userId === undefined) {
      userId = this.userService.currentUserId;
    }

    return roleCanAccessTranslate(roles[userId] as SFProjectRole);
  }
}
