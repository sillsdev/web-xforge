import { Component } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Route, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ActiveProjectIdService } from './activated-project.service';
import { configureTestingModule } from './test-utils';

@Component({
  template: '<div></div>'
})
class MockComponent {}

const ROUTES: Route[] = [{ path: 'projects/:projectId', component: MockComponent }];
let env: TestEnvironment;

describe('ActiveProjectIdService', () => {
  configureTestingModule(() => ({
    imports: [RouterModule.forRoot(ROUTES)]
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
