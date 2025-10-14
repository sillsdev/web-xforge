import { Component, DestroyRef, OnInit } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { filter, switchMap, tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../core/paratext.service';
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
  readonly paratextMemberNotConnected?: boolean;
}

export interface InviteeStatus {
  email: string;
  role: string;
  expired: boolean;
}

interface ProjectUserLists {
  userType: UserType;
  rows: Row[];
}

export enum UserType {
  Paratext = 'paratext',
  Guest = 'guest'
}

@Component({
  selector: 'app-collaborators',
  templateUrl: './collaborators.component.html',
  styleUrls: ['./collaborators.component.scss'],
  standalone: false
})
export class CollaboratorsComponent extends DataLoadingComponent implements OnInit {
  userInviteForm = new UntypedFormGroup({
    email: new UntypedFormControl('', [XFValidators.email])
  });
  isAppOnline = true;

  private projectDoc?: SFProjectProfileDoc;
  private _userRows?: Row[];

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly paratextService: ParatextService,
    private readonly userService: UserService,
    readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly dialogService: DialogService,
    readonly urls: ExternalUrlService,
    private destroyRef: DestroyRef
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

  get projectUsers(): ProjectUserLists[] {
    return [
      { userType: UserType.Paratext, rows: this._userRows?.filter(u => isParatextRole(u.role)) ?? [] },
      { userType: UserType.Guest, rows: this._userRows?.filter(u => !isParatextRole(u.role)) ?? [] }
    ];
  }

  get tableColumns(): string[] {
    const columns: string[] = ['avatar', 'name', 'questions_permission', 'audio_permission', 'role', 'more'];
    return this.projectDoc?.data?.checkingConfig.checkingEnabled
      ? columns
      : columns.filter(s => s !== 'questions_permission' && s !== 'audio_permission');
  }

  ngOnInit(): void {
    this.onlineStatusService.onlineStatus$
      .pipe(
        tap(isOnline => (this.isAppOnline = isOnline)),
        filter(isOnline => isOnline),
        switchMap(() => this.activatedProject.changes$),
        filterNullish(),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(async projectDoc => {
        this.projectDoc = projectDoc;
        this.loadingStarted();
        try {
          await this.loadUsers();
        } finally {
          this.loadingFinished();
        }
      });
  }

  isCurrentUser(userRow: Row): boolean {
    return userRow.id === this.userService.currentUserId;
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
    const otherParatextMemberRows: Row[] = [];
    const inviteeRows: Row[] = [];

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
      const paratextMembersNotOnProject =
        (await this.paratextService.getProjects())
          ?.find(p => p.paratextId === project.paratextId)
          ?.members.filter(m => !m.connectedToProject) ?? [];
      otherParatextMemberRows.push(
        ...paratextMembersNotOnProject.map(
          m => ({ id: '', role: m.role, user: { displayName: m.username }, paratextMemberNotConnected: true }) as Row
        )
      );
    } catch {
      this.noticeService.show(this.i18n.translateStatic('collaborators.problem_loading_paratext_users'));
    }

    try {
      inviteeRows.push(
        ...(await this.projectService.onlineInvitedUsers(this.projectId)).map(
          invitee =>
            ({
              id: '',
              user: { email: invitee.email },
              role: invitee.role,
              inviteeStatus: invitee
            }) as Row
        )
      );
    } catch {
      this.noticeService.show(this.i18n.translateStatic('collaborators.problem_loading_invited_users'));
    }

    this._userRows = this.sortUsers(userRows, otherParatextMemberRows, inviteeRows);
  }

  private sortUsers(projectUsers: Row[], paratextMembersNotConnected: Row[], invitees: Row[]): Row[] {
    // Administrators, Translators, Consultants, Observers, Community Checkers, Commenters, SF Observers, None
    const userRoles: SFProjectRole[] = Object.values(SFProjectRole).filter(r => r !== SFProjectRole.None);
    const sortedRows: Row[] = [];
    for (const role of userRoles) {
      const rowsForRole = projectUsers.filter(u => u.role === role).sort(this.sortByName);
      sortedRows.push(...rowsForRole);
    }

    for (const role of userRoles) {
      const paratextMembers = paratextMembersNotConnected.filter(u => u.role === role).sort(this.sortByName);
      sortedRows.push(...paratextMembers);
    }

    for (const role of userRoles) {
      const inviteeRows = invitees.filter(u => u.role === role).sort(this.sortByName);
      sortedRows.push(...inviteeRows);
    }

    return sortedRows;
  }

  private sortByName(a: Row, b: Row): number {
    // Sort by display name, default to email
    return (a.user.displayName ?? a.user.email ?? '').localeCompare(b.user.displayName ?? b.user.email ?? '');
  }
}
