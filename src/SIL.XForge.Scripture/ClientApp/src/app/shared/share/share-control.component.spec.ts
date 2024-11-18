import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { CheckingConfig } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_DEFAULT_SHARE_ROLE, SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../shared.module';
import { ShareControlComponent } from './share-control.component';

const mockedProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedUserService = mock(UserService);

describe('ShareControlComponent', () => {
  configureTestingModule(() => ({
    declarations: [TestHostComponent],
    imports: [
      TestModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      SharedModule
    ],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('shows Send button when link sharing enabled', () => {
    const env = new TestEnvironment({ isLinkSharingEnabled: true });
    expect(env.sendButton).not.toBeNull();
  });

  it('shows Send button when link sharing is disabled', () => {
    const env = new TestEnvironment({ isLinkSharingEnabled: false });
    expect(env.sendButton).not.toBeNull();
  });

  it('Send button starts off saying Send', () => {
    const env = new TestEnvironment();
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
  });

  it('Send button says Send for unknown email; changes to Resend when email is already invitee', fakeAsync(() => {
    const env = new TestEnvironment();

    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Resend');

    // And back to Send
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
  }));

  it('Resend button changes back to Send after sending', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    env.setInvitationLanguage('en');
    expect(env.elementText(env.sendButton).trim()).toEqual('Resend');
    env.click(env.sendButton);
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
  }));

  it('Server not queried to check if email is already invited until email address is valid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unkno');
    env.setTextFieldValue(env.emailTextField, 'unknown-addres');
    env.setTextFieldValue(env.emailTextField, 'unknown-address@exa');
    verify(mockedProjectService.onlineIsAlreadyInvited(anything(), anything())).never();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    verify(mockedProjectService.onlineIsAlreadyInvited(anything(), anything())).once();
    expect().nothing();
  }));

  it('Message shown for not-yet-known invitee', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    env.setInvitationLanguage('en');
    env.click(env.sendButton);
    verify(mockedNoticeService.show(anything())).once();
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();
    expect(capture(mockedNoticeService.show).last()[0]).toContain('email has been sent');
  }));

  it('Already-member message shown if invitee is already project member', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already-project-member@example.com');
    env.setInvitationLanguage('en');
    env.click(env.sendButton);
    verify(mockedNoticeService.show(anything())).once();
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();

    expect(capture(mockedNoticeService.show).last()[0]).toContain('is already');
  }));

  it('Does not crash inviting blank email address if click Send twice', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setInvitationLanguage('en');

    // Cannot invite blank or invalid email address
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).never();
    env.setTextFieldValue(env.emailTextField, '');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).never();
    env.setTextFieldValue(env.emailTextField, 'unknown-addre');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).never();

    // Invite
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.getTextFieldValue(env.emailTextField)).withContext('test setup').toEqual('unknown-address@example.com');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();

    // Can not immediately request an invite to a blank email address
    expect(env.getTextFieldValue(env.emailTextField)).withContext('test setup').toEqual('');
    env.click(env.sendButton);
    // Not called a second time
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();

    // Invite
    env.setTextFieldValue(env.emailTextField, 'unknown-address2@example.com');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).twice();
  }));

  it('Output event fires after invitation is sent', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    env.setInvitationLanguage('en');
    expect(env.hostComponent.invitedCount).toEqual(0);
    env.click(env.sendButton);
    expect(env.hostComponent.invitedCount).toEqual(1);
  }));

  it('Does not allow sending invites when offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component.sendInviteForm.enabled).toEqual(true);
    expect((env.inputElement.nativeElement as HTMLInputElement).disabled).toEqual(false);
    expect(env.emailSharingOfflineMessage).toBeNull();
    env.onlineStatus = false;
    expect(env.component.sendInviteForm.enabled).toEqual(false);
    expect((env.inputElement.nativeElement as HTMLInputElement).disabled).toEqual(true);
    expect(env.emailSharingOfflineMessage).not.toBeNull();
  }));

  it('should require selecting a language before sending the invitation', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).never();
    expect(env.localeErrorText).toContain('Select a language for the invitation email');
    env.setInvitationLanguage('en');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();
  }));

  it('contains the appropriate role options', fakeAsync(() => {
    const env = new TestEnvironment({
      projectId: 'project01',
      userId: 'user02',
      isLinkSharingEnabled: true
    });
    env.wait();
    expect(env.component.availableRoles).toContain(SFProjectRole.CommunityChecker);
    expect(env.component.availableRoles).toContain(SFProjectRole.Viewer);
    expect(env.component.availableRoles).toContain(SFProjectRole.Commenter);
  }));

  it('role should be visible for administrators', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user02', projectId: 'project01' });
    env.wait();
    expect(env.roleField).toBeTruthy();
  }));

  it('default role can be set', fakeAsync(() => {
    const env = new TestEnvironment({ defaultRole: SF_DEFAULT_TRANSLATE_SHARE_ROLE, userId: 'user03' });
    env.wait();
    expect(env.hostComponent.component.roleControl.value).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
  }));

  it('default share role should be community checker when community checking is enabled', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user02', projectId: 'project01' });
    env.wait();
    expect(env.hostComponent.component.roleControl.value).toEqual(SF_DEFAULT_SHARE_ROLE);
    expect(env.hostComponent.component.availableRoles.length).toBe(3);
  }));

  it('default share role should be translation observer when checking is disabled', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user02', projectId: 'project01', checkingEnabled: false });
    env.wait();
    expect(env.hostComponent.component.roleControl.value).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
    expect(env.hostComponent.component.availableRoles.length).toBe(2);
  }));

  it('should require setting the email before sending an invite', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setInvitationLanguage('en');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).never();
    expect(env.fetchElement('#email mat-error').nativeElement.textContent).toContain('Email address is invalid');
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();
  }));

  it('should require that the entered email is valid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setInvitationLanguage('en');
    env.setTextFieldValue(env.emailTextField, 'abc');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).never();
    expect(env.fetchElement('#email mat-error').nativeElement.textContent).toContain('Email address is invalid');
  }));

  it('should not show required errors immediately after submitting', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    env.setInvitationLanguage('en');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();
    expect(env.fetchElement('#email mat-error')).toBeNull();
  }));
});

