import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetricsAuthGuard } from './event-metrics-auth.guard';

const mockedAuthGuard = mock(AuthGuard);
const mockedAuthService = mock(AuthService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('EventMetricsAuthGuard', () => {
  const project01 = 'project01';
  const project02 = 'project02';
  const user01 = 'user01';
  configureTestingModule(() => ({
    providers: [
      { provide: AuthGuard, useMock: mockedAuthGuard },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('can activate if user is logged in and has ServalAdmin role', fakeAsync(() => {
    const env = new TestEnvironment(true, SystemRole.ServalAdmin);

    env.service.canActivate(env.getActivatedRouteSnapshot(project02), {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(true);
    });

    env.wait();
  }));

  it('can activate if user is logged in and has SystemAdmin role', fakeAsync(() => {
    const env = new TestEnvironment(true, SystemRole.SystemAdmin);

    env.service.canActivate(env.getActivatedRouteSnapshot(project02), {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(true);
    });

    env.wait();
  }));

  it('can activate if user is logged in and has pt_administrator role', fakeAsync(() => {
    const env = new TestEnvironment(true, SystemRole.User);

    env.service.canActivate(env.getActivatedRouteSnapshot(project01), {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(true);
    });

    env.wait();
  }));

  it('cannot activate if user is not logged in', fakeAsync(() => {
    const env = new TestEnvironment(false, SystemRole.None);

    env.service.canActivate(env.getActivatedRouteSnapshot(project02), {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(false);
    });

    env.wait();
  }));

  it('cannot activate if user is logged in but does not have any administrator role', fakeAsync(() => {
    const env = new TestEnvironment(true, SystemRole.User);

    env.service.canActivate(env.getActivatedRouteSnapshot(project02), {} as RouterStateSnapshot).subscribe(result => {
      expect(result).toBe(false);
    });

    env.wait();
  }));

  class TestEnvironment {
    readonly service: EventMetricsAuthGuard;

    constructor(isLoggedIn: boolean, role: SystemRole) {
      this.service = TestBed.inject(EventMetricsAuthGuard);
      when(mockedAuthGuard.canActivate(anything(), anything())).thenReturn(of(isLoggedIn));
      when(mockedAuthGuard.allowTransition()).thenReturn(of(isLoggedIn));
      when(mockedAuthService.currentUserRoles).thenReturn([role]);
      when(mockedUserService.currentUserId).thenReturn(user01);

      when(mockedProjectService.getProfile(project01)).thenReturn(
        Promise.resolve({
          data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextAdministrator } })
        } as SFProjectProfileDoc)
      );
      when(mockedProjectService.getProfile(project02)).thenReturn(
        Promise.resolve({
          data: createTestProjectProfile()
        } as SFProjectProfileDoc)
      );
    }

    getActivatedRouteSnapshot(projectId: string): ActivatedRouteSnapshot {
      const snapshot = new ActivatedRouteSnapshot();
      snapshot.params = { projectId: projectId };
      return snapshot;
    }

    wait(): void {
      tick();
    }
  }
});
