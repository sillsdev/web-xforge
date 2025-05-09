import { TestBed } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { AuthGuard } from 'xforge-common/auth.guard';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectService } from '../core/sf-project.service';
import { DraftNavigationAuthGuard } from './project-router.guard';

const mockedAuthGuard = mock(AuthGuard);
const mockedProjectService = mock(SFProjectService);

describe('DraftNavigationAuthGuard', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: AuthGuard, useMock: mockedAuthGuard },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('can navigate away when no changes', async () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    expect(await env.service.canDeactivate({ confirmLeave: () => Promise.resolve(true) })).toBe(true);
  });

  it('can shows prompt and stay on page', async () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    expect(await env.service.canDeactivate({ confirmLeave: () => Promise.resolve(false) })).toBe(false);
  });
});

class DraftNavigationTestEnvironment {
  service: DraftNavigationAuthGuard;
  constructor() {
    this.service = TestBed.inject(DraftNavigationAuthGuard);
  }
}
