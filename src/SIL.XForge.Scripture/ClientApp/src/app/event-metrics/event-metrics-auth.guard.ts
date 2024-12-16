import { Injectable } from '@angular/core';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { RouterGuard } from '../shared/project-router.guard';

@Injectable({
  providedIn: 'root'
})
export class EventMetricsAuthGuard extends RouterGuard {
  constructor(
    readonly authGuard: AuthGuard,
    private readonly authService: AuthService,
    readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super(authGuard, projectService);
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    return (
      this.authService.currentUserRoles.includes(SystemRole.ServalAdmin) ||
      this.authService.currentUserRoles.includes(SystemRole.SystemAdmin) ||
      (projectDoc.data != null &&
        projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator)
    );
  }
}
