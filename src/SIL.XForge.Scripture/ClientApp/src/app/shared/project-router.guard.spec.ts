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

  it('can navigate away when no changes', () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    spyOn(window, 'confirm');
    expect(env.service.canDeactivate({ confirmOnLeavePrompt: 'unsaved changed', needsConfirmation: () => false })).toBe(
      true
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('can shows prompt and navigate away', () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    spyOn(window, 'confirm').and.returnValue(true);
    expect(env.service.canDeactivate({ confirmOnLeavePrompt: 'unsaved changed', needsConfirmation: () => true })).toBe(
      true
    );
    expect(window.confirm).toHaveBeenCalled();
  });

  it('can shows prompt and stay on page', () => {
    // navigate away
    const env = new DraftNavigationTestEnvironment();
    spyOn(window, 'confirm').and.returnValue(false);
    expect(env.service.canDeactivate({ confirmOnLeavePrompt: 'unsaved changed', needsConfirmation: () => true })).toBe(
      false
    );
    expect(window.confirm).toHaveBeenCalled();
  });
});

class DraftNavigationTestEnvironment {
  service: DraftNavigationAuthGuard;
  constructor() {
    this.service = TestBed.inject(DraftNavigationAuthGuard);
  }
}
