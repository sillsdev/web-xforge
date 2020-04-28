import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { LocationService } from './location.service';
import { NoticeService } from './notice.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly locationService: LocationService,
    private readonly noticeService: NoticeService
  ) {}

  canActivate(next: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
    return from(this.authService.loginResult).pipe(
      map(loginResult => {
        const signUp = next.queryParams['sharing'] === 'true' || next.queryParams['sign-up'] === 'true';
        const returnPath = this.locationService.pathname + this.locationService.search;
        if (loginResult.error != null) {
          this.noticeService
            .showMessageDialog(
              () => translate('error_messages.error_occurred_login'),
              () => translate('error_messages.try_again')
            )
            .then(() => {
              this.authService.logIn(returnPath, signUp);
            });
        } else if (!loginResult.loggedIn) {
          this.authService.logIn(returnPath, signUp);
        }
        return loginResult.loggedIn;
      })
    );
  }

  allowTransition(): Observable<boolean> {
    return from(this.authService.isLoggedIn);
  }
}
