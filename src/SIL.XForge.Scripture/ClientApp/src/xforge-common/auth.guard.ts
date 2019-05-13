import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { LocationService } from './location.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly locationService: LocationService
  ) {}

  canActivate(_next: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
    return this.allowTransition().pipe(
      tap(isLoggedIn => {
        if (!isLoggedIn) {
          this.router.navigateByUrl('/identity/log-in?returnUrl=' + this.locationService.pathname);
        }
      })
    );
  }

  allowTransition(): Observable<boolean> {
    return from(this.authService.isLoggedIn);
  }
}
