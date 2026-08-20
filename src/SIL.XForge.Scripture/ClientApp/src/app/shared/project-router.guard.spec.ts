import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { mock, when } from 'ts-mockito';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { DraftNavigationAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './project-router.guard';

const mockedAuthGuard = mock(AuthGuard);
const mockedAuthService = mock(AuthService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('DraftNavigationAuthGuard', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: AuthGuard, useMock: mockedAuthGuard },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('can navigate away when no changes', async () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    expect(await env.service.canDeactivate({ confirmLeave: () => Promise.resolve(true) })).toBe(true);
  });

  it('can shows prompt and stay on page', async () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    expect(await env.service.canDeactivate({ confirmLeave: () => Promise.resolve(false) })).toBe(false);
  });
});

describe('SyncAuthGuard', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: AuthGuard, useMock: mockedAuthGuard },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('administrators can access sync', async () => {
    // navigate away
    const env = new GuardTestEnvironment(SyncAuthGuard, false);
    expect(
      env.service.check({
        data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextAdministrator } })
      } as SFProjectProfileDoc)
    ).toBe(true);
  });

  it('translators can access sync', async () => {
    // navigate away
    const env = new GuardTestEnvironment(SyncAuthGuard, false);
    expect(
      env.service.check({
        data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextTranslator } })
      } as SFProjectProfileDoc)
    ).toBe(true);
  });

  it('consultants cannot access sync', async () => {
    // navigate away
    const env = new GuardTestEnvironment(SyncAuthGuard, false);
    expect(
      env.service.check({
        data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextConsultant } })
      } as SFProjectProfileDoc)
    ).toBe(false);
  });

  it('serval administrators can access sync on resources they have read access to', async () => {
    const env = new GuardTestEnvironment(SyncAuthGuard, true);
    expect(
      env.service.check({
        data: createTestProjectProfile({
          userRoles: { user01: SFProjectRole.ParatextObserver },
          paratextId: 'ResourceResource'
        })
      } as SFProjectProfileDoc)
    ).toBe(true);
  });

  it('serval administrators can access sync on projects they are not a member of', async () => {
    const env = new GuardTestEnvironment(SyncAuthGuard, true);
    expect(
      env.service.check({
        data: createTestProjectProfile({ userRoles: {} })
      } as SFProjectProfileDoc)
    ).toBe(true);
  });
});

// SettingsAuthGuard and UsersAuthGuard share the same access rule
for (const guardType of [SettingsAuthGuard, UsersAuthGuard]) {
  describe(guardType.name, () => {
    configureTestingModule(() => ({
      providers: [
        { provide: AuthGuard, useMock: mockedAuthGuard },
        { provide: AuthService, useMock: mockedAuthService },
        { provide: SFProjectService, useMock: mockedProjectService },
        { provide: UserService, useMock: mockedUserService }
      ]
    }));

    it('administrators can access', async () => {
      const env = new GuardTestEnvironment(guardType, false);
      expect(
        env.service.check({
          data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextAdministrator } })
        } as SFProjectProfileDoc)
      ).toBe(true);
    });

    it('translators cannot access', async () => {
      const env = new GuardTestEnvironment(guardType, false);
      expect(
        env.service.check({
          data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextTranslator } })
        } as SFProjectProfileDoc)
      ).toBe(false);
    });

    it('serval administrators can access on projects they are not a member of', async () => {
      const env = new GuardTestEnvironment(guardType, true);
      expect(
        env.service.check({
          data: createTestProjectProfile({ userRoles: {} })
        } as SFProjectProfileDoc)
      ).toBe(true);
    });
  });
}

class DraftNavigationTestEnvironment {
  service: DraftNavigationAuthGuard;
  constructor() {
    this.service = TestBed.inject(DraftNavigationAuthGuard);
  }
}

class GuardTestEnvironment<T> {
  service: T;
  constructor(guardType: Type<T>, servalAdmin: boolean) {
    this.service = TestBed.inject(guardType);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedAuthService.currentUserRoles).thenReturn(servalAdmin ? [SystemRole.ServalAdmin] : [SystemRole.User]);
  }
}
