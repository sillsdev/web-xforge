import { Component } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Route, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { SFProjectService } from '../app/core/sf-project.service';
import {
  ActivatedProjectService,
  ActiveProjectIdService,
  TestActiveProjectIdService
} from './activated-project.service';
import { DocSubscription } from './models/realtime-doc';
import { configureTestingModule } from './test-utils';

const mockedSFProjectService = mock(SFProjectService);

@Component({
  template: '<div></div>'
})
class MockComponent {}

const ROUTES: Route[] = [{ path: 'projects/:projectId', component: MockComponent }];
let env: TestEnvironment;

describe('ActiveProjectIdService', () => {
  configureTestingModule(() => ({
    providers: [provideRouter(ROUTES)]
  }));

  beforeEach(() => (env = new TestEnvironment()));
  afterEach(() => env.dispose());

  it('should emit the project ID from the route parameters', fakeAsync(() => {
    const projectId = 'project01';
    env.router.navigate(['projects', projectId]);
    tick();
    expect(env.currentProjectId).toBe(projectId);
  }));

  it('should not emit new project ID when query parameter sharing is set', fakeAsync(() => {
    const projectId = 'project01';
    env.router.navigate(['projects', projectId]);
    tick();
    expect(env.currentProjectId).toBe(projectId);
    env.router.navigate(['projects', 'project02'], { queryParams: { sharing: 'true' } });
    tick();
    expect(env.currentProjectId).toBe('project01');
  }));
});

class TestEnvironment {
  readonly router: Router;
  readonly service: ActiveProjectIdService;
  currentProjectId?: string;

  private subscription: Subscription;

  constructor() {
    this.router = TestBed.inject(Router);
    this.service = TestBed.inject(ActiveProjectIdService);

    this.subscription = this.service.projectId$.subscribe(projectId => (this.currentProjectId = projectId));
  }

  dispose(): void {
    this.subscription.unsubscribe();
  }
}

