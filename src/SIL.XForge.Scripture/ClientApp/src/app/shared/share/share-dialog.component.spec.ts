import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { FeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { UserDoc } from 'xforge-common/models/user-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_DEFAULT_SHARE_ROLE, SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareDialogComponent, ShareDialogData, ShareLinkType } from './share-dialog.component';

const mockedProjectService = mock(SFProjectService);
const mockedNavigator = mock(Navigator);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedLocationService = mock(LocationService);
const mockedUserService = mock(UserService);
const mockedFeatureFlagService = mock(FeatureFlagService);

enum TestUsers {
  CommunityChecker = 'user01',
  Admin = 'user02',
  Observer = 'user03'
}

describe('ShareDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NAVIGATOR, useMock: mockedNavigator },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: UserService, useMock: mockedUserService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService }
    ]
  }));

  let env: TestEnvironment;
  afterEach(fakeAsync(() => {
    if (env.closeButton != null) {
      env.clickElement(env.closeButton);
    }
    flush();
  }));

  it('shows share button when sharing API is supported', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.shareButton).not.toBeNull();
  }));

  it('hides share button when sharing API is not available', fakeAsync(() => {
    env = new TestEnvironment({ shareAPIEnabled: false });
    expect(env.shareButton).toBeNull();
  }));

  it('copy and share buttons disabled state changes when fetching share key', fakeAsync(() => {
    let shareKeyPromise: (value: PromiseLike<string> | string) => void;
    env = new TestEnvironment({ userId: TestUsers.Admin });
    expect(env.shareButton.disabled).toBe(false);
    expect(env.copyLinkButton.disabled).toBe(false);

    when(mockedProjectService.onlineGetLinkSharingKey(anything(), anything(), anything())).thenReturn(
      new Promise<string>(resolve => {
        shareKeyPromise = resolve;
      })
    );

    env.component.setRole(SFProjectRole.Reviewer);
    env.wait();
    expect(env.shareButton.disabled).toBe(true);
    expect(env.copyLinkButton.disabled).toBe(true);

    shareKeyPromise!('linkShareKey');
    env.wait();
    expect(env.shareButton.disabled).toBe(false);
    expect(env.copyLinkButton.disabled).toBe(false);
  }));

  it('shareLink is for projectId and has specific key', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'myProject1' });
    verify(mockedProjectService.onlineGetLinkSharingKey('myProject1', anything(), anything())).once();
    expect(env.component.sharableLink).toContain('/join/linkSharing01/en');
  }));

  it('does not allow sharing or copying link when offline', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.shareButton.disabled).toBe(false);
    expect(env.copyLinkButton.disabled).toBe(false);
    expect(env.linkSharingOfflineMessage).toBeNull();

    env.onlineStatus = false;
    expect(env.shareButton.disabled).toBe(true);
    expect(env.copyLinkButton.disabled).toBe(true);
    expect(env.linkSharingOfflineMessage).not.toBeNull();

    env.onlineStatus = true;
    expect(env.shareButton.disabled).toBe(false);
    expect(env.copyLinkButton.disabled).toBe(false);
    expect(env.linkSharingOfflineMessage).toBeNull();
  }));

  it('clicking copy link should copy link to clipboard', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'project123' });
    expect(env.clipboardText).toBeUndefined();
    env.copyLinkButton.click();
    env.wait();
    expect(env.clipboardText).toContain('/join/linkSharing01/en');
    verify(mockedNoticeService.show(anything())).once();
  }));

  it('clicking share link should open share control', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'project123' });
    env.shareButton.click();
    env.wait();
    const expectedShareData: ShareData = {
      title: "You've been invited to the project Share Project on Scripture Forge",
      url: 'https://scriptureforge.org/join/linkSharing01/en',
      text: "You've been invited to join the Share Project project on Scripture Forge.\r\nJust click the link below, choose how to log in, and you will be ready to start."
    };
    expect(env.shareData).toEqual(expectedShareData);
    expect().nothing();
  }));

  it('changing user role refreshes the share key', fakeAsync(() => {
    env = new TestEnvironment({
      userId: TestUsers.Admin
    });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(roles).toContain(SFProjectRole.Reviewer);
    env.component.setRole(SFProjectRole.Observer);
    env.wait();
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything())).twice();
    env.component.setRole(SFProjectRole.Reviewer);
    env.wait();
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything())).thrice();
  }));

  it('changing link type refreshes the share key', fakeAsync(() => {
    env = new TestEnvironment({
      userId: TestUsers.Admin
    });
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything())).once();
    env.component.setLinkType(ShareLinkType.Recipient);
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything())).twice();
    expect(env.component.shareLinkType).toEqual(ShareLinkType.Recipient);
  }));

  it('community checker users can only share the community checker role', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.CommunityChecker });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).not.toContain(SFProjectRole.Observer);
    expect(roles).not.toContain(SFProjectRole.Reviewer);
    expect(env.component.shareRole).toEqual(SFProjectRole.CommunityChecker);
    expect(env.canChangeInvitationRole).toBeFalse();
  }));

  it('observer users can only share the observer role when community checking is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Observer, checkingEnabled: false });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).not.toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(roles).not.toContain(SFProjectRole.Reviewer);
    expect(env.component.shareRole).toEqual(SFProjectRole.Observer);
    expect(env.canChangeInvitationRole).toBeFalse();
  }));

  it('observer users can only share the observer role and optionally the community checking role if enabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Observer, defaultRole: SFProjectRole.Observer });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(roles).not.toContain(SFProjectRole.Reviewer);
    expect(env.component.shareRole).toEqual(SFProjectRole.Observer);
    expect(env.canChangeInvitationRole).toBeTrue();
  }));

  it('admin users can share any role even when sharing is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingShareEnabled: false, translateShareEnabled: false });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(roles).toContain(SFProjectRole.Reviewer);
  }));

  it('admin users can share any role except community checking if it is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingEnabled: false, translateShareEnabled: false });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).not.toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(roles).toContain(SFProjectRole.Reviewer);
  }));

  it('admin users can not share with anyone if sharing is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingEnabled: false, translateShareEnabled: false });
    expect(env.component.shareRole).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
    expect(env.canChangeLinkUsage).toBeFalse();

    env.component.setRole(SFProjectRole.CommunityChecker);
    env.wait();
    expect(env.component.shareRole).toEqual(SFProjectRole.CommunityChecker);
    expect(env.canChangeLinkUsage).toBeFalse();
  }));

  it('admin users can share with anyone if sharing is enabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    expect(env.component.shareRole).toEqual(SFProjectRole.CommunityChecker);
    expect(env.canChangeLinkUsage).toBeTrue();

    env.component.setRole(SFProjectRole.Observer);
    env.wait();
    expect(env.component.shareRole).toEqual(SFProjectRole.Observer);
    expect(env.canChangeLinkUsage).toBeTrue();
  }));

  it('default role can be set', fakeAsync(() => {
    env = new TestEnvironment({ defaultRole: SF_DEFAULT_TRANSLATE_SHARE_ROLE, userId: TestUsers.Observer });
    expect(env.component.shareRole).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
  }));

  it('default share role should be community checker when community checking is enabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    expect(env.component.shareRole).toEqual(SF_DEFAULT_SHARE_ROLE);
    expect(env.component.availableRoles.length).toBe(3);
  }));

  it('default share role should be translation observer when checking is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingEnabled: false });
    expect(env.component.shareRole).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
    expect(env.component.availableRoles.length).toBe(2);
  }));

  it('should hide link type if not administrator', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.configLinkUsage).toBeNull();
  }));

  it('should show link type for administrator', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    expect(env.configLinkUsage).toBeTruthy();
  }));

  it('should close dialog if project settings change and sharing becomes disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.CommunityChecker, translateShareEnabled: false });
    expect(env.isDialogOpen).toBeTrue();
    env.disableCheckingSharing();
    expect(env.isDialogOpen).toBeFalse();
  }));

  it('should remove checking role as an option if remote project settings change', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    let roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(env.canChangeLinkUsage).toBeTrue();

    env.disableCheckingSharing();

    roles = env.component.availableRoles;
    expect(roles).not.toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Observer);
    expect(env.canChangeLinkUsage).toBeFalse();
  }));
});

