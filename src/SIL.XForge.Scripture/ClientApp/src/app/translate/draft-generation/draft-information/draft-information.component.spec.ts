import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { mock, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftInformationComponent } from './draft-information.component';

const mockAuthService = mock(AuthService);

describe('DraftInformationComponent', () => {
  configureTestingModule(() => ({
    providers: [{ provide: AuthService, useMock: mockAuthService }]
  }));

  it('should return true if the user is serval admin, and build has additional info', () => {
    const env = new TestEnvironment(() => {
      when(mockAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
    });
    env.component.draftJob = { additionalInfo: {} } as BuildDto;
    env.fixture.detectChanges();
    expect(env.component.canShowAdditionalInfo).toBe(true);
    expect(env.infoUnavailableMessage).toBeNull();
  });

  it('should return false if the draft build has no additional info', () => {
    const env = new TestEnvironment(() => {
      when(mockAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
    });
    env.component.draftJob = {} as BuildDto;
    env.fixture.detectChanges();
    expect(env.component.canShowAdditionalInfo).toBe(false);
    expect(env.infoUnavailableMessage).not.toBeNull();
  });

  it('should return false if the user is not system admin', () => {
    const env = new TestEnvironment();
    env.component.draftJob = { additionalInfo: {} } as BuildDto;
    env.fixture.detectChanges();
    expect(env.component.canShowAdditionalInfo).toBe(false);
    expect(env.infoUnavailableMessage).not.toBeNull();
  });
});

class TestEnvironment {
  component: DraftInformationComponent;
  fixture: ComponentFixture<DraftInformationComponent>;
  currentUserId: string = 'user01';

  constructor(setup?: () => void) {
    when(mockAuthService.currentUserRoles).thenReturn([SystemRole.User]);
    if (setup != null) {
      setup();
    }
    this.fixture = TestBed.createComponent(DraftInformationComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get infoUnavailableMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.info-unavailable');
  }
}
