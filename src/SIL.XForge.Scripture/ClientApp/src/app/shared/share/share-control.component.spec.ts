import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { flush } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
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
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from './share-control.component';

const mockedProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedI18nService = mock(I18nService);
const mockedLocationService = mock(LocationService);

describe('ShareControlComponent', () => {
  configureTestingModule(() => ({
    declarations: [TestHostComponent],
    imports: [TestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), NoopAnimationsModule],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: LocationService, useMock: mockedLocationService }
    ]
  }));

  it('shows Send button when link sharing enabled', () => {
    const env = new TestEnvironment(true);
    expect(env.sendButton).not.toBeNull();
  });

  it('shows Send button when link sharing is disabled', () => {
    const env = new TestEnvironment(false);
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
    const env = new TestEnvironment(true, 'myProject1');
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
    env.hostComponent.isLinkSharingEnabled = true;
    env.wait();
    expect(env.shareLink).not.toBeNull();
  }));

  it('share link should not be shown when offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    env.hostComponent.isLinkSharingEnabled = true;
    env.wait();
    expect(env.shareLink.nativeElement.value).toEqual('');
    expect(env.linkSharingOfflineMessage).not.toBeNull();
  }));

  it('clicking copy link icon should copy link to clipboard', fakeAsync(() => {
    const env = new TestEnvironment(true, 'project123');
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
});

@NgModule({
  imports: [BrowserModule, HttpClientTestingModule, RouterTestingModule, UICommonModule, TestTranslocoModule],
  declarations: [ShareControlComponent],
  exports: [ShareControlComponent]
})
class TestModule {}

@Component({
  template: `
    <app-share-control
      [projectId]="projectId"
      [isLinkSharingEnabled]="isLinkSharingEnabled"
      (invited)="onInvited()"
    ></app-share-control>
  `
})
class TestHostComponent {
  @ViewChild(ShareControlComponent) component!: ShareControlComponent;
  projectId = '';
  isLinkSharingEnabled = false;
  invitedCount = 0;

  onInvited() {
    this.invitedCount++;
  }
}

class TestEnvironment {
  readonly fixture: ComponentFixture<TestHostComponent>;
  readonly hostComponent: TestHostComponent;
  readonly component: ShareControlComponent;
  private _onlineStatus = new BehaviorSubject<boolean>(true);

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(isLinkSharingEnabled?: boolean, projectId: string = 'project123') {
    when(mockedPwaService.onlineStatus).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenCall(() => this._onlineStatus.getValue());
    when(mockedProjectService.onlineGetLinkSharingKey(projectId, anything())).thenResolve(
      isLinkSharingEnabled ? 'linkSharing01' : ''
    );
    this.fixture = TestBed.createComponent(TestHostComponent);
    this.fixture.detectChanges();
    this.component = this.fixture.componentInstance.component;
    this.hostComponent = this.fixture.componentInstance;

    this.fixture.componentInstance.projectId = projectId;
    this.fixture.componentInstance.isLinkSharingEnabled =
      isLinkSharingEnabled === undefined ? false : isLinkSharingEnabled;

    this.realtimeService.addSnapshot(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: {}
    });
    when(mockedProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
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

  wait(): void {
    flush();
    this.fixture.detectChanges();
  }
}
