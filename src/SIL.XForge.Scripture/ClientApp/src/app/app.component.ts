import { MdcDialog, MdcSelect, MdcTopAppBar } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { combineLatest, from, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, switchMap, tap } from 'rxjs/operators';
import { AccountService } from 'xforge-common/account.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component.js';
import { LocationService } from 'xforge-common/location.service';
import { Site } from 'xforge-common/models/site';
import { SystemRole } from 'xforge-common/models/system-role';
import { AuthType, getAuthType, User } from 'xforge-common/models/user';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';
import { HelpHeroService } from './core/help-hero.service';
import { SFProjectDoc } from './core/models/sfproject-doc';
import { canTranslate, SFProjectRoles } from './core/models/sfproject-roles';
import { TextInfo } from './core/models/text-info';
import { SFProjectService } from './core/sfproject.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SFAdminAuthGuard } from './shared/sfadmin-auth.guard';

export const CONNECT_PROJECT_OPTION = '*connect-project*';

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

  private currentUserDoc: UserDoc;
  private currentUserAuthType: AuthType;
  private _projectSelect: MdcSelect;
  private projectDeletedDialogRef: any;
  private _topAppBar: MdcTopAppBar;
  private selectedProjectDoc: SFProjectDoc;
  private selectedProjectDeleteSub: Subscription;
  private _isDrawerPermanent: boolean = true;
  private selectedProjectRole: SFProjectRoles;

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
  }

  get issueMailTo(): string {
    return encodeURI('mailto:' + environment.issueEmail + '?subject=Scripture Forge v2 Issue');
  }

  @ViewChild('topAppBar')
  set topAppBar(value: MdcTopAppBar) {
    this._topAppBar = value;
    this.setTopAppBarVariant();
  }

  get projectSelect(): MdcSelect {
    return this._projectSelect;
  }

  @ViewChild(MdcSelect)
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
    return (
      this.selectedProjectDoc != null &&
      this.selectedProjectDoc.isLoaded &&
      this.selectedProjectDoc.data.translateEnabled != null &&
      this.selectedProjectDoc.data.translateEnabled &&
      canTranslate(this.selectedProjectRole)
    );
  }

  get translateTexts(): TextInfo[] {
    return this.texts.filter(t => t.hasSource);
  }

  get isCheckingEnabled(): boolean {
    return (
      this.selectedProjectDoc != null &&
      this.selectedProjectDoc.isLoaded &&
      this.selectedProjectDoc.data.checkingEnabled != null &&
      this.selectedProjectDoc.data.checkingEnabled
    );
  }

  get checkingTexts(): TextInfo[] {
    return this.texts;
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

  private get texts(): TextInfo[] {
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
      this.subscribe(combineLatest(projectDocs$, projectId$), ([projectDocs, projectId]) => {
        this.projectDocs = projectDocs;
        // if the project deleted dialog is displayed, don't do anything
        if (this.projectDeletedDialogRef != null) {
          return;
        }
        const selectedProjectDoc = projectId == null ? undefined : this.projectDocs.find(p => p.id === projectId);

        // check if the currently selected project has been deleted
        if (projectId != null && selectedProjectDoc != null && !selectedProjectDoc.isLoaded) {
          this.currentUserDoc
            .submitJson0Op(op => op.unset(u => u.sites[environment.siteId].currentProjectId))
            .then(() => this.navigateToStart());
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
            : (this.selectedProjectDoc.data.userRoles[this.currentUserDoc.id] as SFProjectRoles);
        if (this.selectedProjectDoc == null || !this.selectedProjectDoc.isLoaded) {
          return;
        }

        this.selectedProjectDeleteSub = this.selectedProjectDoc.delete$.subscribe(() => {
          if (this.currentUserDoc.data.sites[environment.siteId].currentProjectId != null) {
            this.showProjectDeletedDialog();
          } else {
            this.navigateToStart();
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

        if (this.site.currentProjectId !== this.selectedProjectDoc.id) {
          this.currentUserDoc.submitJson0Op(op =>
            op.set(u => u.sites[environment.siteId].currentProjectId, this.selectedProjectDoc.id)
          );
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

  editName(currentName: string): void {
    const dialogRef = this.accountService.openNameDialog(currentName, false);
    dialogRef.afterClosed().subscribe(response => {
      this.currentUserDoc.submitJson0Op(op => op.set(u => u.name, response as string));
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

  private async showProjectDeletedDialog(): Promise<void> {
    await this.currentUserDoc.submitJson0Op(op => op.unset(u => u.sites[environment.siteId].currentProjectId));
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
}
