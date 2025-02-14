import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { firstValueFrom } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_DEFAULT_SHARE_ROLE, SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareDialogComponent, ShareDialogData, ShareLinkType } from './share-dialog.component';

const mockedProjectService = mock(SFProjectService);
const mockedNavigator = mock(Navigator);
const mockedNoticeService = mock(NoticeService);
const mockedUserService = mock(UserService);
const mockedFeatureFlagService = mock(FeatureFlagService);

enum TestUsers {
  CommunityChecker = 'user01',
  Admin = 'user02',
  Viewer = 'user03'
}

describe('ShareDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestOnlineStatusModule.forRoot(), TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NAVIGATOR, useMock: mockedNavigator },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: UserService, useMock: mockedUserService }
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

    when(mockedProjectService.onlineGetLinkSharingKey(anything(), anything(), anything(), anything())).thenReturn(
      new Promise<string>(resolve => {
        shareKeyPromise = resolve;
      })
    );

    env.component.setRole(SFProjectRole.Commenter);
    env.wait();
    expect(env.shareButton.disabled).toBe(true);
    expect(env.copyLinkButton.disabled).toBe(true);

    shareKeyPromise!('linkShareKey');
    env.wait();
    expect(env.shareButton.disabled).toBe(false);
    expect(env.copyLinkButton.disabled).toBe(false);
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
    env.component.setLocale(env.locale);
    env.copyLinkButton.click();
    env.wait();
    expect(env.clipboardText).toContain('/join/linkSharing01/en');
    verify(mockedNoticeService.show(anything())).once();
  }));

  it('clicking share link should open share control', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'project123' });
    env.component.setLocale(env.locale);
    env.shareButton.click();
    env.wait();
    const expectedShareData: ShareData = {
      title: "You've been invited to the project Share Project on Scripture Forge",
      url: 'https://scriptureforge.org/join/linkSharing01/en',
      text: "You've been invited to join the Share Project project on Scripture Forge.\nJust click the link below, choose how to log in, and you will be ready to start."
    };
    expect(env.shareData).toEqual(expectedShareData);
  }));

  it('has no language selected by default', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'project123' });
    expect(env.component.shareLocaleCode).toBeUndefined();
  }));

  it('will not allow copying when no language is selected', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'project123' });
    expect(env.clipboardText).toBeUndefined();
    env.copyLinkButton.click();
    env.wait();
    expect(env.clipboardText).toBeUndefined();
    expect(env.component.error).toBeDefined();
  }));

  it('will not allow sharing when no language is selected', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'project123' });
    expect(env.clipboardText).toBeUndefined();
    env.shareButton.click();
    env.wait();
    expect(env.clipboardText).toBeUndefined();
    expect(env.component.error).toBeDefined();
  }));

  it('changing user role refreshes the share key', fakeAsync(() => {
    env = new TestEnvironment({
      userId: TestUsers.Admin
    });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Viewer);
    expect(roles).toContain(SFProjectRole.Commenter);
    env.component.setRole(SFProjectRole.Viewer);
    env.wait();
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything(), anything())).twice();
    env.component.setRole(SFProjectRole.Commenter);
    env.wait();
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything(), anything())).thrice();
  }));

  it('changing link type refreshes the share key', fakeAsync(() => {
    env = new TestEnvironment({
      userId: TestUsers.Admin
    });
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything(), anything())).once();
    env.component.setLinkType(ShareLinkType.Recipient);
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything(), anything())).twice();
    expect(env.component.shareLinkType).toEqual(ShareLinkType.Recipient);
  }));

  it('requests the correct number of days for link expiry', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything(), 14)).once();

    env.component.setLinkExpiration('days_ninety');
    verify(mockedProjectService.onlineGetLinkSharingKey('project01', anything(), anything(), 90)).once();
    expect(env.component.shareExpiration).toEqual(90);
  }));

  it('community checker users can only share the community checker role', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.CommunityChecker });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).not.toContain(SFProjectRole.Viewer);
    expect(roles).not.toContain(SFProjectRole.Commenter);
    expect(env.component.shareRole).toEqual(SFProjectRole.CommunityChecker);
    expect(env.canChangeInvitationRole).toBe(false);
  }));

  it('viewer users can only share the viewer role', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Viewer, defaultRole: SFProjectRole.Viewer });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).not.toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Viewer);
    expect(roles).not.toContain(SFProjectRole.Commenter);
    expect(env.component.shareRole).toEqual(SFProjectRole.Viewer);
    expect(env.canChangeInvitationRole).toBe(false);
  }));

  it('admin users can share any role even when sharing is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingShareEnabled: false, translateShareEnabled: false });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Viewer);
    expect(roles).toContain(SFProjectRole.Commenter);
  }));

  it('admin users can share any role except community checking if it is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingEnabled: false, translateShareEnabled: false });
    const roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).not.toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Viewer);
    expect(roles).toContain(SFProjectRole.Commenter);
  }));

  it('admin users can share with anyone even when sharing is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingEnabled: false, translateShareEnabled: false });
    expect(env.component.shareRole).toEqual(SF_DEFAULT_TRANSLATE_SHARE_ROLE);
    expect(env.canChangeLinkUsage).toBe(true);

    env.component.setRole(SFProjectRole.CommunityChecker);
    env.wait();
    expect(env.component.shareRole).toEqual(SFProjectRole.CommunityChecker);
    expect(env.canChangeLinkUsage).toBe(true);
  }));

  it('admin users can share with anyone if sharing is enabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    expect(env.component.shareRole).toEqual(SFProjectRole.CommunityChecker);
    expect(env.canChangeLinkUsage).toBe(true);

    env.component.setRole(SFProjectRole.Viewer);
    env.wait();
    expect(env.component.shareRole).toEqual(SFProjectRole.Viewer);
    expect(env.canChangeLinkUsage).toBe(true);
  }));

  it('admin users can share with single recipient if sharing is enabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    expect(env.canChangeLinkUsage).toBe(true);
  }));

  it('admin users can share with single recipient if sharing is disabled', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin, checkingEnabled: false, translateShareEnabled: false });
    expect(env.canChangeLinkUsage).toBe(true);
  }));

  it('default role can be set', fakeAsync(() => {
    env = new TestEnvironment({ defaultRole: SF_DEFAULT_TRANSLATE_SHARE_ROLE, userId: TestUsers.Viewer });
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
    expect(env.isDialogOpen).toBe(true);
    env.disableCheckingSharing();
    expect(env.isDialogOpen).toBe(false);
  }));

  it('should remove checking role as an option if remote project settings change', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    let roles: SFProjectRole[] = env.component.availableRoles;
    expect(roles).toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Viewer);
    expect(env.canChangeLinkUsage).toBe(true);

    env.disableCheckingSharing();

    roles = env.component.availableRoles;
    expect(roles).not.toContain(SFProjectRole.CommunityChecker);
    expect(roles).toContain(SFProjectRole.Viewer);
    expect(env.canChangeLinkUsage).toBe(true);
  }));

  it('shareLink is for projectId and has specific key', fakeAsync(() => {
    env = new TestEnvironment({ projectId: 'myProject1' });
    env.component.setLocale(env.locale);
    env.clickElement(env.copyLinkButton);

    verify(mockedProjectService.onlineGetLinkSharingKey('myProject1', anything(), anything(), anything())).once();
    expect(env.component.shareableLink).toContain('/join/linkSharing01/en');
  }));

  it('should reserve sharing key for recipient only links', fakeAsync(() => {
    env = new TestEnvironment({ userId: TestUsers.Admin });
    env.component.shareLinkType = ShareLinkType.Recipient;
    verify(mockedProjectService.onlineGetLinkSharingKey(anything(), anything(), anything(), anything())).once();
    verify(mockedProjectService.onlineReserveLinkSharingKey(anything(), anything())).never();
    env.component.setLocale(env.locale);

    env.clickElement(env.copyLinkButton);
    verify(mockedProjectService.onlineGetLinkSharingKey(anything(), anything(), anything(), anything())).twice();
    verify(mockedProjectService.onlineReserveLinkSharingKey(anything(), anything())).once();

    env.clickElement(env.shareButton);
    verify(mockedProjectService.onlineGetLinkSharingKey(anything(), anything(), anything(), anything())).thrice();
    verify(mockedProjectService.onlineReserveLinkSharingKey(anything(), anything())).twice();
    expect(env.component.shareableLink).toContain('/join/linkSharing01/en');
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

@NgModule({
  imports: [TestTranslocoModule]
})
class DialogTestModule {}

class TestEnvironment {
  isDialogOpen = true;
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: ShareDialogComponent;
  readonly dialogRef: MatDialogRef<ShareDialogComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly locale: Locale;
  private _clipboardText?: string;
  private _shareData?: ShareData;
  private share = (shareData?: ShareData | undefined): Promise<void> => {
    this._shareData = shareData;
    return Promise.resolve();
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
    const permissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)];
    this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
      id: projectId,
      data: {
        name: 'Share Project',
        userRoles: {
          user01: SFProjectRole.CommunityChecker,
          user02: SFProjectRole.ParatextAdministrator,
          user03: SFProjectRole.Viewer
        },
        checkingConfig: { checkingEnabled: checkingEnabled },
        rolePermissions: {
          sf_community_checker: checkingShareEnabled ? permissions : [],
          sf_observer: translateShareEnabled ? permissions : []
        }
      }
    });
    const locale = mock<Locale>();
    when(locale.canonicalTag).thenReturn('en');
    this.locale = instance(locale);
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
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenResolve({ data: createTestUser() } as UserDoc);
    when(mockedProjectService.onlineGetLinkSharingKey(projectId, anything(), anything(), anything())).thenResolve(
      checkingShareEnabled || translateShareEnabled ? 'linkSharing01' : ''
    );
    when(mockedProjectService.onlineReserveLinkSharingKey(anything(), anything())).thenResolve();
    when(mockedProjectService.generateSharingUrl(anything(), anything())).thenCall(
      () =>
        `https://scriptureforge.org/join/${(this.component as any).linkSharingKey}/${
          this.component.shareLocaleCode!.canonicalTag
        }`
    );
    when(mockedProjectService.isProjectAdmin(projectId, TestUsers.Admin)).thenResolve(true);
    when(mockedFeatureFlagService.showNonPublishedLocalizations).thenReturn(createTestFeatureFlag(true));

    const config: MatDialogConfig<ShareDialogData> = {
      data: {
        projectId,
        defaultRole
      }
    };
    this.dialogRef = TestBed.inject(MatDialog).open(ShareDialogComponent, config);
    firstValueFrom(this.dialogRef.afterClosed()).then(() => {
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
    return this.fetchElement('app-notice[type="error"]');
  }

  set onlineStatus(value: boolean) {
    this.testOnlineStatusService.setIsOnline(value);
    this.wait();
  }

  clickElement(element: HTMLElement): void {
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
