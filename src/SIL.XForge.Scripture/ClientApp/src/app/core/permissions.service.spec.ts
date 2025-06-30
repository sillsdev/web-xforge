import { fakeAsync, TestBed } from '@angular/core/testing';
import { User } from '@bugsnag/js';
import { cloneDeep } from 'lodash-es';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { RecursivePartial } from 'realtime-server/lib/esm/common/utils/type-utils';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { UNKNOWN_COMPONENT_OR_SERVICE } from 'xforge-common/models/realtime-doc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from './models/sf-type-registry';
import { TextDocId } from './models/text-doc';
import { RESOURCE_IDENTIFIER_LENGTH } from './paratext.service';
import { PermissionsService } from './permissions.service';
import { SFProjectService } from './sf-project.service';

const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);
const mockedProjectDoc = mock(SFProjectProfileDoc);
describe('PermissionsService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('allows commenters to access Translate', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.Commenter);

    expect(env.service.canAccessTranslate(env.projectDoc)).toBe(true);
    expect(env.service.canAccessTranslate(env.projectDoc, SFProjectRole.Commenter)).toBe(true);
  }));

  it('does not allow commenters to access drafts', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.Commenter);

    expect(env.service.canAccessDrafts(env.projectDoc)).toBe(false);
    expect(env.service.canAccessDrafts(env.projectDoc, SFProjectRole.Commenter)).toBe(false);
  }));

  it('allows checkers to access Community Checking if enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.CommunityChecker);

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, SFProjectRole.CommunityChecker)).toBe(true);
  }));

  it('allows admins to access translate, checking, and drafts', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.ParatextAdministrator);

    expect(env.service.canAccessTranslate(env.projectDoc)).toBe(true);
    expect(env.service.canAccessTranslate(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(true);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(true);
    expect(env.service.canAccessDrafts(env.projectDoc)).toBe(true);
    expect(env.service.canAccessDrafts(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(true);
  }));

  it('does not allow checkers to access Translate', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.CommunityChecker);

    expect(env.service.canAccessTranslate(env.projectDoc)).toBe(false);
    expect(env.service.canAccessTranslate(env.projectDoc, SFProjectRole.CommunityChecker)).toBe(false);
  }));

  it('does not allow commenters to access Community Checking', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.Commenter);

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(false);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, SFProjectRole.Commenter)).toBe(false);
  }));

  it('does not allow checkers to access Community Checking if not enabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.CommunityChecker);

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(false);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, SFProjectRole.CommunityChecker)).toBe(false);
  }));

  it('does not allow admins to access Community Checking if not enabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    when(mockedUserService.currentUserId).thenReturn(SFProjectRole.ParatextAdministrator);

    expect(env.service.canAccessCommunityChecking(env.projectDoc)).toBe(false);
    expect(env.service.canAccessCommunityChecking(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(false);
  }));

  it('allows access to text if user is on project and has permission', fakeAsync(async () => {
    const env = new TestEnvironment();

    const textDoc: Partial<TextDocId> = { projectId: 'project01', bookNum: 41, chapterNum: 1 };

    expect(await env.service.canAccessText(cloneDeep(textDoc) as TextDocId)).toBe(true);
  }));

  it('does not allow access to text if user is not on project', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.setCurrentUser('other');

    const textDoc: Partial<TextDocId> = { projectId: 'project01', bookNum: 41, chapterNum: 1 };

    expect(await env.service.canAccessText(cloneDeep(textDoc) as TextDocId)).toBe(false);
  }));

  it('does not allow access to text if user has no access', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.setupProjectData(TextInfoPermission.None);

    const textDoc: Partial<TextDocId> = { projectId: 'project01', bookNum: 41, chapterNum: 1 };

    expect(await env.service.canAccessText(cloneDeep(textDoc) as TextDocId)).toBe(false);
  }));

  it('checks current user doc to determine if user is on project', fakeAsync(async () => {
    const env = new TestEnvironment();

    expect(await env.service.isUserOnProject('project01')).toBe(true);

    env.setCurrentUser('other');

    expect(await env.service.isUserOnProject('project01')).toBe(false);
  }));

  it('checks the project doc to determine if user has a Paratext role on the project', fakeAsync(async () => {
    const env = new TestEnvironment();
    expect(await env.service.userHasParatextRoleOnProject('project01')).toBe(true);
    env.setCurrentUser('other');
    expect(await env.service.userHasParatextRoleOnProject('project01')).toBe(false);
    verify(mockedProjectService.getProfile('project01')).twice();
  }));

  describe('canSync', () => {
    it('returns false when projectDoc.data is undefined', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedProjectDoc.data).thenReturn(undefined);
      expect(env.service.canSync(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(false);
    }));

    it('uses current user id if userId is not provided', () => {
      const env = new TestEnvironment();
      expect(env.service.canSync(env.projectDoc)).toBe(false);
      verify(mockedUserService.currentUserId).once();
    });

    it('does not use current user id if userId is provided', () => {
      const env = new TestEnvironment();
      expect(env.service.canSync(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(true);
      verify(mockedUserService.currentUserId).never();
    });

    it('allows PT admin role to sync projects', () => {
      const env = new TestEnvironment();
      env.setProjectType('project');
      expect(env.service.canSync(env.projectDoc, SFProjectRole.ParatextAdministrator)).toBe(true);
    });

    it('allows PT translator role to sync projects', () => {
      const env = new TestEnvironment();
      env.setProjectType('project');
      expect(env.service.canSync(env.projectDoc, SFProjectRole.ParatextTranslator)).toBe(true);
    });

    it('allows any PT role to sync resources', () => {
      const env = new TestEnvironment();
      env.setProjectType('resource');

      Object.values(SFProjectRole).forEach(role => {
        if (!isParatextRole(role)) {
          return;
        }

        expect(env.service.canSync(env.projectDoc, role)).toBe(true);
      });
    });

    it('disallows non- PT admin/translator roles to sync projects', () => {
      const env = new TestEnvironment();
      env.setProjectType('project');

      Object.values(SFProjectRole).forEach(role => {
        if (role === SFProjectRole.ParatextAdministrator || role === SFProjectRole.ParatextTranslator) {
          return;
        }

        expect(env.service.canSync(env.projectDoc, role)).toBe(false);
      });
    });

    describe('canAccessBiblicalTerms', () => {
      it('returns true if user has permissions', () => {
        const env = new TestEnvironment();
        env.setCurrentUser(SFProjectRole.ParatextTranslator);
        expect(env.service.canAccessBiblicalTerms(env.projectDoc)).toBe(true);
      });

      it('returns false if biblical terms enabled is false', () => {
        const env = new TestEnvironment();
        env.setCurrentUser(SFProjectRole.ParatextAdministrator);

        env.setProjectProfile({ biblicalTermsConfig: { biblicalTermsEnabled: false } });
        expect(env.service.canAccessBiblicalTerms(env.projectDoc)).toBe(false);
      });

      it('returns false if user does not has permissions', () => {
        const env = new TestEnvironment();
        env.setCurrentUser(SFProjectRole.Commenter);
        expect(env.service.canAccessBiblicalTerms(env.projectDoc)).toBe(false);
      });
    });
  });
});
class TestEnvironment {
  readonly service: PermissionsService;
  readonly projectDoc: SFProjectProfileDoc = instance(mockedProjectDoc);
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(readonly checkingEnabled = true) {
    this.service = TestBed.inject(PermissionsService);

    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id, UNKNOWN_COMPONENT_OR_SERVICE)
    );

    this.setProjectProfile();
    this.setupProjectData();
    this.setCurrentUser();
    this.setupUserData();
  }

  setupProjectData(textPermission?: TextInfoPermission): void {
    const projectId: string = 'project01';
    const permission: TextInfoPermission = textPermission ?? TextInfoPermission.Write;

    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: projectId,
      data: createTestProjectProfile({
        translateConfig: {},
        userRoles: {
          user01: SFProjectRole.ParatextTranslator,
          user02: SFProjectRole.ParatextConsultant
        },
        texts: [
          {
            bookNum: 41,
            chapters: [
              {
                number: 1,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: permission,
                  user02: permission
                }
              }
            ],
            hasSource: true,
            permissions: {
              user01: permission,
              user02: permission
            }
          }
        ]
      })
    });
  }

  setCurrentUser(userId: string = 'user01'): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, userId, UNKNOWN_COMPONENT_OR_SERVICE)
    );
  }

  setupUserData(userId: string = 'user01', projects: string[] = ['project01']): void {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: userId,
      data: createTestUser({
        sites: {
          sf: {
            projects
          }
        }
      })
    });
  }

  setProjectProfile(overrides?: RecursivePartial<SFProjectProfile>): void {
    const userRoles = Object.values(SFProjectRole).reduce((roles, role) => ({ ...roles, [role]: role }), {});
    const config = {
      userRoles,
      checkingConfig: {
        checkingEnabled: this.checkingEnabled
      },
      biblicalTermsConfig: { biblicalTermsEnabled: true },
      ...overrides
    };
    const data = createTestProjectProfile(config);
    when(mockedProjectDoc.data).thenReturn(data);
  }

  setProjectType(projectType: 'resource' | 'project'): string {
    // DBL resources can be identified by length of paratext id
    const paratextId = Array(projectType === 'resource' ? RESOURCE_IDENTIFIER_LENGTH : 40)
      .fill('a')
      .join('');

    this.setProjectProfile({
      paratextId: paratextId
    });

    return paratextId;
  }
}
