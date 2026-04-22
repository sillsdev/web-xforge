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
