import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { LocationService } from './location.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService, private readonly locationService: LocationService) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
    return this.allowTransition().pipe(
      tap(isLoggedIn => {
        if (!isLoggedIn) {
          const signUp = route.queryParams['sharing'] === 'true' || route.queryParams['sign-up'] === 'true';
          const locale: string = route.queryParams['locale'];
          this.authService.logIn({
            returnUrl: this.locationService.pathname + this.locationService.search,
            signUp,
            locale,
            promptPasswordlessLogin: route.queryParams['sharing'] === 'true'
          });
        }
      })
    );
  }

  allowTransition(): Observable<boolean> {
    return from(this.authService.isLoggedIn);
  }
}
