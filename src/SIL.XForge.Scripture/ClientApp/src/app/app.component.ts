import { Component, OnDestroy, OnInit } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { NavigationEnd, Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { cloneDeep } from 'lodash-es';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { AuthType, getAuthType, User } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { combineLatest, Observable, Subscription } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';
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
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { PwaService, PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN } from 'xforge-common/pwa.service';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import versionData from '../../../version.json';
import { environment } from '../environments/environment';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { roleCanAccessTranslate } from './core/models/sf-project-role-info';
import { SFProjectService } from './core/sf-project.service';

declare function gtag(...args: any): void;

export const CONNECT_PROJECT_OPTION = '*connect-project*';

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
  private isLoggedInUserAnonymous: boolean = false;
  private _selectedProjectDoc?: SFProjectProfileDoc;
  private selectedProjectDeleteSub?: Subscription;
  private removedFromProjectSub?: Subscription;
  private _isDrawerPermanent: boolean = true;

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly dialogService: DialogService,
    private readonly fileService: FileService,
    private readonly reportingService: ErrorReportingService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly localSettings: LocalSettingsService,
    readonly noticeService: NoticeService,
    readonly i18n: I18nService,
    readonly media: MediaObserver,
    readonly urls: ExternalUrlService,
    readonly featureFlags: FeatureFlagService,
    private readonly pwaService: PwaService,
    onlineStatusService: OnlineStatusService
  ) {
    super(noticeService);
    this.subscribe(
      media.asObservable().pipe(
        filter((changes: MediaChange[]) => changes.length > 0),
        map((changes: MediaChange[]) => changes[0])
      ),
      (change: MediaChange) => {
        this.isDrawerPermanent = ['xl', 'lt-xl', 'lg', 'lt-lg'].includes(change.mqAlias);
      }
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

  get homeUrl$(): Observable<string> {
    return this.authService.loggedInState$.pipe(
      map(state => (state.loggedIn ? '/projects' : '/')),
      startWith('/')
    );
  }

  get isAppLoading(): boolean {
    return this.noticeService.isAppLoading;
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

  async ngOnInit(): Promise<void> {
    await this.authService.loggedIn;
    this.loadingStarted();
    this.currentUserDoc = await this.userService.getCurrentUser();
    const userData = cloneDeep(this.currentUserDoc.data);
    if (userData != null) {
      this.reportingService.addMeta(userData, 'user');
    }

    const languageTag = this.currentUserDoc.data!.interfaceLanguage;
    if (languageTag != null) {
      this.i18n.trySetLocale(languageTag, this.authService);
    }

    const isNewlyLoggedIn = await this.authService.isNewlyLoggedIn;
    this.isLoggedInUserAnonymous = await this.authService.isLoggedInUserAnonymous;
    const isBrowserSupported = supportedBrowser();
    this.reportingService.addMeta({ isBrowserSupported });
    if (isNewlyLoggedIn && !isBrowserSupported) {
      this.dialogService.openMatDialog(SupportedBrowsersDialogComponent, {
        autoFocus: false,
        data: BrowserIssue.Upgrade
      });
    }

    const projectDocs$ = this.userProjectsService.projectDocs$;

    const selectedProjectDoc$ = projectDocs$.pipe(
      map(projectDocs => {
        const projectId = this.activatedProjectService.projectId;
        return projectId == null ? undefined : projectDocs.find(p => p.id === projectId);
      }),
      filterNullish()
    );

    // select the current project
    this.subscribe(
      combineLatest([selectedProjectDoc$, this.activatedProjectService.projectId$]),
      async ([selectedProjectDoc, projectId]) => {
        if (this.selectedProjectDeleteSub != null) {
          this.selectedProjectDeleteSub.unsubscribe();
          this.selectedProjectDeleteSub = undefined;
        }

        // check if the currently selected project has been deleted
        if (
          projectId != null &&
          this.currentUserDoc != null &&
          projectId === this.userService.currentProjectId(this.currentUserDoc) &&
          (selectedProjectDoc == null || !selectedProjectDoc.isLoaded)
        ) {
          await this.userService.setCurrentProjectId(this.currentUserDoc, undefined);
          this.navigateToStart();
          return;
        }

        this._selectedProjectDoc = selectedProjectDoc;
        if (this._selectedProjectDoc == null || !this._selectedProjectDoc.isLoaded) {
          return;
        }
        this.userService.setCurrentProjectId(this.currentUserDoc!, this._selectedProjectDoc.id);

        // handle remotely deleted project
        this.selectedProjectDeleteSub = this._selectedProjectDoc.delete$.subscribe(() => {
          if (this.userService.currentProjectId != null) {
            this.showProjectDeletedDialog();
          }
        });

        if (this.removedFromProjectSub != null) {
          this.removedFromProjectSub.unsubscribe();
        }
        this.removedFromProjectSub = this._selectedProjectDoc.remoteChanges$.subscribe(() => {
          if (
            this._selectedProjectDoc?.data != null &&
            this.currentUserDoc != null &&
            !(this.currentUserDoc.id in this._selectedProjectDoc.data.userRoles)
          ) {
            // The user has been removed from the project
            this.showProjectDeletedDialog();
            this.projectService.localDelete(this._selectedProjectDoc.id);
          }
        });

        this.checkDeviceStorage();
      }
    );

    this.loadingFinished();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.selectedProjectDeleteSub != null) {
      this.selectedProjectDeleteSub.unsubscribe();
    }
    if (this.removedFromProjectSub != null) {
      this.removedFromProjectSub.unsubscribe();
    }
  }

  setLocale(locale: string): void {
    this.i18n.setLocale(locale, this.authService);
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

  projectChanged(value: string): void {
    if (value === CONNECT_PROJECT_OPTION) {
      if (!this.isDrawerPermanent) {
        this.collapseDrawer();
      }
      this.router.navigateByUrl('/connect-project');
    } else if (value !== '' && this._selectedProjectDoc != null && value !== this._selectedProjectDoc.id) {
      this.router.navigate(['/projects', value]);
    }
  }

  itemSelected(): void {
    if (!this.isDrawerPermanent) {
      this.collapseDrawer();
    }
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

  get appName(): string {
    return environment.siteName;
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
