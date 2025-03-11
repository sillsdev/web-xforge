import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { getQuietDestroyRef } from 'xforge-common/utils';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { RolesAndPermissionsDialogComponent } from '../roles-and-permissions/roles-and-permissions-dialog.component';

interface UserInfo {
  displayName?: string;
  avatarUrl?: string;
  email?: string;
}

interface Row {
  readonly id: string;
  readonly user: UserInfo;
  readonly role: string;
  readonly inviteeStatus?: InviteeStatus;
  readonly allowCreatingQuestions: boolean;
  readonly canManageAudio: boolean;
  readonly userEligibleForQuestionPermission: boolean;
}

export interface InviteeStatus {
  email: string;
  role: string;
  expired: boolean;
}

@Component({
  selector: 'app-collaborators',
  templateUrl: './collaborators.component.html',
  styleUrls: ['./collaborators.component.scss']
})
export class CollaboratorsComponent extends DataLoadingComponent implements OnInit, AfterViewInit {
  userInviteForm = new UntypedFormGroup({
    email: new UntypedFormControl('', [XFValidators.email])
  });
  filterForm: UntypedFormGroup = new UntypedFormGroup({ filter: new UntypedFormControl('') });
  isAppOnline = true;
  currentTabIndex: number = 0;

  private projectDoc?: SFProjectDoc;
  private term: string = '';
  private _userRows?: Row[];
  private destroyRef = getQuietDestroyRef();

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly dialogService: DialogService,
    readonly urls: ExternalUrlService
  ) {
    super(noticeService);
  }

  get hasEmailError(): boolean {
    return this.userInviteForm.controls.email.hasError('email');
  }

  get isLoading(): boolean {
    return this._userRows == null;
  }

  get projectId(): string {
    return this.projectDoc ? this.projectDoc.id : '';
  }

  get totalUsers(): number {
    return this._userRows == null ? 0 : this._userRows.length;
  }

  get filteredLength(): number {
    if (this.term && this.term.trim()) {
      return this.filteredRowsBySearchTermAndTab.length;
    }
    return this.userRowsForSelectedTab.length;
  }

  get rowsToDisplay(): Row[] {
    return this.term.trim().length === 0 ? this.userRowsForSelectedTab : this.filteredRowsBySearchTermAndTab;
  }

  private get filteredRowsBySearchTermAndTab(): Row[] {
    const term = this.term.trim().toLowerCase();
    return this.userRowsForSelectedTab.filter(
      userRow =>
        userRow.user &&
        (userRow.user.displayName?.toLowerCase().includes(term) ||
          (userRow.role != null && this.i18n.localizeRole(userRow.role).toLowerCase().includes(term)) ||
          userRow.user.email?.toLowerCase().includes(term))
    );
  }

  private get userRowsForSelectedTab(): Row[] {
    if (this._userRows == null) {
      return [];
    }
    switch (this.currentTabIndex) {
      case 1:
        return this._userRows.filter(r => this.hasParatextRole(r));
      case 2:
        return this._userRows.filter(r => !this.hasParatextRole(r));
      default:
        return this._userRows;
    }
  }

  get tableColumns(): string[] {
    const columns: string[] = ['avatar', 'name', 'info', 'questions_permission', 'audio_permission', 'role', 'more'];
    return this.projectDoc?.data?.checkingConfig.checkingEnabled
      ? columns
      : columns.filter(s => s !== 'questions_permission' && s !== 'audio_permission');
  }

  ngOnInit(): void {
    this.loadingStarted();
    this.activatedRoute.params
      .pipe(
        map(params => params['projectId'] as string),
        distinctUntilChanged(),
        filter(projectId => projectId != null),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(async projectId => {
        this.loadingStarted();
        this.projectDoc = await this.projectService.get(projectId);
        this.loadUsers();
        // TODO Clean up the use of nested subscribe()
        this.projectDoc.remoteChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async () => {
          this.loadingStarted();
          try {
            await this.loadUsers();
          } finally {
            this.loadingFinished();
          }
        });
        this.loadingFinished();
      });
    this.onlineStatusService.onlineStatus$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(isOnline => {
      this.isAppOnline = isOnline;
      if (isOnline && this._userRows == null) {
        this.loadingStarted();
        this.loadUsers();
        this.loadingFinished();
      }
    });
  }

  ngAfterViewInit(): void {
    this.onlineStatusService.onlineStatus$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(isOnline => {
      if (isOnline) {
        this.filterForm.enable();
      } else {
        this.filterForm.disable();
        // Workaround for angular/angular#17793 (ExpressionChangedAfterItHasBeenCheckedError after form disabled)
        this.changeDetector.detectChanges();
      }
    });
  }

  isCurrentUser(userRow: Row): boolean {
    return userRow.id === this.userService.currentUserId;
  }

  hasParatextRole(userRow: Row): boolean {
    return isParatextRole(userRow.role);
  }

  updateSearchTerm(target: EventTarget | null): void {
    const termTarget = target as HTMLInputElement;
    if (termTarget?.value != null) {
      this.term = termTarget.value;
    }
  }

  async removeProjectUserClicked(row: Row): Promise<void> {
    const confirmed: boolean = await this.dialogService.confirm(
      this.i18n.translate('collaborators.confirm_remove_user', { user: row.user.displayName }),
      'collaborators.remove_user'
    );
    if (confirmed) {
      this.projectService.onlineRemoveUser(this.projectId, row.id);
    }
  }

  async uninviteProjectUser(emailToUninvite: string): Promise<void> {
    await this.projectService.onlineUninviteUser(this.projectId, emailToUninvite);
    this.loadUsers();
  }

  onInvitationSent(): void {
    this.loadUsers();
  }

  async openRolesDialog(row: Row): Promise<void> {
    this.dialogService.openMatDialog(RolesAndPermissionsDialogComponent, {
      data: {
        projectId: this.projectId,
        userId: row.id,
        userProfile: { avatarUrl: row.user.avatarUrl, displayName: row.user.displayName }
      },
      minWidth: '360px',
      maxWidth: '560px',
      width: '90%'
    });
  }

  isAdmin(role: string): boolean {
    return role === SFProjectRole.ParatextAdministrator;
  }

  private async loadUsers(): Promise<void> {
    const project = this.projectDoc?.data;
    if (project == null || project.userRoles == null || !this.isAppOnline) {
      return;
    }

    const userIds = Object.keys(project.userRoles);
    const userProfiles = await Promise.all(userIds.map(userId => this.userService.getProfile(userId)));
    const userRows: Row[] = [];
    for (const [index, userId] of userIds.entries()) {
      const userProfile = userProfiles[index];
      const role = project.userRoles[userId];

      const allowCreatingQuestions =
        SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.Questions, Operation.Create) &&
        SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.Questions, Operation.Edit);

      const canManageAudio =
        SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.TextAudio, Operation.Create) &&
        SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.TextAudio, Operation.Edit) &&
        SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.TextAudio, Operation.Delete);

      userRows.push({
        id: userProfile.id,
        user: userProfile.data || {},
        role,
        allowCreatingQuestions,
        canManageAudio,
        userEligibleForQuestionPermission: isParatextRole(role)
      });
    }

    try {
      const invitees: Row[] = (await this.projectService.onlineInvitedUsers(this.projectId)).map(
        invitee =>
          ({
            id: '',
            user: { email: invitee.email },
            role: invitee.role,
            inviteeStatus: invitee
          }) as Row
      );
      this._userRows = userRows.concat(invitees);
    } catch {
      this.noticeService.show(translate('collaborators.problem_loading_invited_users'));
    }
  }
}
