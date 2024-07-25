import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { LocationService } from './location.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard {
  constructor(
    private readonly authService: AuthService,
    private readonly locationService: LocationService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
    return this.allowTransition().pipe(
      tap(isLoggedIn => {
        if (!isLoggedIn) {
          const signUp = route.queryParams['sign-up'] === 'true';
          const locale: string = route.queryParams['locale'];
          this.authService.logIn({
            returnUrl: this.locationService.pathname + this.locationService.search,
            signUp,
            locale
          });
        }
      })
    );
  }

  allowTransition(): Observable<boolean> {
    return from(this.authService.isLoggedIn);
  }
}