interface TestEnvironmentArgs {
  projectId?: string;
  defaultRole?: SFProjectRole;
  userId?: string;
  checkingEnabled?: boolean;
  checkingShareEnabled?: boolean;
  shareAPIEnabled?: boolean;
  translateShareEnabled?: boolean;
}

@Directive({
  // es lint complains that a directive should be used as an attribute
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'viewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<viewContainerDirective></viewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule, NoopAnimationsModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent]
})
class DialogTestModule {}

class TestEnvironment {
  isDialogOpen = true;
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: ShareDialogComponent;
  readonly dialogRef: MatDialogRef<ShareDialogComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private _onlineStatus = new BehaviorSubject<boolean>(true);
  private _clipboardText?: string;
  private _shareData?: ShareData;
  private share = (shareData?: ShareData | undefined): Promise<void> => {
    this._shareData = shareData;
    return new Promise<void>(r => r);
  };

  constructor({
    projectId = 'project01',
    defaultRole = SFProjectRole.CommunityChecker,
    userId = TestUsers.CommunityChecker,
    checkingEnabled = true,
    checkingShareEnabled = true,
    shareAPIEnabled = true,
    translateShareEnabled = true
  }: TestEnvironmentArgs = {}) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
      id: projectId,
      data: {
        name: 'Share Project',
        userRoles: {
          user01: SFProjectRole.CommunityChecker,
          user02: SFProjectRole.ParatextAdministrator,
          user03: SFProjectRole.Observer
        },
        translateConfig: { shareEnabled: translateShareEnabled },
        checkingConfig: { checkingEnabled: checkingEnabled, shareEnabled: checkingShareEnabled }
      }
    });
    if (shareAPIEnabled) {
      when(mockedNavigator.share).thenReturn(this.share);
    } else {
      when(mockedNavigator.share).thenReturn(undefined as any);
    }
    const env = this;
    when(mockedNavigator.clipboard).thenReturn({
      writeText(data: string): Promise<void> {
        env._clipboardText = data;
        return Promise.resolve(undefined);
      }
    } as Clipboard);
    when(mockedProjectService.getProfile(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, projectId)
    );
    when(mockedPwaService.onlineStatus$).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenCall(() => this._onlineStatus.getValue());
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenResolve({ data: { displayName: 'name' } } as UserDoc);
    when(mockedProjectService.onlineGetLinkSharingKey(projectId, anything(), anything())).thenResolve(
      checkingShareEnabled || translateShareEnabled ? 'linkSharing01' : ''
    );
    when(mockedProjectService.generateSharingUrl(anything(), anything())).thenCall(
      () =>
        `https://scriptureforge.org/join/${(this.component as any).linkSharingKey}/${
          this.component.shareLocaleCode.canonicalTag
        }`
    );
    when(mockedProjectService.isProjectAdmin(projectId, TestUsers.Admin)).thenResolve(true);
    when(mockedFeatureFlagService.allowAddingNotes).thenReturn({ enabled: true } as FeatureFlag);
    when(mockedFeatureFlagService.showNonPublishedLocalizations).thenReturn({ enabled: true } as FeatureFlag);

    const config: MatDialogConfig<ShareDialogData> = {
      data: {
        projectId,
        defaultRole
      }
    };
    this.dialogRef = TestBed.inject(MatDialog).open(ShareDialogComponent, config);
    this.dialogRef
      .afterClosed()
      .toPromise()
      .then(() => {
        this.isDialogOpen = false;
      });
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
    this.wait();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get canChangeLinkUsage(): boolean {
    return this.configLinkUsage.querySelector('a') !== null;
  }

  get canChangeInvitationRole(): boolean {
    return this.configInvitationRole.querySelector('a') !== null;
  }

  get clipboardText(): string | undefined {
    return this._clipboardText;
  }

  get closeButton(): HTMLElement {
    return this.fetchElement('button[mat-dialog-close]');
  }

  get configLinkUsage(): HTMLElement {
    return this.fetchElement('.configuration-link-type');
  }

  get configInvitationRole(): HTMLElement {
    return this.fetchElement('.configuration-invitation-role');
  }

  get copyLinkButton(): HTMLButtonElement {
    return this.fetchElement('#copy-btn') as HTMLButtonElement;
  }

  get shareButton(): HTMLButtonElement {
    return this.fetchElement('#share-btn') as HTMLButtonElement;
  }

  get shareData(): ShareData | undefined {
    return this._shareData;
  }

  get linkSharingOfflineMessage(): HTMLElement {
    return this.fetchElement('.offline-text');
  }

  set onlineStatus(value: boolean) {
    this._onlineStatus.next(value);
    this.wait();
  }

  clickElement(element: HTMLElement) {
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  disableCheckingSharing(): void {
    const projectDoc: SFProjectProfileDoc = this.realtimeService.get(SFProjectProfileDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(
      op =>
        op.set(p => p.checkingConfig, {
          checkingEnabled: false,
          shareEnabled: false,
          usersSeeEachOthersResponses: false,
          answerExportMethod: CheckingAnswerExport.MarkedForExport
        }),
      false
    );
    tick();
    this.wait();
  }

  fetchElement(query: string): HTMLElement {
    return this.overlayContainerElement.querySelector(query) as HTMLElement;
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    this.wait();
  }

  wait(): void {
    flush();
    this.fixture.detectChanges();
  }
}
