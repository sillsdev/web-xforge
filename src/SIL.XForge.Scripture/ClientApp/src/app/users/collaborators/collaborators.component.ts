import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { PageEvent } from '@angular/material/paginator';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { hasParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService, TextAroundTemplate } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';

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
  readonly userEligibleForQuestionPermission: boolean;
  readonly canHaveQuestionPermissionRevoked: boolean;
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
  userInviteForm = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  pageIndex: number = 0;
  pageSize: number = 50;
  filterForm: FormGroup = new FormGroup({ filter: new FormControl('') });
  isAppOnline = true;

  private projectDoc?: SFProjectDoc;
  private term: string = '';
  private _userRows?: Row[];

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    readonly i18n: I18nService,
    private readonly pwaService: PwaService,
    private readonly changeDetector: ChangeDetectorRef
  ) {
    super(noticeService);
  }

  get rolesText(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('collaborators.change_roles_and_permissions');
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
      return this.filteredRows.length;
    }
    return this.totalUsers;
  }

  get filteredRows(): Row[] {
    if (this._userRows == null) {
      return [];
    }
    const term = this.term.trim().toLowerCase();
    return this._userRows.filter(
      userRow =>
        userRow.user &&
        (userRow.user.displayName?.toLowerCase().includes(term) ||
          (userRow.role != null && this.i18n.localizeRole(userRow.role).toLowerCase().includes(term)) ||
          userRow.user.email?.toLowerCase().includes(term))
    );
  }

  get userRows(): Row[] {
    if (this._userRows == null) {
      return [];
    }

    const term = this.term && this.term.trim().toLowerCase();
    const rows: Row[] = term ? this.filteredRows : this._userRows;

    return this.page(rows);
  }

  get tableColumns(): string[] {
    const columns = ['avatar', 'name', 'role', 'questions_permission', 'remove'];
    return this.projectDoc?.data?.checkingConfig.checkingEnabled
      ? columns
      : columns.filter(s => s !== 'questions_permission');
  }

  ngOnInit(): void {
    this.loadingStarted();
    this.subscribe(
      this.activatedRoute.params.pipe(
        map(params => params['projectId'] as string),
        distinctUntilChanged(),
        filter(projectId => projectId != null)
      ),
      async projectId => {
        this.loadingStarted();
        this.projectDoc = await this.projectService.get(projectId);
        this.loadUsers();
        this.subscribe(this.projectDoc.remoteChanges$, async () => {
          this.loadingStarted();
          try {
            await this.loadUsers();
          } finally {
            this.loadingFinished();
          }
        });
        this.loadingFinished();
      }
    );
    this.subscribe(this.pwaService.onlineStatus, isOnline => {
      this.isAppOnline = isOnline;
      if (isOnline && this._userRows == null) {
        this.loadingStarted();
        this.loadUsers();
        this.loadingFinished();
      }
    });
  }

  ngAfterViewInit(): void {
    this.subscribe(this.pwaService.onlineStatus, isOnline => {
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

  updateSearchTerm(target: EventTarget | null): void {
    const termTarget = target as HTMLInputElement;
    if (termTarget?.value != null) {
      this.term = termTarget.value;
      if (termTarget.value.trim().length > 0) {
        this.pageIndex = 0;
      }
    }
  }

  updatePaginatorData(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  removeProjectUser(userId: string): void {
    this.projectService.onlineRemoveUser(this.projectId, userId);
  }

  async uninviteProjectUser(emailToUninvite: string): Promise<void> {
    await this.projectService.onlineUninviteUser(this.projectId, emailToUninvite);
    this.loadUsers();
  }

  onInvitationSent() {
    this.loadUsers();
  }

  async toggleQuestionPermission(row: Row) {
    if (!this.isAppOnline || !row.canHaveQuestionPermissionRevoked) {
      return;
    }
    const permissions = new Set((this.projectDoc?.data?.userPermissions || {})[row.id] || []);
    [
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Edit)
    ].forEach(right => (row.allowCreatingQuestions ? permissions.delete(right) : permissions.add(right)));

    await this.projectService.onlineSetUserProjectPermissions(this.projectId, row.id, Array.from(permissions));
    this.loadUsers();
  }

  private page(rows: Row[]): Row[] {
    const start = this.pageSize * this.pageIndex;
    return rows.slice(start, start + this.pageSize);
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

      const canHaveQuestionPermissionRevoked = !(
        SF_PROJECT_RIGHTS.roleHasRight(role, SFProjectDomain.Questions, Operation.Create) &&
        SF_PROJECT_RIGHTS.roleHasRight(role, SFProjectDomain.Questions, Operation.Edit)
      );

      userRows.push({
        id: userProfile.id,
        user: userProfile.data || {},
        role,
        allowCreatingQuestions,
        canHaveQuestionPermissionRevoked,
        userEligibleForQuestionPermission: hasParatextRole(role)
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
          } as Row)
      );
      this._userRows = userRows.concat(invitees);
    } catch {
      this.noticeService.show(translate('collaborators.problem_loading_invited_users'));
    }
  }
}
