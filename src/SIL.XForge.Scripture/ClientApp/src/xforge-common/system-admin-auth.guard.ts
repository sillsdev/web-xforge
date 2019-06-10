import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SystemRole } from './models/system-role';

@Injectable({
  providedIn: 'root'
})
export class SystemAdminAuthGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard, private readonly authService: AuthService) {}

  canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.authGuard.canActivate(next, state).pipe(switchMap(() => this.allowTransition()));
  }

  allowTransition(): Observable<boolean> {
    return this.authGuard.allowTransition().pipe(
      map(isLoggedIn => {
        if (isLoggedIn) {
          return this.authService.currentUserRole === SystemRole.SystemAdmin;
        }
        return false;
      })
    );
  }
}
