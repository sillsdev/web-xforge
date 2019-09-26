import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { configureTestSuite } from 'ng-bullet';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { anything, deepEqual, instance, mock, reset, verify, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_REALTIME_DOC_TYPES } from '../core/models/sf-realtime-doc-types';
import { StartComponent } from './start.component';

const mockedUserService = mock(UserService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedRouter = mock(Router);

describe('StartComponent', () => {
  configureTestSuite(() => {
    TestBed.configureTestingModule({
      declarations: [StartComponent],
      imports: [UICommonModule, RouterTestingModule],
      providers: [
        { provide: UserService, useFactory: () => instance(mockedUserService) },
        { provide: ActivatedRoute, useFactory: () => instance(mockedActivatedRoute) },
        { provide: Router, useFactory: () => instance(mockedRouter) }
      ]
    });
  });

  beforeEach(() => {
    reset(mockedUserService);
    reset(mockedActivatedRoute);
    reset(mockedRouter);
  });

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
});

class TestEnvironment {
  readonly component: StartComponent;
  readonly fixture: ComponentFixture<StartComponent>;

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

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
}
