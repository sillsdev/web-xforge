import { MdcIconRegistry } from '@angular-mdc/web';
import { MdcDialog } from '@angular-mdc/web/dialog';
import { MdcSelect } from '@angular-mdc/web/select';
import { MdcTopAppBar } from '@angular-mdc/web/top-app-bar';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { cloneDeep } from 'lodash-es';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { AuthType, getAuthType, User } from 'realtime-server/lib/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { combineLatest, from, merge, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, switchMap, tap } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { BetaMigrationDialogComponent } from 'xforge-common/beta-migration/beta-migration-dialog/beta-migration-dialog.component';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
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
import { UserService } from 'xforge-common/user.service';
import { issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';
import { SFProjectDoc } from './core/models/sf-project-doc';
import { canAccessTranslateApp } from './core/models/sf-project-role-info';
import { SFProjectService } from './core/sf-project.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SFAdminAuthGuard } from './shared/project-router.guard';
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
  version: string = version;
  issueEmail: string = environment.issueEmail;
  isAppOnline: boolean = false;
  isExpanded: boolean = false;
  translateVisible: boolean = false;
  checkingVisible: boolean = false;

  projectDocs?: SFProjectDoc[];
  isProjectAdmin$?: Observable<boolean>;
  hasUpdate: boolean = false;

  private currentUserDoc?: UserDoc;
  private _projectSelect?: MdcSelect;
  private projectDeletedDialogRef: any;
  private _topAppBar?: MdcTopAppBar;
  private selectedProjectDoc?: SFProjectDoc;
  private selectedProjectDeleteSub?: Subscription;
  private removedFromProjectSub?: Subscription;
  private _isDrawerPermanent: boolean = true;
  private readonly questionCountQueries = new Map<number, RealtimeQuery>();

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly locationService: LocationService,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly route: ActivatedRoute,
    private readonly adminAuthGuard: SFAdminAuthGuard,
    private readonly dialog: MdcDialog,
    private readonly fileService: FileService,
    private readonly reportingService: ErrorReportingService,
    readonly noticeService: NoticeService,
    readonly i18n: I18nService,
    readonly media: MediaObserver,
    private readonly pwaService: PwaService,
    iconRegistry: MdcIconRegistry,
    sanitizer: DomSanitizer
  ) {
    super(noticeService);
    this.subscribe(media.media$, (change: MediaChange) => {
      this.isDrawerPermanent = ['xl', 'lt-xl', 'lg', 'lt-lg'].includes(change.mqAlias);
    });

    // Check online status changes
    this.isAppOnline = pwaService.isOnline;
    this.subscribe(pwaService.onlineStatus, status => {
      if (status !== this.isAppOnline) {
        this.isAppOnline = status;
        this.checkDeviceStorage();
      }
      // Check authentication when coming back online
      // This is also run on first load when the websocket connects for the first time
      if (this.isAppOnline && !this.isAppLoading) {
        // Redirect to the master site unless the referrer was the master site
        if (environment.beta && document.referrer.includes(environment.masterUrl)) {
          // TODO: uncomment the line below for QA and Live once local testing is complete.
          // window.location.href = environment.masterUrl + window.location.pathname;
        }
        this.authService.checkOnlineAuth();
      }
    });

    this.subscribe(pwaService.hasUpdate, () => (this.hasUpdate = true));

    // Google Analytics - send data at end of navigation so we get data inside the SPA client-side routing
    if (environment.releaseStage === 'live') {
      const navEndEvent$ = router.events.pipe(
        filter(e => e instanceof NavigationEnd),
        map(e => e as NavigationEnd)
      );
      this.subscribe(navEndEvent$, e => {
        if (this.isAppOnline) {
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

  get helpsPage(): string {
    return environment.helps + '/' + (this.i18n.locale.helps || I18nService.defaultLocale.helps!);
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

  async ngOnInit(): Promise<void> {
    this.loadingStarted();
    if (await this.isLoggedIn) {
      this.currentUserDoc = await this.userService.getCurrentUser();
      const userData = cloneDeep(this.currentUserDoc.data);
      if (userData != null) {
        this.reportingService.addMeta(userData, 'user');
      }

      const languageTag = this.currentUserDoc.data!.interfaceLanguage;
      if (languageTag != null) {
        this.i18n.trySetLocale(languageTag, false);
      }

      const isNewlyLoggedIn = await this.authService.isNewlyLoggedIn;
      const isBrowserSupported = supportedBrowser();
      this.reportingService.addMeta({ isBrowserSupported });
      if (isNewlyLoggedIn && !isBrowserSupported) {
        this.dialog.open(SupportedBrowsersDialogComponent, { autoFocus: false, data: BrowserIssue.upgrade });
      }

      if (!environment.beta && (await this.checkUserNeedsMigrating())) {
        const migrationDialog = this.dialog.open(BetaMigrationDialogComponent, {
          autoFocus: false,
          clickOutsideToClose: false,
          escapeToClose: false
        });
        const migrationDialogSub = migrationDialog.componentInstance.onProgress.subscribe((progress: number) => {
          if (progress === 100) {
            // Automatically close the dialog after 5 seconds - the close button will also be available for manual close
            setTimeout(() => {
              migrationDialog.close();
            }, 5000);
          }
        });
        migrationDialog.afterClosed().subscribe(() => {
          migrationDialogSub.unsubscribe();
        });
      }

      const projectDocs$ = this.currentUserDoc.remoteChanges$.pipe(
        startWith(null),
        switchMap(() => from(this.getProjectDocs()))
      );

      // retrieve the projectId from the current route. Since the nav menu is outside of the router outlet, it cannot
      // use ActivatedRoute to get the params. Instead the nav menu, listens to router events and traverses the route
      // tree to find the currently activated route
      const projectId$ = this.router.events.pipe(
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
        map(r => r.params['projectId'] as string),
        distinctUntilChanged(),
        tap(projectId => {
          this.isProjectAdmin$ = this.adminAuthGuard.allowTransition(projectId);
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
          projectId === this.userService.currentProjectId &&
          (selectedProjectDoc == null || !selectedProjectDoc.isLoaded)
        ) {
          this.userService.setCurrentProjectId();
          this.navigateToStart();
          return;
        }

        this.selectedProjectDoc = selectedProjectDoc;
        this.setTopAppBarVariant();
        if (this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded) {
          return;
        }

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
            this.selectedProjectDoc != null &&
            this.selectedProjectDoc.data != null &&
            this.currentUserDoc != null &&
            !(this.currentUserDoc.id in this.selectedProjectDoc.data.userRoles)
          ) {
            // The user has been removed from the project
            this.showProjectDeletedDialog();
            this.projectService.localDelete(this.selectedProjectDoc.id);
          }
          // See if we need to enable any books in the checking app
          if (this.isCheckingEnabled && !this.checkingVisible) {
            this.checkCheckingBookQuestions();
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

        this.userService.setCurrentProjectId(this.selectedProjectDoc.id);

        this.checkCheckingBookQuestions();
        this.checkDeviceStorage();
      });
    }
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
    this.disposeQuestionQueries();
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
          this.noticeService.show(translate('app.cannot_change_password'));
        });
    }
  }

  async editName(): Promise<void> {
    this.userService.editDisplayName(false);
  }

  logOut(): void {
    this.authService.logOut();
  }

  async goHome(): Promise<void> {
    (await this.isLoggedIn) ? this.router.navigateByUrl('/projects') : this.locationService.go('/');
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

  hasQuestions(text: TextInfo): boolean {
    const query = this.questionCountQueries.get(text.bookNum);
    return query != null && query.count > 0;
  }

  reloadWithUpdates(): void {
    this.pwaService.activateUpdates();
  }

  private async checkCheckingBookQuestions(): Promise<void> {
    this.disposeQuestionQueries();
    if (!this.isCheckingEnabled || this.selectedProjectDoc === undefined) {
      return;
    }
    const promises: Promise<any>[] = [];
    for (const text of this.texts) {
      promises.push(
        this.projectService
          .queryQuestions(this.selectedProjectDoc.id, {
            bookNum: text.bookNum,
            activeOnly: true
          })
          .then(query => this.questionCountQueries.set(text.bookNum, query))
      );
    }
    await Promise.all(promises);
    this.questionCountQueries.forEach((query: RealtimeQuery, bookNum: number) => {
      this.subscribe(merge(query.remoteChanges$, query.localChanges$, query.ready$), () => {
        if (this.selectedProjectDoc == null) {
          return;
        }
        if (query.count > 0) {
          this.selectedProjectDoc.loadTextDocs(bookNum);
        }
      });
    });
  }

  private async checkUserNeedsMigrating(): Promise<boolean> {
    return (await this.userService.checkUserNeedsMigrating()) ?? false;
  }

  private disposeQuestionQueries(): void {
    for (const questionQuery of this.questionCountQueries.values()) {
      questionQuery.dispose();
    }
    this.questionCountQueries.clear();
  }

  private async getProjectDocs(): Promise<SFProjectDoc[]> {
    if (this.currentUser == null) {
      return [];
    }

    this.loadingStarted();
    const projects = this.currentUser.sites[environment.siteId].projects;
    const projectDocs: SFProjectDoc[] = new Array(projects.length);
    const promises: Promise<any>[] = [];
    for (let i = 0; i < projects.length; i++) {
      const index = i;
      promises.push(this.projectService.get(projects[index]).then(p => (projectDocs[index] = p)));
    }
    await Promise.all(promises);
    this.loadingFinished();
    return projectDocs;
  }

  private showProjectDeletedDialog(): void {
    this.userService.setCurrentProjectId();
    this.projectDeletedDialogRef = this.dialog.open(ProjectDeletedDialogComponent);
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
