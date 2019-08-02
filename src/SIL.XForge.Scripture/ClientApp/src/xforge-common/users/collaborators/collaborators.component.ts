import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { User } from 'xforge-common/models/user';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { ProjectDoc } from '../../models/project-doc';
import { NoticeService } from '../../notice.service';
import { ProjectService } from '../../project.service';
import { SubscriptionDisposable } from '../../subscription-disposable';

interface Row {
  readonly id: string;
  readonly user: User;
  readonly roleName: string;
  readonly active: boolean;
}

@Component({
  selector: 'app-collaborators',
  templateUrl: './collaborators.component.html',
  styleUrls: ['./collaborators.component.scss']
})
export class CollaboratorsComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  userInviteForm = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  pageIndex: number = 0;
  pageSize: number = 50;

  private inviteButtonClicked = false;
  private projectDoc: ProjectDoc;
  private term: string;
  private _userRows: Row[];

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly userService: UserService
  ) {
    super();
    this.noticeService.loadingStarted();
  }

  get hasEmailError(): boolean {
    return this.userInviteForm.controls.email.hasError('email');
  }

  get isLinkSharingEnabled(): boolean {
    return (
      this.projectDoc &&
      this.projectDoc.data &&
      this.projectDoc.data.shareEnabled &&
      this.projectDoc.data.shareLevel === SharingLevel.Anyone
    );
  }

  get isLoading(): boolean {
    return this._userRows == null;
  }

  get projectId(): string {
    return this.projectDoc ? this.projectDoc.id : '';
  }

  get totalUsers(): number {
    return this._userRows.length;
  }

  get userRows(): Row[] {
    if (this.isLoading) {
      return [];
    }

    const rows: Row[] =
      this.term && this.term.trim()
        ? this._userRows.filter(userRow => {
            return (
              userRow.user &&
              ((userRow.user.name && userRow.user.name.includes(this.term)) ||
                (userRow.roleName && userRow.roleName.includes(this.term)))
            );
          })
        : this._userRows;

    return this.page(rows);
  }

  ngOnInit() {
    this.subscribe(
      this.activatedRoute.params.pipe(
        map(params => params['projectId'] as string),
        distinctUntilChanged(),
        filter(projectId => projectId != null)
      ),
      async projectId => {
        this.noticeService.loadingStarted();
        this.projectDoc = await this.projectService.get(projectId);
        this.loadUsers();
        this.subscribe(this.projectDoc.remoteChanges$, async () => {
          this.noticeService.loadingStarted();
          try {
            await this.loadUsers();
          } finally {
            this.noticeService.loadingFinished();
          }
        });
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.noticeService.loadingFinished();
  }

  isCurrentUser(userRow: Row): boolean {
    return userRow.id === this.userService.currentUserId;
  }

  updateSearchTerm(term: string): void {
    this.term = term;
  }

  updatePage(pageIndex: number, pageSize: number): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
  }

  removeProjectUser(userId: string): void {
    this.projectService.onlineRemoveUser(this.projectId, userId);
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
          .then(userDoc => (userRows[index] = { id: userDoc.id, user: userDoc.data, roleName, active: true }))
      );
    }
    await Promise.all(tasks);
    this._userRows = userRows;
  }
}
