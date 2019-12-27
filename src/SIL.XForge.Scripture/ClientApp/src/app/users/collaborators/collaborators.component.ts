import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { PageEvent } from '@angular/material/paginator';
import { ActivatedRoute } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService, TextAroundTemplate } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
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
  readonly roleName: string;
  readonly isInvitee: boolean;
}

@Component({
  selector: 'app-collaborators',
  templateUrl: './collaborators.component.html',
  styleUrls: ['./collaborators.component.scss']
})
export class CollaboratorsComponent extends DataLoadingComponent implements OnInit {
  userInviteForm = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  pageIndex: number = 0;
  pageSize: number = 50;
  rolesText?: TextAroundTemplate = this.i18n.translateTextAroundTemplateTags(
    'collaborators.change_roles_and_permissions'
  );

  private projectDoc?: SFProjectDoc;
  private term: string = '';
  private _userRows?: Row[];

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    readonly i18n: I18nService
  ) {
    super(noticeService);
  }

  get hasEmailError(): boolean {
    return this.userInviteForm.controls.email.hasError('email');
  }

  get isLinkSharingEnabled(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.checkingConfig.checkingEnabled &&
      this.projectDoc.data.checkingConfig.shareEnabled &&
      this.projectDoc.data.checkingConfig.shareLevel === CheckingShareLevel.Anyone
    );
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
    return this._userRows.filter(userRow => {
      return (
        userRow.user &&
        ((userRow.user.displayName && userRow.user.displayName.toLowerCase().includes(term)) ||
          (userRow.roleName && userRow.roleName.toLowerCase().includes(term)) ||
          (userRow.user.email && userRow.user.email.toLowerCase().includes(term)))
      );
    });
  }

  get userRows(): Row[] {
    if (this._userRows == null) {
      return [];
    }

    const term = this.term && this.term.trim().toLowerCase();
    const rows: Row[] = term ? this.filteredRows : this._userRows;

    return this.page(rows);
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
  }

  isCurrentUser(userRow: Row): boolean {
    return userRow.id === this.userService.currentUserId;
  }

  updateSearchTerm(term: string): void {
    this.term = term;
    if (term.trim().length > 0) {
      this.pageIndex = 0;
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

  private page(rows: Row[]): Row[] {
    const start = this.pageSize * this.pageIndex;
    return rows.slice(start, start + this.pageSize);
  }

  private async loadUsers(): Promise<void> {
    if (this.projectDoc == null || this.projectDoc.data == null || this.projectDoc.data.userRoles == null) {
      return;
    }

    const users = Object.keys(this.projectDoc.data.userRoles);
    const userRows: Row[] = new Array(users.length);
    const tasks: Promise<any>[] = [];
    for (let i = 0; i < users.length; i++) {
      const userId = users[i];
      const index = i;
      const role = this.projectService.roles.get(this.projectDoc.data.userRoles[userId]);
      const roleName = role ? role.displayName : '';
      tasks.push(
        this.userService
          .getProfile(userId)
          .then(
            userProfileDoc =>
              (userRows[index] = { id: userProfileDoc.id, user: userProfileDoc.data || {}, roleName, isInvitee: false })
          )
      );
    }
    await Promise.all(tasks);

    try {
      const invitees: Row[] = (await this.projectService.onlineInvitedUsers(this.projectId)).map(invitee => {
        return {
          id: '',
          user: { email: invitee },
          roleName: '',
          isInvitee: true
        } as Row;
      });
      this._userRows = userRows.concat(invitees);
    } catch {
      this.noticeService.show('There was a problem loading the list of invited users.');
    }
  }
}
