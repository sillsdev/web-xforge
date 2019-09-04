import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { UserDoc } from 'xforge-common/models/user-doc';
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

  private readonly offlineStore = new MemoryRealtimeOfflineStore();

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
      this.offlineStore,
      new MemoryRealtimeDocAdapter(UserDoc.COLLECTION, 'user01', {
        sites: { sf: { currentProjectId: projectId == null ? undefined : projectId, projects } }
      })
    );
    when(this.mockedUserService.getCurrentUser()).thenResolve(currentUserDoc);
  }
}
