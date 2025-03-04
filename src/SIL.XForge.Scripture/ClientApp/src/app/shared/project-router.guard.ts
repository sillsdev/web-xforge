import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { canParatextRoleWrite, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { PermissionsService } from '../core/permissions.service';
import { SFProjectService } from '../core/sf-project.service';

export abstract class RouterGuard {
  constructor(
    protected readonly authGuard: AuthGuard,
    protected readonly projectService: SFProjectService
  ) {}

  canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    const projectId = 'projectId' in next.params ? next.params['projectId'] : '';
    return this.authGuard.canActivate(next, state).pipe(switchMap(() => this.allowTransition(projectId)));
  }

  allowTransition(projectId: string): Observable<boolean> {
    return this.authGuard.allowTransition().pipe(
      switchMap(isLoggedIn => {
        if (isLoggedIn) {
          return from(this.projectService.getProfile(projectId)).pipe(map(projectDoc => this.check(projectDoc)));
        }
        return of(false);
      })
    );
  }

  abstract check(project: SFProjectProfileDoc): boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsAuthGuard extends RouterGuard {
  constructor(
    authGuard: AuthGuard,
    projectService: SFProjectService,
    private userService: UserService
  ) {
    super(authGuard, projectService);
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    return (
      projectDoc.data != null &&
      projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class UsersAuthGuard extends RouterGuard {
  constructor(
    authGuard: AuthGuard,
    projectService: SFProjectService,
    private userService: UserService
  ) {
    super(authGuard, projectService);
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    return (
      projectDoc.data != null &&
      projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class SyncAuthGuard extends RouterGuard {
  constructor(
    authGuard: AuthGuard,
    projectService: SFProjectService,
    private readonly authService: AuthService,
    private userService: UserService
  ) {
    super(authGuard, projectService);
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    if (projectDoc.data == null) return false;

    if (
      this.authService.currentUserRoles.includes(SystemRole.ServalAdmin) &&
      canParatextRoleWrite(projectDoc.data.userRoles[this.userService.currentUserId])
    ) {
      return true;
    }

    return SF_PROJECT_RIGHTS.hasRight(
      projectDoc.data,
      this.userService.currentUserId,
      SFProjectDomain.Texts,
      Operation.Edit
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class NmtDraftAuthGuard extends RouterGuard {
  constructor(
    authGuard: AuthGuard,
    projectService: SFProjectService,
    private userService: UserService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly authService: AuthService
  ) {
    super(authGuard, projectService);
  }

  allowTransition(projectId: string): Observable<boolean> {
    // Re-run check when feature flags change
    return combineLatest([
      this.featureFlagService.showNmtDrafting.enabled$,
      this.featureFlagService.allowForwardTranslationNmtDrafting.enabled$
    ]).pipe(switchMap(() => super.allowTransition(projectId)));
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    if (projectDoc.data == null) {
      return false;
    }

    if (!this.featureFlagService.showNmtDrafting.enabled) {
      return false;
    }

    if (
      this.authService.currentUserRoles.includes(SystemRole.ServalAdmin) &&
      canParatextRoleWrite(projectDoc.data.userRoles[this.userService.currentUserId])
    ) {
      return true;
    }

    const isBackTranslationProject = projectDoc.data.translateConfig?.projectType === ProjectType.BackTranslation;
    if (!isBackTranslationProject && !this.featureFlagService.allowForwardTranslationNmtDrafting.enabled) {
      return false;
    }

    return SF_PROJECT_RIGHTS.hasRight(
      projectDoc.data,
      this.userService.currentUserId,
      SFProjectDomain.Texts,
      Operation.Edit
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class CheckingAuthGuard extends RouterGuard {
  constructor(
    authGuard: AuthGuard,
    projectService: SFProjectService,
    private router: Router,
    private readonly permissions: PermissionsService
  ) {
    super(authGuard, projectService);
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    if (this.permissions.canAccessCommunityChecking(projectDoc)) {
      return true;
    }
    this.router.navigate(['/projects', projectDoc.id], { replaceUrl: true });
    return false;
  }
}

@Injectable({
  providedIn: 'root'
})
export class TranslateAuthGuard extends RouterGuard {
  constructor(
    authGuard: AuthGuard,
    projectService: SFProjectService,
    private router: Router,
    private readonly permissions: PermissionsService
  ) {
    super(authGuard, projectService);
  }

  check(projectDoc: SFProjectProfileDoc): boolean {
    if (this.permissions.canAccessTranslate(projectDoc)) {
      return true;
    }
    this.router.navigate(['/projects', projectDoc.id], { replaceUrl: true });
    return false;
  }
}
