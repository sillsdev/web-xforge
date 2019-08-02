import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';
import { from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthGuard } from 'xforge-common/auth.guard';
import { UserService } from 'xforge-common/user.service';
import { SFProjectRoles } from '../core/models/sfproject-roles';
import { SFProjectService } from '../core/sfproject.service';

@Injectable({
  providedIn: 'root'
})
export class SFAdminAuthGuard implements CanActivate {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService
  ) {}

  canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    const projectId = 'projectId' in next.params ? next.params['projectId'] : '';
    return this.authGuard.canActivate(next, state).pipe(switchMap(() => this.allowTransition(projectId)));
  }

  allowTransition(projectId: string): Observable<boolean> {
    return this.authGuard.allowTransition().pipe(
      switchMap(isLoggedIn => {
        if (isLoggedIn) {
          return from(this.projectService.get(projectId)).pipe(
            map(
              projectDoc =>
                projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRoles.ParatextAdministrator
            )
          );
        }
        return of(false);
      })
    );
  }
}
