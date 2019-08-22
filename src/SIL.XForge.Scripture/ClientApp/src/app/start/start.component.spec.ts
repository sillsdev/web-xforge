import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import * as OTJson0 from 'ot-json0';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { StartComponent } from './start.component';

describe('StartComponent', () => {
  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData('project02');
    env.fixture.detectChanges();
    flush();

    verify(env.mockedRouter.navigate(deepEqual(['./', 'project02']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first project when no last project set', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData();
    env.fixture.detectChanges();
    flush();

    verify(env.mockedRouter.navigate(deepEqual(['./', 'project01']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when there are no projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUserProjectData(undefined, []);
    env.fixture.detectChanges();
    flush();

    verify(env.mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));
});

class TestEnvironment {
  readonly component: StartComponent;
  readonly fixture: ComponentFixture<StartComponent>;

  readonly mockedUserService = mock(UserService);
  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedRouter = mock(Router);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  constructor() {
    TestBed.configureTestingModule({
      declarations: [StartComponent],
      imports: [UICommonModule, RouterTestingModule],
      providers: [
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: Router, useFactory: () => instance(this.mockedRouter) }
      ]
    });
    this.fixture = TestBed.createComponent(StartComponent);
    this.component = this.fixture.componentInstance;
  }

  setCurrentUserProjectData(projectId?: string, projects: string[] = ['project01', 'project02']): void {
    const currentUserDoc = new UserDoc(
      new MemoryRealtimeDocAdapter('user01', OTJson0.type, {
        sites: { sf: { currentProjectId: projectId == null ? undefined : projectId, projects } }
      }),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedUserService.getCurrentUser()).thenResolve(currentUserDoc);
  }
}
