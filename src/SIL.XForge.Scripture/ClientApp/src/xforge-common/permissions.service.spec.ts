import { TestBed, fakeAsync } from '@angular/core/testing';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { instance, mock, when } from 'ts-mockito';
import { PermissionsService } from './permissions.service';
import { configureTestingModule } from './test-utils';
import { UserService } from './user.service';

const mockedUserService = mock(UserService);
const mockedProjectDoc = mock(SFProjectProfileDoc);

fdescribe('PermissionsService', () => {
  configureTestingModule(() => ({
    providers: [{ provide: UserService, useMock: mockedUserService }]
  }));

  it('allows translators to access Translate', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn('commenter');

    expect(env.service.canAccessTranslate(env.projectDoc)).toBe(true);
    expect(env.service.canAccessTranslate(env.projectDoc, 'commenter')).toBe(true);
  }));

  it('allows checkers to access Community Checking if enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn('checker');

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, 'checker')).toBe(true);
  }));

  it('allows admins to access both', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn('projectAdmin');

    expect(env.service.canAccessTranslate(env.projectDoc)).toBe(true);
    expect(env.service.canAccessTranslate(env.projectDoc, 'projectAdmin')).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, 'projectAdmin')).toBe(true);
  }));

  it('doesnt allow checkers to access Translate', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn('checker');

    expect(env.service.canAccessTranslate(env.projectDoc)).toBe(false);
    expect(env.service.canAccessTranslate(env.projectDoc, 'checker')).toBe(false);
  }));

  it('doesnt allow translators to access Community Checking', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn('commenter');

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(false);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, 'commenter')).toBe(false);
  }));

  it('doesnt allow checkers to access Community Checking if not enabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    when(mockedUserService.currentUserId).thenReturn('checker');

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(false);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, 'checker')).toBe(false);
  }));

  it('allows admins to access Community Checking even if disabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    when(mockedUserService.currentUserId).thenReturn('projectAdmin');

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, 'projectAdmin')).toBe(true);
  }));
});

class TestEnvironment {
  readonly service: PermissionsService;
  readonly projectDoc: SFProjectProfileDoc = instance(mockedProjectDoc);

  constructor(checkingEnabled = true) {
    this.service = TestBed.inject(PermissionsService);
    const data = createTestProjectProfile({
      userRoles: {
        projectAdmin: SFProjectRole.ParatextAdministrator,
        checker: SFProjectRole.CommunityChecker,
        commenter: SFProjectRole.Commenter
      },
      checkingConfig: {
        checkingEnabled: checkingEnabled
      }
    });
    when(mockedProjectDoc.data).thenReturn(data);
  }
}
