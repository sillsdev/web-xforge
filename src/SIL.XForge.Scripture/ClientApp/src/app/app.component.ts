import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import Bugsnag from '@bugsnag/js';
import { translate } from '@ngneat/transloco';
import { cloneDeep } from 'lodash-es';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { AuthType, User, getAuthType } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { Observable, Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { FeatureFlagsDialogComponent } from 'xforge-common/feature-flags/feature-flags-dialog.component';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { Breakpoint, MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN, PwaService } from 'xforge-common/pwa.service';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { UserService } from 'xforge-common/user.service';
import { issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import versionData from '../../../version.json';
import { environment } from '../environments/environment';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { roleCanAccessTranslate } from './core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from './core/models/sf-project-user-config-doc';
import { SFProjectService } from './core/sf-project.service';
import { checkAppAccess } from './shared/utils';

declare function gtag(...args: any): void;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  version: string = versionData.version;
  issueEmail: string = environment.issueEmail;
  isAppOnline: boolean = false;
  isExpanded: boolean = false;
  versionNumberClickCount = 0;

  hasUpdate: boolean = false;

  private currentUserDoc?: UserDoc;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private isLoggedInUserAnonymous: boolean = false;
  private _selectedProjectDoc?: SFProjectProfileDoc;
  private selectedProjectDeleteSub?: Subscription;
  private permissionsChangedSub?: Subscription;
  private _isDrawerPermanent: boolean = true;

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly dialogService: DialogService,
    private readonly fileService: FileService,
    private readonly reportingService: ErrorReportingService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly locationService: LocationService,
    private readonly breakpointObserver: BreakpointObserver,
    private readonly breakpointService: MediaBreakpointService,
    readonly noticeService: NoticeService,
    readonly i18n: I18nService,
    readonly urls: ExternalUrlService,
    readonly featureFlags: FeatureFlagService,
    private readonly pwaService: PwaService,
    onlineStatusService: OnlineStatusService
  ) {
    super(noticeService);
    this.subscribe(
      this.breakpointObserver.observe(this.breakpointService.width('>', Breakpoint.LG)),
      (value: BreakpointState) => (this.isDrawerPermanent = value.matches)
    );

    // Check full online status changes
    this.isAppOnline = onlineStatusService.isOnline;
    this.subscribe(onlineStatusService.onlineStatus$, status => {
      if (status !== this.isAppOnline) {
        this.isAppOnline = status;
        this.checkDeviceStorage();
      }
    });

    // Check browser online status to allow checks with Auth0
    this.subscribe(onlineStatusService.onlineBrowserStatus$, status => {
      // Check authentication when coming back online
      // This is also run on first load when the websocket connects for the first time
      if (status && !this.isAppLoading) {
        this.authService.checkOnlineAuth();
      }
    });

    this.subscribe(pwaService.hasUpdate$, () => (this.hasUpdate = true));

    // Google Analytics - send data at end of navigation so we get data inside the SPA client-side routing
    if (environment.releaseStage === 'live') {
      const navEndEvent$ = router.events.pipe(
        filter(e => e instanceof NavigationEnd),
        map(e => e as NavigationEnd)
      );
      this.subscribe(navEndEvent$, e => {
        if (this.isAppOnline) {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          gtag('config', 'UA-22170471-15', { page_path: e.urlAfterRedirects });
        }
      });
    }
  }

  get canInstallOnDevice$(): Observable<boolean> {
    return this.pwaService.canInstall$;
  }

  get showInstallIconOnAvatar$(): Observable<boolean> {
    return this.canInstallOnDevice$.pipe(
      filter(() => this.pwaService.installPromptLastShownTime + PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN < Date.now())
    );
  }

  get showCheckingDisabled(): boolean {
    return (
      this._selectedProjectDoc != null &&
      this._selectedProjectDoc.data != null &&
      !this._selectedProjectDoc.data.checkingConfig.checkingEnabled &&
      !roleCanAccessTranslate(this.selectedProjectRole)
    );
  }

  get issueMailTo(): string {
    return issuesEmailTemplate();
  }

  /** If is production server. */
  get isLive(): boolean {
    return environment.releaseStage === 'live';
  }

  get isDrawerPermanent(): boolean {
    return this._isDrawerPermanent;
  }

  set isDrawerPermanent(value: boolean) {
    if (this._isDrawerPermanent !== value) {
      this._isDrawerPermanent = value;
      if (!this._isDrawerPermanent) {
        this.collapseDrawer();
      }
    }
  }

  get lastSelectedProjectId(): string | undefined {
    return this.currentUser?.sites[environment.siteId].currentProjectId;
  }

  get appIconLink(): string[] {
    return this.router.url === '/projects' && this.lastSelectedProjectId != null
      ? ['/projects', this.lastSelectedProjectId]
      : ['/projects'];
  }

  get isLoggedIn(): Observable<boolean> {
    return this.authService.loggedInState$.pipe(map(state => state.loggedIn));
  }

  get isAppLoading(): boolean {
    return this.noticeService.isAppLoading;
  }

  get isServalAdmin(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.ServalAdmin);
  }

  get isSystemAdmin(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.SystemAdmin);
  }

  get currentUser(): User | undefined {
    return this.currentUserDoc == null ? undefined : this.currentUserDoc.data;
  }

  get canChangePassword(): boolean {
    if (this.currentUser == null || this.isLoggedInUserAnonymous) {
      return false;
    }
    return getAuthType(this.currentUser.authId) === AuthType.Account;
  }

  get selectedProjectDoc(): SFProjectProfileDoc | undefined {
    return this.activatedProjectService.projectDoc;
  }

  get selectedProjectId(): string | undefined {
    return this._selectedProjectDoc == null ? undefined : this._selectedProjectDoc.id;
  }

  get isProjectSelected(): boolean {
    return this.activatedProjectService.projectId != null;
  }

  get selectedProjectRole(): SFProjectRole | undefined {
    return this.currentUserDoc == null
      ? undefined
      : (this._selectedProjectDoc?.data?.userRoles[this.currentUserDoc.id] as SFProjectRole);
  }

  get texts(): TextInfo[] {
    return this._selectedProjectDoc?.data?.texts.slice().sort((a, b) => a.bookNum - b.bookNum) || [];
  }

  get appName(): string {
    return environment.siteName;
  }

  async ngOnInit(): Promise<void> {
    await this.authService.loggedIn;
    this.loadingStarted();
    this.currentUserDoc = await this.userService.getCurrentUser();
    const userData: User | undefined = cloneDeep(this.currentUserDoc.data);
    if (userData != null) {
      const userDataWithId = { ...userData, id: this.currentUserDoc.id };
      this.reportingService.addMeta(userDataWithId, 'user');
      if (Bugsnag.isStarted()) Bugsnag.setUser(this.currentUserDoc.id);
    }

    const isNewlyLoggedIn = await this.authService.isNewlyLoggedIn;
    this.isLoggedInUserAnonymous = await this.authService.isLoggedInUserAnonymous;
    const isBrowserSupported = supportedBrowser();
    this.reportingService.addMeta({ isBrowserSupported });
    if (isNewlyLoggedIn && !isBrowserSupported) {
      this.dialogService.openMatDialog(SupportedBrowsersDialogComponent, {
        data: BrowserIssue.Upgrade
      });
    }

    // Set the locale to the Auth0 user profile on first login
    const languageTag: string | undefined = this.currentUserDoc.data!.interfaceLanguage;
    if (
      isNewlyLoggedIn &&
      languageTag != null &&
      I18nService.getLocale(languageTag)?.canonicalTag !== this.i18n.localeCode
    ) {
      this.i18n.setLocale(languageTag);
    }

    // Monitor current project
    this.subscribe(this.activatedProjectService.projectDoc$, async (selectedProjectDoc?: SFProjectProfileDoc) => {
      this._selectedProjectDoc = selectedProjectDoc;
      if (this._selectedProjectDoc == null || !this._selectedProjectDoc.isLoaded) {
        return;
      }
      this.userService.setCurrentProjectId(this.currentUserDoc!, this._selectedProjectDoc.id);
      this.projectUserConfigDoc = await this.projectService.getUserConfig(
        this._selectedProjectDoc.id,
        this.currentUserDoc!.id
      );
      if (this.selectedProjectDeleteSub != null) {
        this.selectedProjectDeleteSub.unsubscribe();
      }
      this.selectedProjectDeleteSub = this._selectedProjectDoc?.delete$.subscribe(() => {
        // handle remotely deleted project
        const userDoc = this.currentUserDoc;
        if (userDoc != null && this.userService.currentProjectId(userDoc) != null) {
          this.showProjectDeletedDialog();
        }
      });

      this.permissionsChangedSub?.unsubscribe();
      this.permissionsChangedSub = this._selectedProjectDoc?.remoteChanges$.subscribe(() => {
        if (this._selectedProjectDoc?.data != null && this.currentUserDoc != null) {
          // If the user is in the Serval administration page, do not check access,
          // as they will be modifying the project's properties
          if (
            this.locationService.pathname.includes('serval-administration') &&
            this.currentUser?.roles.includes(SystemRole.ServalAdmin)
          ) {
            return;
          }
          // See if the user was removed from the project
          if (!(this.currentUserDoc.id in this._selectedProjectDoc.data.userRoles)) {
            // The user has been removed from the project
            this.showProjectDeletedDialog();
            this.projectService.localDelete(this._selectedProjectDoc.id);
          }

          if (this.projectUserConfigDoc != null) {
            checkAppAccess(
              this._selectedProjectDoc,
              this.currentUserDoc.id,
              this.projectUserConfigDoc,
              this.locationService.pathname,
              this.router
            );
          }
        }
      });

      this.checkDeviceStorage();
    });

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // Any time we navigate somewhere, the drawer shouldn't still be expanded (which will only be noticeable on
        // smaller screens where the drawer is not permanent).
        this.isExpanded = false;
      }
    });

    this.loadingFinished();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.selectedProjectDeleteSub?.unsubscribe();
    this.permissionsChangedSub?.unsubscribe();
  }

  setLocale(locale: string): void {
    this.i18n.setLocale(locale);
    this.authService.updateInterfaceLanguage(locale);
  }

  changePassword(): void {
    if (this.currentUser == null) {
      return;
    } else if (!this.isAppOnline) {
      this.noticeService.show(translate('app.action_not_available_offline'));
    } else {
      this.authService
        .changePassword(this.currentUser.email)
        .then(() => {
          this.noticeService.show(translate('app.password_reset_email_sent'));
        })
        .catch(() => {
          this.dialogService.message('app.cannot_change_password');
        });
    }
  }

  editName(): void {
    if (this.isAppOnline) {
      this.userService.editDisplayName(false);
    } else {
      this.noticeService.show(translate('app.action_not_available_offline'));
    }
  }

  dismissInstallIcon(): void {
    this.pwaService.setInstallPromptLastShownTime();
  }

  installOnDevice(): void {
    this.pwaService.install();
  }

  logOut(): void {
    this.authService.logOut();
  }

  collapseDrawer(): void {
    this.isExpanded = false;
  }

  openDrawer(): void {
    this.isExpanded = true;
  }

  toggleDrawer(): void {
    this.isExpanded = !this.isExpanded;
  }

  drawerCollapsed(): void {
    this.isExpanded = false;
  }

  reloadWithUpdates(): void {
    this.pwaService.activateUpdates();
  }

  openFeatureFlagDialog(): void {
    this.dialogService.openMatDialog(FeatureFlagsDialogComponent);
  }

  private async showProjectDeletedDialog(): Promise<void> {
    await this.userService.setCurrentProjectId(this.currentUserDoc!, undefined);
    await this.dialogService.message('app.project_has_been_deleted');
    this.navigateToStart();
  }

  private navigateToStart(): void {
    setTimeout(() => this.router.navigateByUrl('/projects', { replaceUrl: true }));
  }

  private checkDeviceStorage(): void {
    // Allow 5 seconds for the app to process any caching in progress
    const SPACE_IN_MB = 20;
    setTimeout(() => this.fileService.notifyUserIfStorageQuotaBelow(SPACE_IN_MB), 5000);
  }
}
