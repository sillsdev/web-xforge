import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { mock, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { OnboardingRequestAssigneeSelectComponent } from './onboarding-request-assignee-select.component';

const mockedUserService = mock(UserService);

const CURRENT_USER_ID = 'user01';
const ASSIGNEE_USER_ID = 'user02';
const OTHER_USER_ID = 'user03';

/** Host component used to drive the OnboardingRequestAssigneeSelectComponent under test. */
@Component({
  template: `<app-onboarding-request-assignee-select
    [value]="value"
    [knownAssigneeIds]="knownAssigneeIds"
    [currentUserId]="currentUserId"
    (selectionChange)="lastEmitted = $event"
  ></app-onboarding-request-assignee-select>`,
  imports: [OnboardingRequestAssigneeSelectComponent]
})
class TestHostComponent {
  value: string = '';
  knownAssigneeIds: string[] = [];
  currentUserId?: string;
  lastEmitted?: string;
}

describe('OnboardingRequestAssigneeSelectComponent', () => {
  configureTestingModule(() => ({
    imports: [TestHostComponent, getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  describe('getOptions()', () => {
    it('should include the current user in options', fakeAsync(() => {
      const env = new TestEnvironment({ currentUserId: CURRENT_USER_ID });
      env.wait();

      const options = env.component.getOptions();

      expect(options).toContain(CURRENT_USER_ID);
    }));

    it('should include a known assignee who is not the current user', fakeAsync(() => {
      const env = new TestEnvironment({ currentUserId: CURRENT_USER_ID, knownAssigneeIds: [ASSIGNEE_USER_ID] });
      env.wait();

      const options = env.component.getOptions();

      expect(options).toContain(CURRENT_USER_ID);
      expect(options).toContain(ASSIGNEE_USER_ID);
    }));

    it('should list the current user first', fakeAsync(() => {
      const env = new TestEnvironment({ currentUserId: CURRENT_USER_ID, knownAssigneeIds: [ASSIGNEE_USER_ID] });
      env.wait();

      const options = env.component.getOptions();

      expect(options[0]).toBe(CURRENT_USER_ID);
    }));

    it('should not duplicate the current user if they are also in knownAssigneeIds', fakeAsync(() => {
      const env = new TestEnvironment({
        currentUserId: CURRENT_USER_ID,
        knownAssigneeIds: [CURRENT_USER_ID, ASSIGNEE_USER_ID]
      });
      env.wait();

      const options = env.component.getOptions();

      expect(options.filter(id => id === CURRENT_USER_ID).length).toBe(1);
    }));

    it('should return only the current user when there are no known assignees', fakeAsync(() => {
      const env = new TestEnvironment({ currentUserId: CURRENT_USER_ID, knownAssigneeIds: [] });
      env.wait();

      const options = env.component.getOptions();

      expect(options).toEqual([CURRENT_USER_ID]);
    }));

    it('should return multiple known assignees after the current user', fakeAsync(() => {
      const env = new TestEnvironment({
        currentUserId: CURRENT_USER_ID,
        knownAssigneeIds: [ASSIGNEE_USER_ID, OTHER_USER_ID]
      });
      env.wait();

      const options = env.component.getOptions();

      expect(options).toEqual([CURRENT_USER_ID, ASSIGNEE_USER_ID, OTHER_USER_ID]);
    }));
  });

  /**
   * Test environment for OnboardingRequestAssigneeSelectComponent tests.
   * Uses a TestHostComponent to drive inputs and capture output.
   */
  class TestEnvironment {
    readonly host: TestHostComponent;
    readonly fixture: ComponentFixture<TestHostComponent>;
    readonly component: OnboardingRequestAssigneeSelectComponent;

    constructor({
      value = '',
      knownAssigneeIds = [],
      currentUserId
    }: {
      value?: string;
      knownAssigneeIds?: string[];
      currentUserId?: string;
    } = {}) {
      when(mockedUserService.currentUserId).thenReturn(CURRENT_USER_ID);

      this.fixture = TestBed.createComponent(TestHostComponent);
      this.host = this.fixture.componentInstance;
      this.host.value = value;
      this.host.knownAssigneeIds = knownAssigneeIds;
      this.host.currentUserId = currentUserId;
      this.component = this.fixture.debugElement.children[0]
        .componentInstance as OnboardingRequestAssigneeSelectComponent;
      this.fixture.detectChanges();
    }

    wait(): void {
      tick();
      this.fixture.detectChanges();
    }
  }
});
