import { MdcIconRegistry } from '@angular-mdc/web';
import { MdcDialogRef } from '@angular-mdc/web/dialog';
import { MdcSelect } from '@angular-mdc/web/select';
import { MdcTopAppBar } from '@angular-mdc/web/top-app-bar';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { DefaultFocusState } from '@material/menu/constants';
import { translate } from '@ngneat/transloco';
import { cloneDeep } from 'lodash-es';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { AuthType, getAuthType, User } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { combineLatest, Observable, of, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, tap } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { FeatureFlagsDialogComponent } from 'xforge-common/feature-flags/feature-flags.component';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import versionData from '../../../version.json';
import { environment } from '../environments/environment';
import { QuestionDoc } from './core/models/question-doc';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { canAccessTranslateApp } from './core/models/sf-project-role-info';
import { SFProjectService } from './core/sf-project.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './shared/project-router.guard';
import { projectLabel } from './shared/utils';

declare function gtag(...args: any): void;

export const CONNECT_PROJECT_OPTION = '*connect-project*';

export interface QuestionQuery {
  bookNum: number;
  query: RealtimeQuery;
}

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
  translateVisible: boolean = false;
  checkingVisible: boolean = false;

  projectDocs?: SFProjectProfileDoc[];
  canSeeSettings$?: Observable<boolean>;
  canSeeUsers$?: Observable<boolean>;
  canSync$?: Observable<boolean>;
  /** Whether the user can see at least one of settings, users, or sync page */
  canSeeAdminPages$?: Observable<boolean>;
  hasUpdate: boolean = false;

  projectLabel = projectLabel;

  private currentUserDoc?: UserDoc;
  private _projectSelect?: MdcSelect;
  private projectDeletedDialogRef: MdcDialogRef<ProjectDeletedDialogComponent> | null = null;
  private _topAppBar?: MdcTopAppBar;
  private selectedProjectDoc?: SFProjectProfileDoc;
  private selectedProjectDeleteSub?: Subscription;
  private removedFromProjectSub?: Subscription;
  private _isDrawerPermanent: boolean = true;
  private communityCheckingBooks: number[] = [];
  private questionsQuery?: RealtimeQuery<QuestionDoc>;

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly locationService: LocationService,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly route: ActivatedRoute,
    private readonly settingsAuthGuard: SettingsAuthGuard,
    private readonly syncAuthGuard: SyncAuthGuard,
    private readonly usersAuthGuard: UsersAuthGuard,
    private readonly dialogService: DialogService,
    private readonly fileService: FileService,
    private readonly reportingService: ErrorReportingService,
    private readonly userProjectsService: SFUserProjectsService,
    readonly noticeService: NoticeService,
    readonly i18n: I18nService,
    readonly media: MediaObserver,
    readonly urls: ExternalUrlService,
    readonly featureFlags: FeatureFlagService,
    private readonly pwaService: PwaService,
    iconRegistry: MdcIconRegistry,
    sanitizer: DomSanitizer
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
    this.isAppOnline = pwaService.isOnline;
    this.subscribe(pwaService.onlineStatus$, status => {
      if (status !== this.isAppOnline) {
        this.isAppOnline = status;
        this.checkDeviceStorage();
      }
    });

    // Check browser online status to allow checks with Auth0
    this.subscribe(pwaService.onlineBrowserStatus$, status => {
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
    iconRegistry.addSvgIcon('translate', sanitizer.bypassSecurityTrustResourceUrl('/assets/icons/translate.svg'));
  }

  get showCheckingDisabled(): boolean {
    return (
      this.selectedProjectDoc != null &&
      this.selectedProjectDoc.data != null &&
      !this.selectedProjectDoc.data.checkingConfig.checkingEnabled &&
      !canAccessTranslateApp(this.selectedProjectRole)
    );
  }

  get issueMailTo(): string {
    return issuesEmailTemplate();
  }

  /** If is production server. */
  get isLive(): boolean {
    return environment.releaseStage === 'live';
  }

  @ViewChild('topAppBar', { static: true })
  set topAppBar(value: MdcTopAppBar) {
    this._topAppBar = value;
    this.setTopAppBarVariant();
  }

  get projectSelect(): MdcSelect | undefined {
    return this._projectSelect;
  }

  @ViewChild(MdcSelect)
  set projectSelect(value: MdcSelect | undefined) {
    this._projectSelect = value;
    if (this._projectSelect != null) {
      setTimeout(() => {
        if (this._projectSelect != null && this.selectedProjectDoc != null) {
          this._projectSelect.value = this.selectedProjectDoc.id;
        }
      });
    }
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
      this.setTopAppBarVariant();
    }
  }

  get isLoggedIn(): Promise<boolean> {
    return this.authService.isLoggedIn;
  }

  get isAppLoading(): boolean {
    return this.noticeService.isAppLoading;
  }

  get isSystemAdmin(): boolean {
    return this.authService.currentUserRole === SystemRole.SystemAdmin;
  }

  get isTranslateEnabled(): boolean {
    return canAccessTranslateApp(this.selectedProjectRole);
  }

  get isCheckingEnabled(): boolean {
    return (
      this.selectedProjectDoc != null &&
      this.selectedProjectDoc.data != null &&
      this.selectedProjectDoc.data.checkingConfig.checkingEnabled
    );
  }

  get hasSingleAppEnabled(): boolean {
    const appStatus: boolean[] = [this.isTranslateEnabled, this.isCheckingEnabled];
    return appStatus.filter(enabled => enabled).length === 1;
  }

  get currentUser(): User | undefined {
    return this.currentUserDoc == null ? undefined : this.currentUserDoc.data;
  }

  get canChangePassword(): boolean {
    if (this.currentUser == null) {
      return false;
    }
    return getAuthType(this.currentUser.authId) === AuthType.Account;
  }

  get selectedProjectId(): string | undefined {
    return this.selectedProjectDoc == null ? undefined : this.selectedProjectDoc.id;
  }

  get isProjectSelected(): boolean {
    return this.selectedProjectId != null;
  }

  get selectedProjectRole(): SFProjectRole | undefined {
    return this.selectedProjectDoc == null || this.selectedProjectDoc.data == null || this.currentUserDoc == null
      ? undefined
      : (this.selectedProjectDoc.data.userRoles[this.currentUserDoc.id] as SFProjectRole);
  }

  get texts(): TextInfo[] {
    return this.selectedProjectDoc?.data?.texts.slice().sort((a, b) => a.bookNum - b.bookNum) || [];
  }

  get showAllQuestions(): boolean {
    let count = 0;
    for (const text of this.texts) {
      if (this.hasQuestions(text)) {
        count++;
      }
      if (count > 1) {
        return true;
      }
    }
    return false;
  }

  get defaultFocusState(): DefaultFocusState {
    return !this.isAppOnline ? DefaultFocusState.NONE : DefaultFocusState.LIST_ROOT;
  }

  async ngOnInit(): Promise<void> {
    this.loadingStarted();
    if (!(await this.isLoggedIn)) {
      this.loadingFinished();
      return;
    }

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
    const isBrowserSupported = supportedBrowser();
    this.reportingService.addMeta({ isBrowserSupported });
    if (isNewlyLoggedIn && !isBrowserSupported) {
      this.dialogService.openMdcDialog(SupportedBrowsersDialogComponent, {
        autoFocus: false,
        data: BrowserIssue.Upgrade
      });
    }

    const projectDocs$ = this.userProjectsService.projectDocs$;

    // retrieve the projectId from the current route. Since the nav menu is outside of the router outlet, it cannot
    // use ActivatedRoute to get the params. Instead the nav menu, listens to router events and traverses the route
    // tree to find the currently activated route
    const projectId$: Observable<string | undefined> = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let route = this.route.snapshot;
        while (route.firstChild != null) {
          route = route.firstChild;
        }
        return route;
      }),
      filter(r => r.outlet === 'primary'),
      tap(r => {
        // ensure that the task of the current view has been expanded
        for (const segment of r.url) {
          if (segment.path === 'translate') {
            this.translateVisible = true;
            break;
          } else if (segment.path === 'checking') {
            this.checkingVisible = true;
            break;
          }
        }
      }),
      map(r => r.params['projectId'] as string | undefined),
      distinctUntilChanged(),
      tap(projectId => {
        this.canSeeSettings$ = projectId == null ? of(false) : this.settingsAuthGuard.allowTransition(projectId);
        this.canSeeUsers$ = projectId == null ? of(false) : this.usersAuthGuard.allowTransition(projectId);
        this.canSync$ = projectId == null ? of(false) : this.syncAuthGuard.allowTransition(projectId);
        this.canSeeAdminPages$ = combineLatest([this.canSeeSettings$, this.canSeeUsers$, this.canSync$]).pipe(
          map(([settings, users, sync]) => settings || users || sync)
        );
        // the project deleted dialog should be closed by now, so we can reset its ref to null
        if (projectId == null) {
          this.projectDeletedDialogRef = null;
        }
      })
    );

    // select the current project
    this.subscribe(combineLatest([projectDocs$, projectId$]), async ([projectDocs, projectId]) => {
      this.projectDocs = projectDocs;
      // if the project deleted dialog is displayed, don't do anything
      if (this.projectDeletedDialogRef != null) {
        return;
      }
      const selectedProjectDoc = projectId == null ? undefined : this.projectDocs.find(p => p.id === projectId);

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

      this.selectedProjectDoc = selectedProjectDoc;
      this.setTopAppBarVariant();
      if (this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded) {
        return;
      }
      this.userService.setCurrentProjectId(this.currentUserDoc!, this.selectedProjectDoc.id);
      this.refreshQuestionsQuery(this.selectedProjectDoc.id);

      // handle remotely deleted project
      this.selectedProjectDeleteSub = this.selectedProjectDoc.delete$.subscribe(() => {
        if (this.userService.currentProjectId != null) {
          this.showProjectDeletedDialog();
        }
      });

      if (this.removedFromProjectSub != null) {
        this.removedFromProjectSub.unsubscribe();
      }
      this.removedFromProjectSub = this.selectedProjectDoc.remoteChanges$.subscribe(() => {
        if (
          this.selectedProjectDoc?.data != null &&
          this.currentUserDoc != null &&
          !(this.currentUserDoc.id in this.selectedProjectDoc.data.userRoles)
        ) {
          // The user has been removed from the project
          this.showProjectDeletedDialog();
          this.projectService.localDelete(this.selectedProjectDoc.id);
        }
      });

      if (!this.isTranslateEnabled) {
        this.translateVisible = false;
      }
      if (!this.isCheckingEnabled) {
        this.checkingVisible = false;
      }
      if (this._projectSelect != null) {
        this._projectSelect.value = this.selectedProjectDoc.id;
      }

      this.checkDeviceStorage();
    });

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
    this.questionsQuery?.dispose();
  }

  setLocale(locale: string) {
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

  async editName(): Promise<void> {
    if (this.pwaService.isOnline) {
      this.userService.editDisplayName(false);
    } else {
      this.noticeService.show(translate('app.action_not_available_offline'));
    }
  }

  logOut(): void {
    this.authService.logOut();
  }

  async goHome(): Promise<void> {
    if (await this.isLoggedIn) {
      this.router.navigateByUrl('/projects');
    } else {
      this.locationService.go('/');
    }
  }

  projectChanged(value: string): void {
    if (value === CONNECT_PROJECT_OPTION) {
      if (!this.isDrawerPermanent) {
        this.collapseDrawer();
      }
      this.router.navigateByUrl('/connect-project');
    } else if (value !== '' && this.selectedProjectDoc != null && value !== this.selectedProjectDoc.id) {
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

  getBookName(text: TextInfo): string {
    return this.i18n.localizeBook(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
  }

  getRouterLink(tool: string, extension?: string): string[] {
    if (this.selectedProjectId == null) {
      return [];
    }
    const link = ['/projects', this.selectedProjectId, tool];
    if (extension != null && extension !== '') {
      link.push(extension);
    }
    return link;
  }

  hasQuestions(text: TextInfo): boolean {
    return this.communityCheckingBooks.includes(text.bookNum);
  }

  reloadWithUpdates(): void {
    this.pwaService.activateUpdates();
  }

  openFeatureFlagDialog() {
    this.dialogService.openMatDialog(FeatureFlagsDialogComponent);
  }

  get lastSyncFailed(): boolean {
    return this.selectedProjectDoc?.data?.sync.lastSyncSuccessful === false && !this.syncInProgress;
  }

  get syncInProgress(): boolean {
    return this.selectedProjectDoc?.data != null && this.selectedProjectDoc.data.sync.queuedCount > 0;
  }

  private async refreshQuestionsQuery(projectId: string): Promise<void> {
    this.questionsQuery?.dispose();

    this.questionsQuery = await this.projectService.queryQuestions(projectId, { activeOnly: true });
    this.questionsQuery.docs$.subscribe(docs => {
      const books = new Set<number>();
      for (const question of docs) {
        const bookNum = question.data?.verseRef.bookNum;
        if (bookNum != null) books.add(bookNum);
      }
      // Subscribe to the texts of any added book, so it will be available offline. This really shouldn't be the concern
      // of the app component, but for now it is. There isn't an easy way to unsubscribe from a book that was removed,
      // and it's not extremely important to do so, so we won't bother doing that.
      for (const bookNum of books) {
        if (!this.communityCheckingBooks.includes(bookNum)) this.selectedProjectDoc?.loadTextDocs(bookNum);
      }
      this.communityCheckingBooks = Array.from(books).sort((a, b) => a - b);
    });
  }

  private async showProjectDeletedDialog(): Promise<void> {
    await this.userService.setCurrentProjectId(this.currentUserDoc!, undefined);
    this.projectDeletedDialogRef = this.dialogService.openMdcDialog(ProjectDeletedDialogComponent);
    this.projectDeletedDialogRef.afterClosed().subscribe(() => this.navigateToStart());
  }

  private navigateToStart(): void {
    setTimeout(() => this.router.navigateByUrl('/projects', { replaceUrl: true }));
  }

  private setTopAppBarVariant(): void {
    if (this._topAppBar == null) {
      return;
    }

    const isShort = this._isDrawerPermanent && this.selectedProjectDoc != null;
    if (isShort !== this._topAppBar.short) {
      this._topAppBar.setShort(isShort, true);
    }
  }

  private checkDeviceStorage(): void {
    // Allow 5 seconds for the app to process any caching in progress
    const SPACE_IN_MB = 20;
    setTimeout(() => this.fileService.notifyUserIfStorageQuotaBelow(SPACE_IN_MB), 5000);
  }
}
