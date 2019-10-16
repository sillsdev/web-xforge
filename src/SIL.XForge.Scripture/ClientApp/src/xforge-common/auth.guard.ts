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

  canActivate(next: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
    return this.allowTransition().pipe(
      tap(isLoggedIn => {
        if (!isLoggedIn) {
          const email = this.locationService.searchParams.get('email');
          this.authService.logIn(this.locationService.pathname + this.locationService.search, email);
        }
      })
    );
  }

  allowTransition(): Observable<boolean> {
    return from(this.authService.isLoggedIn);
  }
}
