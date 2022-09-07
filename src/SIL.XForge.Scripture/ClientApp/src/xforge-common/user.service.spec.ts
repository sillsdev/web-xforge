import { anything, capture, instance, mock, when } from 'ts-mockito';
import { MdcDialog } from '@angular-mdc/web';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { verify } from 'ts-mockito';
import { MdcDialogRef } from '@angular-mdc/web/dialog';
import { of } from 'rxjs';
import { EditNameDialogComponent } from 'xforge-common/edit-name-dialog/edit-name-dialog.component';
import { CURRENT_PROJECT_ID_SETTING, UserService } from './user.service';
import { AuthService } from './auth.service';
import { CommandService } from './command.service';
import { LocalSettingsService } from './local-settings.service';
import { UserDoc } from './models/user-doc';
import { TestRealtimeService } from './test-realtime.service';
import { configureTestingModule } from './test-utils';
import { TestRealtimeModule } from './test-realtime.module';
import { TypeRegistry } from './type-registry';

const mockedAuthService = mock(AuthService);
const mockedLocalSettingsService = mock(LocalSettingsService);
const mockedDialog = mock(MdcDialog);
const mockedCommandService = mock(CommandService);

describe('UserService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(new TypeRegistry([UserDoc], [], []))],
    providers: [
      UserService,
      { provide: AuthService, useMock: mockedAuthService },
      { provide: LocalSettingsService, useMock: mockedLocalSettingsService },
      { provide: MdcDialog, useMock: mockedDialog },
      { provide: CommandService, useMock: mockedCommandService }
    ]
  }));

  it('returns current project id in local storage', async () => {
    const env = new TestEnvironment({ localProjectId: 'project01', storedProjectId: 'project02' });
    const user: UserDoc = await env.service.getCurrentUser();
    expect(env.service.currentProjectId(user)).toEqual('project01');
  });

  it('returns stored project id if local settings is empty', async () => {
    const env = new TestEnvironment({ storedProjectId: 'project02' });
    const user: UserDoc = await env.service.getCurrentUser();
    expect(env.service.currentProjectId(user)).toEqual('project02');
  });

  it('updates the stored project id when requested', async () => {
    const env = new TestEnvironment({ storedProjectId: 'project01' });
    const user: UserDoc = await env.service.getCurrentUser();
    expect(user.data!.sites['sf'].currentProjectId).toEqual('project01');
    env.service.setCurrentProjectId(user, 'project02');
    expect(user.data!.sites['sf'].currentProjectId).toEqual('project02');
    verify(mockedLocalSettingsService.set(CURRENT_PROJECT_ID_SETTING, 'project02')).once();

    // remove current project id
    env.service.setCurrentProjectId(user, undefined);
    expect(user.data!.sites['sf'].currentProjectId).toBeUndefined();
    verify(mockedLocalSettingsService.set(CURRENT_PROJECT_ID_SETTING, undefined)).once();
  });

  it('triggers update for avatar when display name is updated', fakeAsync(() => {
    const env = new TestEnvironment({ storedProjectId: 'project01' });
    env.service.editDisplayName(false);
    tick();
    const [, method] = capture<string, string, any>(mockedCommandService.onlineInvoke).last();
    expect(method).toEqual('updateAvatarFromDisplayName');
  }));
});

interface TestArgs {
  localProjectId?: string;
  storedProjectId?: string;
}

class TestEnvironment {
  readonly service: UserService;
  readonly realtimeService: TestRealtimeService;
  readonly mockedEditNameDialogRef = mock<MdcDialogRef<EditNameDialogComponent>>(MdcDialogRef);

  constructor(testArgs: TestArgs) {
    this.realtimeService = TestBed.inject(TestRealtimeService);
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: {
        name: 'User 01',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        displayName: 'User 01',
        email: 'user01@test.com',
        authId: 'authuser01',
        avatarUrl: 'avatar01',
        sites: { sf: { currentProjectId: testArgs.storedProjectId, projects: ['project01', 'project02'] } }
      }
    });
    this.service = TestBed.inject(UserService);

    when(mockedLocalSettingsService.get<string>(CURRENT_PROJECT_ID_SETTING)).thenReturn(testArgs.localProjectId);
    when(mockedAuthService.currentUserId).thenReturn('user01');
    when(mockedAuthService.isLoggedIn).thenResolve(true);
    when(mockedDialog.open(EditNameDialogComponent, anything())).thenReturn(instance(this.mockedEditNameDialogRef));
    when(this.mockedEditNameDialogRef.afterClosed()).thenReturn(of({ displayName: 'User Name' }));
  }
}
