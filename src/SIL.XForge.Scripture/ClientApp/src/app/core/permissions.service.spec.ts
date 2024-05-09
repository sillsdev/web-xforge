import { HttpClientTestingModule } from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { User } from '@bugsnag/js';
import { cloneDeep } from 'lodash-es';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { anything, instance, mock, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from './models/sf-type-registry';
import { TextDocId } from './models/text-doc';
import { PermissionsService } from './permissions.service';
import { SFProjectService } from './sf-project.service';

const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);
const mockedProjectDoc = mock(SFProjectProfileDoc);
describe('PermissionsService', () => {
  configureTestingModule(() => ({
    imports: [
      RouterModule.forRoot([]),
      UICommonModule,
      TestTranslocoModule,
      HttpClientTestingModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
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

  it('allows access to text if user is on project and has permission', fakeAsync(async () => {
    const env = new TestEnvironment();

    const textDoc: Partial<TextDocId> = { projectId: 'project01', bookNum: 41, chapterNum: 1 };

    expect(await env.service.canAccessText(cloneDeep(textDoc) as TextDocId)).toBe(true);
  }));

  it('doesnt allow access to text if user is not on project', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.setCurrentUser('other');

    const textDoc: Partial<TextDocId> = { projectId: 'project01', bookNum: 41, chapterNum: 1 };

    expect(await env.service.canAccessText(cloneDeep(textDoc) as TextDocId)).toBe(false);
  }));

  it('doesnt allow access to text if user has no access', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.setupProjectData(TextInfoPermission.None);

    const textDoc: Partial<TextDocId> = { projectId: 'project01', bookNum: 41, chapterNum: 1 };

    expect(await env.service.canAccessText(cloneDeep(textDoc) as TextDocId)).toBe(false);
  }));
});
class TestEnvironment {
  readonly service: PermissionsService;
  readonly projectDoc: SFProjectProfileDoc = instance(mockedProjectDoc);
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

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
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );
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
    when(mockedUserService.getCurrentUser()).thenCall(() => this.realtimeService.subscribe(UserDoc.COLLECTION, userId));
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
}
