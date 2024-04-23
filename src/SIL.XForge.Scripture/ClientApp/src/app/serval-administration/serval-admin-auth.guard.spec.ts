import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { ServalAdminAuthGuard } from './serval-admin-auth.guard';

const mockedAuthGuard = mock(AuthGuard);
const mockedAuthService = mock(AuthService);

describe('ServalAdminAuthGuard', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: AuthGuard, useMock: mockedAuthGuard },
      { provide: AuthService, useMock: mockedAuthService }
    ]
  }));

  it('can activate if user is logged in and has ServalAdmin role', () => {
    const env = new TestEnvironment(true, SystemRole.ServalAdmin);

    env.service.canActivate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(true);
    });
  });

  it('cannot activate if user is not logged in', () => {
    const env = new TestEnvironment(false, SystemRole.None);

    env.service.canActivate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(false);
    });
  });

  it('cannot activate if user is logged in but does not have ServalAdmin role', () => {
    const env = new TestEnvironment(true, SystemRole.SystemAdmin);

    env.service.canActivate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(false);
    });
  });

  class TestEnvironment {
    readonly service: ServalAdminAuthGuard;

    constructor(isLoggedIn: boolean, role: SystemRole) {
      this.service = TestBed.inject(ServalAdminAuthGuard);
      when(mockedAuthGuard.canActivate(anything(), anything())).thenReturn(of(isLoggedIn));
      when(mockedAuthGuard.allowTransition()).thenReturn(of(isLoggedIn));
      when(mockedAuthService.currentUserRoles).thenReturn([role]);
    }
  }
});