describe('ActivatedProjectService', () => {
  let env: ActivatedProjectTestEnvironment;

  configureTestingModule(() => ({
    providers: [
      ActivatedProjectService,
      { provide: ActiveProjectIdService, useFactory: () => new TestActiveProjectIdService() },
      { provide: SFProjectService, useMock: mockedSFProjectService }
    ]
  }));

  beforeEach(() => (env = new ActivatedProjectTestEnvironment()));
  it('switched$ emits only for defined project switches different from last defined project', fakeAsync(() => {
    let emittedCount = 0;

    env.activateProject('projectA');
    tick();
    env.service.switched$.subscribe(() => emittedCount++);

    expect(emittedCount).toBe(0);

    env.activateProject('projectB');
    tick();
    // We switched from A to B.
    expect(emittedCount).toBe(1);

    env.activateProject(undefined);
    tick();
    // Not a switch.
    expect(emittedCount).toBe(1);

    env.activateProject('projectB');
    tick();
    // Not a switch. We were last at B.
    expect(emittedCount).toBe(1);

    env.activateProject(undefined);
    tick();
    // Not a switch.
    expect(emittedCount).toBe(1);

    env.activateProject('projectA');
    tick();
    // Now we switched, from B to A.
    expect(emittedCount).toBe(2);
  }));

  it('keeps the previous project subscription until the next project doc is emitted', fakeAsync(() => {
    let firstDocSubscription: DocSubscription | undefined;
    let secondDocSubscription: DocSubscription | undefined;
    let resolveSecondProject!: (value: SFProjectProfileDoc) => void;
    let getProfileCallCount = 0;

    // Configure the first profile request to resolve immediately and the second to stay pending.
    when(mockedSFProjectService.getProfile(anything(), anything())).thenCall(
      (projectId: string, docSubscription: DocSubscription) => {
        getProfileCallCount++;
        if (getProfileCallCount === 1) {
          firstDocSubscription = docSubscription;
          return Promise.resolve({ id: projectId } as SFProjectProfileDoc);
        }

        secondDocSubscription = docSubscription;
        return new Promise<SFProjectProfileDoc>(resolve => {
          resolveSecondProject = resolve;
        });
      }
    );

    // Step 1: Activate projectA and let its profile load complete.
    env.activateProject('projectA');
    tick();

    // Step 2: Activate projectB; its profile request starts but is still pending.
    env.activateProject('projectB');
    tick();

    // Step 3: While projectB is pending, both subscriptions should remain active.
    expect(firstDocSubscription?.isUnsubscribed$.getValue()).toBeFalse();
    expect(secondDocSubscription?.isUnsubscribed$.getValue()).toBeFalse();

    // Step 4: Resolve projectB so it can become the active project document.
    resolveSecondProject({ id: 'projectB' } as SFProjectProfileDoc);
    tick();

    // Step 5: After projectB emits, projectA is safely unsubscribed.
    expect(firstDocSubscription?.isUnsubscribed$.getValue()).toBeTrue();
    expect(env.service.projectDoc?.id).toBe('projectB');
  }));

  it('unsubscribes a pending project fetch when a newer project selection starts', fakeAsync(() => {
    let secondDocSubscription: DocSubscription | undefined;
    let thirdDocSubscription: DocSubscription | undefined;
    let resolveSecondProject!: (value: SFProjectProfileDoc) => void;
    let resolveThirdProject!: (value: SFProjectProfileDoc) => void;
    let getProfileCallCount = 0;

    // Configure projectA to resolve immediately, then keep projectB and projectC pending.
    when(mockedSFProjectService.getProfile(anything(), anything())).thenCall(
      (projectId: string, docSubscription: DocSubscription) => {
        getProfileCallCount++;
        if (getProfileCallCount === 1) {
          return Promise.resolve({ id: projectId } as SFProjectProfileDoc);
        }
        if (getProfileCallCount === 2) {
          secondDocSubscription = docSubscription;
          return new Promise<SFProjectProfileDoc>(resolve => {
            resolveSecondProject = resolve;
          });
        }

        thirdDocSubscription = docSubscription;
        return new Promise<SFProjectProfileDoc>(resolve => {
          resolveThirdProject = resolve;
        });
      }
    );

    // Step 1: Activate projectA so there is a current project doc.
    env.activateProject('projectA');
    tick();

    // Step 2: Activate projectB, leaving its profile request pending.
    env.activateProject('projectB');
    tick();

    // Step 3: Activate projectC before projectB resolves.
    // projectB becomes stale and should be unsubscribed.
    env.activateProject('projectC');
    tick();

    // Step 4: Confirm stale projectB was unsubscribed, while projectC is still active.
    expect(secondDocSubscription?.isUnsubscribed$.getValue()).toBeTrue();
    expect(thirdDocSubscription?.isUnsubscribed$.getValue()).toBeFalse();

    // Step 5: Resolve stale projectB and verify it is ignored.
    resolveSecondProject({ id: 'projectB' } as SFProjectProfileDoc);
    tick();
    expect(env.service.projectDoc?.id).toBe('projectA');

    // Step 6: Resolve projectC and verify it becomes the current project doc.
    resolveThirdProject({ id: 'projectC' } as SFProjectProfileDoc);
    tick();
    expect(env.service.projectDoc?.id).toBe('projectC');
  }));
});

/** Test environment for ActivatedProjectService tests. */
class ActivatedProjectTestEnvironment {
  readonly service: ActivatedProjectService;

  private readonly activeProjectIdService: TestActiveProjectIdService;

  constructor() {
    this.activeProjectIdService = TestBed.inject(ActiveProjectIdService) as unknown as TestActiveProjectIdService;
    this.service = TestBed.inject(ActivatedProjectService);

    when(mockedSFProjectService.getProfile(anything(), anything())).thenCall(
      async (projectId: string) => ({ id: projectId }) as SFProjectProfileDoc
    );
  }

  activateProject(projectId: string | undefined): void {
    this.activeProjectIdService.projectId$.next(projectId);
  }
}
