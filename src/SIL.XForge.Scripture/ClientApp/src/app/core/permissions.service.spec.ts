import { fakeAsync, TestBed } from '@angular/core/testing';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { instance, mock, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { PermissionsService } from './permissions.service';
import { SFProjectService } from './sf-project.service';

const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);
const mockedProjectDoc = mock(SFProjectProfileDoc);
describe('PermissionsService', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('allows commenters to access Translate', fakeAsync(() => {
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

  it('doesnt allow commenters to access Community Checking', fakeAsync(() => {
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

  it('doesnt allow admins to access Community Checking if not enabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    when(mockedUserService.currentUserId).thenReturn('projectAdmin');

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(false);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, 'projectAdmin')).toBe(false);
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