@NgModule({
  imports: [BrowserModule, RouterModule.forRoot([]), UICommonModule, TestTranslocoModule],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
class TestModule {}

@Component({
  template: `
    <app-share-control [projectId]="projectId" [defaultRole]="defaultRole" (invited)="onInvited()"></app-share-control>
  `
})
class TestHostComponent {
  @ViewChild(ShareControlComponent) component!: ShareControlComponent;
  projectId = 'project01';
  invitedCount = 0;
  defaultRole?: SFProjectRole | undefined;

  onInvited(): void {
    this.invitedCount++;
  }
}

interface TestEnvironmentArgs {
  isLinkSharingEnabled: boolean;
  projectId: string;
  defaultRole: SFProjectRole;
  userId: string;
  checkingEnabled: boolean;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<TestHostComponent>;
  readonly hostComponent: TestHostComponent;
  readonly component: ShareControlComponent;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  constructor(args: Partial<TestEnvironmentArgs> = {}) {
    const defaultArgs: Partial<TestEnvironmentArgs> = {
      projectId: 'project01',
      userId: 'user01',
      checkingEnabled: true
    };
    args = { ...defaultArgs, ...args };
    const permissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)];
    this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
      id: args.projectId,
      data: {
        userRoles: {
          user01: SFProjectRole.CommunityChecker,
          user02: SFProjectRole.ParatextAdministrator,
          user03: SFProjectRole.Viewer
        },
        checkingConfig: { checkingEnabled: args.checkingEnabled },
        rolePermissions: {
          sf_community_checker: permissions,
          sf_observer: permissions
        }
      }
    });
    when(mockedProjectService.getProfile(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, projectId)
    );
    when(mockedUserService.currentUserId).thenReturn(args.userId!);
    when(mockedProjectService.onlineGetLinkSharingKey(args.projectId!, anything(), anything(), anything())).thenResolve(
      args.isLinkSharingEnabled ? 'linkSharing01' : ''
    );
    when(mockedProjectService.generateSharingUrl(anything())).thenCall(
      () => `/join/${(this.component as any).linkSharingKey}`
    );
    when(mockedProjectService.isProjectAdmin('project01', 'user02')).thenResolve(true);
    this.fixture = TestBed.createComponent(TestHostComponent);
    this.fixture.componentInstance.projectId = args.projectId!;
    this.fixture.componentInstance.defaultRole = args.defaultRole;
    this.fixture.detectChanges();
    this.component = this.fixture.componentInstance.component;
    this.hostComponent = this.fixture.componentInstance;
    this.hostComponent.projectId = args.projectId || 'project01';

    when(
      mockedProjectService.onlineInvite(anything(), 'unknown-address@example.com', anything(), anything())
    ).thenResolve(undefined);
    when(
      mockedProjectService.onlineInvite(anything(), 'already-project-member@example.com', anything(), anything())
    ).thenResolve(this.component.alreadyProjectMemberResponse);
    when(mockedProjectService.onlineIsAlreadyInvited(anything(), 'unknown-address@example.com')).thenResolve(false);
    when(mockedProjectService.onlineIsAlreadyInvited(anything(), 'already@example.com')).thenResolve(true);

    this.fixture.detectChanges();
  }

  get sendButton(): DebugElement {
    return this.fetchElement('#send-btn');
  }

  get emailTextField(): DebugElement {
    return this.fetchElement('#email');
  }

  get inputElement(): DebugElement {
    return this.emailTextField.query(By.css('input[type="email"]'));
  }

  get emailSharingOfflineMessage(): DebugElement {
    return this.fetchElement('.offline-text');
  }

  get roleField(): DebugElement {
    return this.fetchElement('#invitation-role');
  }

  set onlineStatus(value: boolean) {
    this.testOnlineStatusService.setIsOnline(value);
    this.wait();
  }

  get localeErrorText(): string {
    return this.elementText(this.fetchElement('mat-form-field mat-error'));
  }

  fetchElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }

  elementText(element: DebugElement): string {
    return element.nativeElement.textContent;
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    this.wait();
  }

  setTextFieldValue(element: HTMLElement | DebugElement, value: string): void {
    if (element instanceof DebugElement) {
      element = element.nativeElement;
    }
    const inputElem = (element as HTMLElement).querySelector('input') as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.wait();
  }

  getTextFieldValue(element: HTMLElement | DebugElement): string {
    if (element instanceof DebugElement) {
      element = element.nativeElement;
    }
    const inputElem = (element as HTMLElement).querySelector('input') as HTMLInputElement;
    return inputElem.value;
  }

  setInvitationLanguage(language: string): void {
    this.component.localeControl.setValue(language);
    this.wait();
  }

  updateCheckingProperties(config: CheckingConfig): Promise<boolean> {
    const projectDoc: SFProjectProfileDoc = this.realtimeService.get(SFProjectProfileDoc.COLLECTION, 'project01');
    return projectDoc.submitJson0Op(op => op.set(p => p.checkingConfig, config));
  }

  wait(): void {
    flush();
    this.fixture.detectChanges();
    flush();
  }
}
