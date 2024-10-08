import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SystemAdminAuthGuard {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly authService: AuthService
  ) {}

  canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.authGuard.canActivate(next, state).pipe(switchMap(() => this.allowTransition()));
  }

  allowTransition(): Observable<boolean> {
    return this.authGuard.allowTransition().pipe(
      map(isLoggedIn => {
        if (isLoggedIn) {
          return this.authService.currentUserRoles.includes(SystemRole.SystemAdmin);
        }
        return false;
      })
    );
  }
}
