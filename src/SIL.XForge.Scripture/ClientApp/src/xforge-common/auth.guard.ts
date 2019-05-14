import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(next: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
    return this.allowTransition().pipe(
      tap(isLoggedIn => {
        if (!isLoggedIn) {
          this.authService.logIn('/' + next.url[0].path);
        }
      })
    );
  }

  allowTransition(): Observable<boolean> {
    return from(this.authService.isLoggedIn);
  }
}
