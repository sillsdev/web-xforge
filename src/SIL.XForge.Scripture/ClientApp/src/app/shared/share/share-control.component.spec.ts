import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { flush } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { CheckingConfig, CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_DEFAULT_SHARE_ROLE, SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from './share-control.component';

const mockedProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedI18nService = mock(I18nService);
const mockedLocationService = mock(LocationService);
const mockedUserService = mock(UserService);

describe('ShareControlComponent', () => {
  configureTestingModule(() => ({
    declarations: [TestHostComponent],
    imports: [TestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), NoopAnimationsModule],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: LocationService, useMock: mockedLocationService },
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

  it('shareLink is for projectId and has specific key', fakeAsync(() => {
    const env = new TestEnvironment({ isLinkSharingEnabled: true, projectId: 'myProject1' });
    env.wait();
    verify(mockedProjectService.onlineGetLinkSharingKey('myProject1', anything())).once();
    expect(env.hostComponent.component.shareLink).toContain('myProject1?sharing=true&shareKey=linkSharing01');
    flush();
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
    expect(env.getTextFieldValue(env.emailTextField)).toEqual('unknown-address@example.com', 'test setup');
    env.click(env.sendButton);
    verify(mockedProjectService.onlineInvite(anything(), anything(), anything(), anything())).once();

    // Can not immediately request an invite to a blank email address
    expect(env.getTextFieldValue(env.emailTextField)).toEqual('', 'test setup');
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

  it('share link should be hidden if link sharing is turned off', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.shareLink).toBeNull();
    env.setCheckingShareLevel(CheckingShareLevel.Anyone);
    expect(env.shareLink).not.toBeNull();
  }));

  it('share link should not be shown when offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    env.setCheckingShareLevel(CheckingShareLevel.Anyone);
    expect(env.shareLink.nativeElement.value).toEqual('');
    expect(env.linkSharingOfflineMessage).not.toBeNull();
  }));

  it('clicking copy link icon should copy link to clipboard', fakeAsync(() => {
    const env = new TestEnvironment({ isLinkSharingEnabled: true, projectId: 'project123' });
    // Two waits are needed, otherwise the link text is not set by the time of the next expectation
    env.wait();
    env.wait();
    expect(env.shareLink.nativeElement.value).toEqual(
      'https://scriptureforge.org/projects/project123?sharing=true&shareKey=linkSharing01'
    );
    env.click(env.shareLinkCopyIcon);
    // TODO: figure out a way to check the clipboard data
    verify(mockedNoticeService.show(anything())).once();
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

  it('changing user role refreshes the share key', fakeAsync(() => {
    const env = new TestEnvironment({ isLinkSharingEnabled: true, projectId: 'myProject1' });
    env.wait();
    env.hostComponent.component.roleControl.setValue(SFProjectRole.Observer);
    env.wait();
    verify(mockedProjectService.onlineGetLinkSharingKey('myProject1', anything())).twice();
    expect().nothing();
    flush();
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
    expect(env.hostComponent.component.availableRolesInfo.length).toBe(2);
  }));

  it('default share role should be translation observer when checking is disabled', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user02', projectId: 'project01', checkingEnabled: false });
    env.wait();
    expect(env.hostComponent.component.roleControl.value).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
    expect(env.hostComponent.component.availableRolesInfo.length).toBe(1);
    expect(env.hostComponent.component.availableRolesInfo[0].role).toBe(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
  }));

  it('should hide link sharing if checking is unavailable', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    // Disable checking
    const checkingConfig: CheckingConfig = {
      checkingEnabled: false,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone,
      usersSeeEachOthersResponses: false
    };
    env.updateCheckingProperties(checkingConfig);
    env.wait();
    expect(env.shareLink).toBeNull();
    // Enable checking
    checkingConfig.checkingEnabled = true;
    env.updateCheckingProperties(checkingConfig);
    env.wait();
    expect(env.shareLink).not.toBeNull();
    // Disable link sharing
    checkingConfig.shareLevel = CheckingShareLevel.Specific;
    env.updateCheckingProperties(checkingConfig);
    env.wait();
    expect(env.shareLink).toBeNull();
  }));
});

