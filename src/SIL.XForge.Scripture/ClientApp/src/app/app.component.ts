import { MdcDialog, MdcSelect, MdcTopAppBar } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Site } from 'realtime-server/lib/common/models/site';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { AuthType, getAuthType, User } from 'realtime-server/lib/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { combineLatest, from, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, switchMap, tap } from 'rxjs/operators';
import { AccountService } from 'xforge-common/account.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { LocationService } from 'xforge-common/location.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';
import { HelpHeroService } from './core/help-hero.service';
import { SFProjectDoc } from './core/models/sf-project-doc';
import { SFProjectService } from './core/sf-project.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SFAdminAuthGuard } from './shared/sfadmin-auth.guard';
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
  isExpanded: boolean = false;
  translateVisible: boolean = false;
  checkingVisible: boolean = false;

  projectDocs: SFProjectDoc[];
  isProjectAdmin$: Observable<boolean>;

  private _checkingTexts: TextInfo[] = [];
  private questionCountQueries: QuestionQuery[] = [];
  private currentUserDoc: UserDoc;
  private currentUserAuthType: AuthType;
  private _projectSelect: MdcSelect;
  private projectDeletedDialogRef: any;
  private _topAppBar: MdcTopAppBar;
  private selectedProjectDoc: SFProjectDoc;
  private selectedProjectDeleteSub: Subscription;
  private removedFromProjectSub: Subscription;
  private _isDrawerPermanent: boolean = true;
  private selectedProjectRole: SFProjectRole;

  constructor(
    private readonly router: Router,
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly locationService: LocationService,
    private readonly helpHeroService: HelpHeroService,
    private readonly userService: UserService,
    noticeService: NoticeService,
    media: MediaObserver,
    private readonly projectService: SFProjectService,
    private readonly route: ActivatedRoute,
    private readonly adminAuthGuard: SFAdminAuthGuard,
    private readonly dialog: MdcDialog
  ) {
    super(noticeService);
    this.subscribe(media.media$, (change: MediaChange) => {
      this.isDrawerPermanent = ['xl', 'lt-xl', 'lg', 'lt-lg'].includes(change.mqAlias);
    });

    // Google Analytics - send data at end of navigation so we get data inside the SPA client-side routing
    if (environment.releaseStage === 'live') {
      const navEndEvent$ = router.events.pipe(filter(e => e instanceof NavigationEnd));
      this.subscribe(navEndEvent$, (e: NavigationEnd) => {
        gtag('config', 'UA-22170471-15', { page_path: e.urlAfterRedirects });
      });
    }
  }

  get checkingTexts(): TextInfo[] {
    return this._checkingTexts;
  }

  get issueMailTo(): string {
    return encodeURI(`mailto:${environment.issueEmail}?subject=${environment.siteName} issue`);
  }

  get helpsPage(): string {
    return encodeURI(environment.helps);
  }

  @ViewChild('topAppBar', { static: true })
  set topAppBar(value: MdcTopAppBar) {
    this._topAppBar = value;
    this.setTopAppBarVariant();
  }

  get projectSelect(): MdcSelect {
    return this._projectSelect;
  }

  @ViewChild(MdcSelect, { static: false })
  set projectSelect(value: MdcSelect) {
    this._projectSelect = value;
    if (this._projectSelect != null) {
      setTimeout(() => {
        if (this.selectedProjectDoc != null) {
          this._projectSelect.reset();
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
    return this.selectedProjectRole !== SFProjectRole.CommunityChecker;
  }

  get isCheckingEnabled(): boolean {
    return (
      this.selectedProjectDoc != null &&
      this.selectedProjectDoc.isLoaded &&
      this.selectedProjectDoc.data.checkingConfig.checkingEnabled
    );
  }

  get currentUser(): User {
    return this.currentUserDoc == null ? undefined : this.currentUserDoc.data;
  }

  get canChangePassword(): boolean {
    return this.currentUserAuthType === AuthType.Account;
  }

  get selectedProjectId(): string {
    return this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded
      ? undefined
      : this.selectedProjectDoc.id;
  }

  get texts(): TextInfo[] {
    return this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded
      ? []
      : this.selectedProjectDoc.data.texts;
  }

  private get site(): Site {
    return this.currentUser == null ? undefined : this.currentUser.sites[environment.siteId];
  }

  async ngOnInit(): Promise<void> {
    this.loadingStarted();
    this.authService.init();
    if (await this.isLoggedIn) {
      this.currentUserDoc = await this.userService.getCurrentUser();
      this.currentUserAuthType = getAuthType(this.currentUserDoc.data.authId);

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
      this.subscribe(combineLatest(projectDocs$, projectId$), async ([projectDocs, projectId]) => {
        this.projectDocs = projectDocs;
        // if the project deleted dialog is displayed, don't do anything
        if (this.projectDeletedDialogRef != null) {
          return;
        }
        const selectedProjectDoc = projectId == null ? undefined : this.projectDocs.find(p => p.id === projectId);

        // check if the currently selected project has been deleted
        if (projectId != null && selectedProjectDoc != null && !selectedProjectDoc.isLoaded) {
          this.userService.setCurrentProjectId();
          this.navigateToStart();
          return;
        }

        if (this.selectedProjectDeleteSub != null) {
          this.selectedProjectDeleteSub.unsubscribe();
          this.selectedProjectDeleteSub = undefined;
        }
        this.selectedProjectDoc = selectedProjectDoc;
        this.setTopAppBarVariant();
        this.selectedProjectRole =
          this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded
            ? undefined
            : (this.selectedProjectDoc.data.userRoles[this.currentUserDoc.id] as SFProjectRole);
        if (this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded) {
          return;
        }

        this.selectedProjectDeleteSub = this.selectedProjectDoc.delete$.subscribe(() => {
          if (this.userService.currentProjectId != null) {
            this.showProjectDeletedDialog();
          } else {
            this.navigateToStart();
          }
        });

        if (this.removedFromProjectSub != null) {
          this.removedFromProjectSub.unsubscribe();
        }
        this.removedFromProjectSub = this.selectedProjectDoc.remoteChanges$.subscribe(() => {
          if (this.selectedProjectDoc != null && this.selectedProjectDoc.isLoaded) {
            if (!(this.currentUserDoc.id in this.selectedProjectDoc.data.userRoles)) {
              // The user has been removed from the project
              this.showProjectDeletedDialog();
            }
          }
        });

        if (!this.isTranslateEnabled) {
          this.translateVisible = false;
        }
        if (!this.isCheckingEnabled) {
          this.checkingVisible = false;
        }
        if (this._projectSelect != null) {
          this._projectSelect.reset();
          this._projectSelect.value = this.selectedProjectDoc.id;
        }

        this.userService.setCurrentProjectId(this.selectedProjectDoc.id);

        if (this.isCheckingEnabled) {
          this.disposeQuestionQueries();
          this._checkingTexts = [];
          for (const text of this.texts) {
            const questionCountQuery = await this.projectService.queryQuestionCount(this.selectedProjectId, {
              bookNum: text.bookNum,
              activeOnly: true
            });
            this.toggleCheckingBook(questionCountQuery, text);
            this.subscribe(questionCountQuery.remoteChanges$, () => {
              this.toggleCheckingBook(questionCountQuery, text);
            });
            this.questionCountQueries.push({ bookNum: text.bookNum, query: questionCountQuery });
          }
        }
      });
      // tell HelpHero to remember this user to make sure we won't show them an identical tour again later
      this.helpHeroService.setIdentity(this.userService.currentUserId);
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
    this.authService
      .changePassword(this.currentUser.email)
      .then(result => {
        this.noticeService.show(result);
      })
      .catch(() => {
        const message = "Can't change password at this time. Try again later or report an issue in the Help menu.";
        this.noticeService.show(message);
      });
  }
  editName(currentDisplayName: string): void {
    const dialogRef = this.accountService.openNameDialog(currentDisplayName, false);
    dialogRef.afterClosed().subscribe(response => {
      this.currentUserDoc.submitJson0Op(op => op.set(u => u.displayName, response as string));
    });
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

  collapseDrawer() {
    this.isExpanded = false;
  }

  openDrawer() {
    this.isExpanded = true;
  }

  toggleDrawer() {
    this.isExpanded = !this.isExpanded;
  }

  drawerCollapsed(): void {
    this.isExpanded = false;
  }

  getBookName(text: TextInfo): string {
    return Canon.bookNumberToEnglishName(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
  }

  private disposeQuestionQueries() {
    if (this.questionCountQueries.length > 0) {
      for (const questionQuery of this.questionCountQueries) {
        questionQuery.query.dispose();
      }
      this.questionCountQueries = [];
    }
  }

  private async getProjectDocs(): Promise<SFProjectDoc[]> {
    this.loadingStarted();
    const projectDocs: SFProjectDoc[] = new Array(this.site.projects.length);
    const promises: Promise<any>[] = [];
    for (let i = 0; i < this.site.projects.length; i++) {
      const index = i;
      promises.push(this.projectService.get(this.site.projects[index]).then(p => (projectDocs[index] = p)));
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

  private toggleCheckingBook(questionCountQuery: RealtimeQuery, text: TextInfo) {
    if (questionCountQuery.count > 0) {
      if (!this._checkingTexts.includes(text)) {
        this._checkingTexts.push(text);
      }
    } else {
      const index = this._checkingTexts.findIndex(t => text.bookNum === t.bookNum);
      if (index !== -1) {
        this._checkingTexts.splice(index, 1);
      }
    }
  }
}
