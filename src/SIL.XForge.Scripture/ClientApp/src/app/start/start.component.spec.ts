import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { StartComponent } from './start.component';

const mockedRouter = mock(Router);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedNoticeService = mock(NoticeService);
const mockedUserService = mock(UserService);

describe('StartComponent', () => {
  configureTestingModule(() => ({
    declarations: [StartComponent],
    imports: [UICommonModule, RouterTestingModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: Router, useMock: mockedRouter },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData('project02');
    env.fixture.detectChanges();
    flush();

    verify(mockedRouter.navigate(deepEqual(['./', 'project02']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first project when no last project set', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData();
    env.fixture.detectChanges();
    flush();

    verify(mockedRouter.navigate(deepEqual(['./', 'project01']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when there are no projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData(undefined, []);
    env.fixture.detectChanges();
    flush();

    verify(mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('do not navigate to last project when it does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData('project02', ['project01']);
    env.fixture.detectChanges();
    flush();

    verify(mockedRouter.navigate(deepEqual(['./', 'project01']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first project when added remotely', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData(undefined, []);
    env.fixture.detectChanges();
    flush();

    verify(mockedRouter.navigate(anything(), anything())).never();

    env.addProject('project01');

    verify(mockedRouter.navigate(deepEqual(['./', 'project01']), anything())).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  readonly component: StartComponent;
  readonly fixture: ComponentFixture<StartComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );

    this.fixture = TestBed.createComponent(StartComponent);
    this.component = this.fixture.componentInstance;
  }

  setCurrentUserProjectData(projectId?: string, projects: string[] = ['project01', 'project02']): void {
    when(mockedUserService.currentProjectId).thenReturn(projectId);

    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: {
        name: 'User 01',
        email: 'user1@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth01',
        displayName: 'User 01',
        sites: { sf: { projects } }
      }
    });
  }

  addProject(projectId: string): void {
    this.realtimeService
      .get<UserDoc>(UserDoc.COLLECTION, 'user01')
      .submitJson0Op(ops => ops.add<string>(u => u.sites.sf.projects, projectId), false);
  }
}