@NgModule({
  imports: [BrowserModule, HttpClientTestingModule, RouterTestingModule, UICommonModule, TestTranslocoModule],
  declarations: [ShareControlComponent],
  exports: [ShareControlComponent]
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

  onInvited() {
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

  private _onlineStatus = new BehaviorSubject<boolean>(true);

  constructor(args: Partial<TestEnvironmentArgs> = {}) {
    const defaultArgs: Partial<TestEnvironmentArgs> = {
      projectId: 'project01',
      userId: 'user01',
      checkingEnabled: true
    };
    args = { ...defaultArgs, ...args };
    const shareLevel = args.isLinkSharingEnabled ? TranslateShareLevel.Anyone : TranslateShareLevel.Specific;
    this.realtimeService.addSnapshot(SFProjectDoc.COLLECTION, {
      id: args.projectId,
      data: {
        userRoles: {
          user01: SFProjectRole.CommunityChecker,
          user02: SFProjectRole.ParatextAdministrator,
          user03: SFProjectRole.Observer
        },
        translateConfig: { shareEnabled: true, shareLevel },
        checkingConfig: { checkingEnabled: args.checkingEnabled, shareEnabled: true, shareLevel }
      }
    });
    when(mockedProjectService.get(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );
    when(mockedPwaService.onlineStatus).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenCall(() => this._onlineStatus.getValue());
    when(mockedUserService.currentUserId).thenReturn(args.userId!);
    when(mockedProjectService.onlineGetLinkSharingKey(args.projectId!, anything())).thenResolve(
      args.isLinkSharingEnabled ? 'linkSharing01' : ''
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
    when(mockedLocationService.origin).thenReturn('https://scriptureforge.org');

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

  get linkSharingOfflineMessage(): DebugElement {
    return this.fetchElement('.invite-by-link .offline-text');
  }

  get emailSharingOfflineMessage(): DebugElement {
    return this.fetchElement('.invite-by-email .offline-text');
  }

  get roleField(): DebugElement {
    return this.fetchElement('#invitation-role');
  }

  get shareLink(): DebugElement {
    return this.fetchElement('#share-link input');
  }

  get shareLinkCopyIcon(): DebugElement {
    return this.fetchElement('#share-link-copy-icon');
  }

  set onlineStatus(value: boolean) {
    this._onlineStatus.next(value);
    this.wait();
  }

  get localeErrorText(): string {
    return this.elementText(this.fetchElement('mat-form-field mat-error'));
  }

  fetchElement(query: string) {
    return this.fixture.debugElement.query(By.css(query));
  }

  elementText(element: DebugElement): string {
    return element.nativeElement.textContent;
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    this.wait();
  }

  setTextFieldValue(element: HTMLElement | DebugElement, value: string) {
    if (element instanceof DebugElement) {
      element = element.nativeElement;
    }
    const inputElem = (element as HTMLElement).querySelector('input') as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.wait();
  }

  getTextFieldValue(element: HTMLElement | DebugElement) {
    if (element instanceof DebugElement) {
      element = element.nativeElement;
    }
    const inputElem = (element as HTMLElement).querySelector('input') as HTMLInputElement;
    return inputElem.value;
  }

  setInvitationLanguage(language: string) {
    this.component.localeControl.setValue(language);
    this.wait();
  }

  updateCheckingProperties(config: CheckingConfig): Promise<boolean> {
    const projectDoc: SFProjectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, 'project01');
    return projectDoc.submitJson0Op(op => op.set(p => p.checkingConfig, config));
  }

  setCheckingShareLevel(value: CheckingShareLevel): void {
    this.realtimeService
      .get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01')
      .submitJson0Op(op => op.set<CheckingShareLevel>(p => p.checkingConfig.shareLevel, value));
    this.wait();
  }

  wait(): void {
    flush();
    this.fixture.detectChanges();
  }
}
