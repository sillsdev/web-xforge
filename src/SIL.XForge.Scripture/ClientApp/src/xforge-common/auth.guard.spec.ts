import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LocationService } from './location.service';

const mockedAuthService = mock(AuthService);
const mockedLocationService = mock(LocationService);
const mockedActivatedRouteSnapshot = mock(ActivatedRouteSnapshot);
const mockedRouterStateSnapshot = mock(RouterStateSnapshot);

describe('AuthGuard', () => {
  beforeEach(() => {
    resetCalls(mockedAuthService);
  });

  it('should do nothing if already logged in', (done: DoneFn) => {
    // url test pattern: https://scriptureforge.org/projects/<projectId>
    const authGuard = new AuthGuard(instance(mockedAuthService), instance(mockedLocationService));
    expect(authGuard).toBeDefined();
    when(mockedAuthService.isLoggedIn).thenResolve(true);
    when(mockedActivatedRouteSnapshot.queryParams).thenReturn({});

    const canActivate$ = authGuard.canActivate(
      instance(mockedActivatedRouteSnapshot),
      instance(mockedRouterStateSnapshot)
    );

    canActivate$.subscribe(canActivate => {
      expect(canActivate).toBe(true);
      verify(mockedAuthService.logIn({ returnUrl: anything() })).never();
      done();
    });
  });

  it('should call logIn when not logged in', (done: DoneFn) => {
    // url test pattern: https://scriptureforge.org/projects/<projectId>
    const authGuard = new AuthGuard(instance(mockedAuthService), instance(mockedLocationService));
    expect(authGuard).toBeDefined();
    when(mockedAuthService.isLoggedIn).thenResolve(false);
    when(mockedActivatedRouteSnapshot.queryParams).thenReturn({});

    const canActivate$ = authGuard.canActivate(
      instance(mockedActivatedRouteSnapshot),
      instance(mockedRouterStateSnapshot)
    );

    canActivate$.subscribe(canActivate => {
      expect(canActivate).toBe(false);
      verify(mockedAuthService.logIn(anything())).once();
      done();
    });
  });

  it('should call logIn when not logged in and sharing', (done: DoneFn) => {
    // url test pattern: https://scriptureforge.org/projects/<projectId>?sharing=true&shareKey=<shareKey>
    const authGuard = new AuthGuard(instance(mockedAuthService), instance(mockedLocationService));
    expect(authGuard).toBeDefined();
    when(mockedAuthService.isLoggedIn).thenResolve(false);
    when(mockedActivatedRouteSnapshot.queryParams).thenReturn({ sharing: 'true', 'sign-up': 'false' });
    when(mockedLocationService.pathname).thenReturn('/');
    when(mockedLocationService.search).thenReturn('');

    const canActivate$ = authGuard.canActivate(
      instance(mockedActivatedRouteSnapshot),
      instance(mockedRouterStateSnapshot)
    );

    canActivate$.subscribe(canActivate => {
      expect(canActivate).toBe(false);
      verify(
        mockedAuthService.logIn(
          deepEqual({
            returnUrl: anything(),
            signUp: true,
            locale: anything(),
            promptPasswordlessLogin: true
          })
        )
      ).once();
      done();
    });
  });

  it('should call logIn when not logged in and signing up', (done: DoneFn) => {
    // url test pattern: https://scriptureforge.org/projects/<projectId>?sign-up=true
    const authGuard = new AuthGuard(instance(mockedAuthService), instance(mockedLocationService));
    expect(authGuard).toBeDefined();
    when(mockedAuthService.isLoggedIn).thenResolve(false);
    when(mockedActivatedRouteSnapshot.queryParams).thenReturn({ sharing: '', 'sign-up': 'true' });

    const canActivate$ = authGuard.canActivate(
      instance(mockedActivatedRouteSnapshot),
      instance(mockedRouterStateSnapshot)
    );

    canActivate$.subscribe(canActivate => {
      expect(canActivate).toBe(false);
      verify(
        mockedAuthService.logIn(
          deepEqual({
            returnUrl: anything(),
            signUp: true,
            locale: undefined,
            promptPasswordlessLogin: false
          })
        )
      ).once();
      done();
    });
  });

  it('should call logIn when not logged in with locale', (done: DoneFn) => {
    // url test pattern: https://scriptureforge.org/projects/<projectId>?locale=es
    const authGuard = new AuthGuard(instance(mockedAuthService), instance(mockedLocationService));
    expect(authGuard).toBeDefined();
    when(mockedAuthService.isLoggedIn).thenResolve(false);
    const locale = 'es';
    when(mockedActivatedRouteSnapshot.queryParams).thenReturn({ locale });

    const canActivate$ = authGuard.canActivate(
      instance(mockedActivatedRouteSnapshot),
      instance(mockedRouterStateSnapshot)
    );

    canActivate$.subscribe(canActivate => {
      expect(canActivate).toBe(false);
      verify(
        mockedAuthService.logIn(
          deepEqual({ returnUrl: anything(), signUp: false, locale, promptPasswordlessLogin: false })
        )
      ).once();
      done();
    });
  });
});
