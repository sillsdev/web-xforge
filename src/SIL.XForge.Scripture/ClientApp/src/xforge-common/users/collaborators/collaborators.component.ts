import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, filter, map, switchMap } from 'rxjs/operators';
import { Project } from 'xforge-common/models/project';
import { ProjectUser } from 'xforge-common/models/project-user';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { User } from 'xforge-common/models/user';
import { ProjectUserService } from 'xforge-common/project-user.service';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { XFValidators } from 'xforge-common/xfvalidators';
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
  private project: Project;
  private projectUsers: ProjectUser[];
  private term: string;
  private _userRows: Row[];

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly projectUserService: ProjectUserService,
    private readonly userService: UserService
  ) {
    super();
    this.noticeService.loadingStarted();
  }

  get hasEmailError(): boolean {
    return this.userInviteForm.controls.email.hasError('email');
  }

  get isLinkSharingEnabled(): boolean {
    return this.project && this.project.shareEnabled && this.project.shareLevel === SharingLevel.Anyone;
  }

  get isLoading(): boolean {
    return this._userRows == null;
  }

  get projectId(): string {
    return this.project ? this.project.id : '';
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
    this.noticeService.loadingStarted();
    this.subscribe(
      this.activatedRoute.params.pipe(
        map(params => params['projectId'] as string),
        distinctUntilChanged(),
        filter(projectId => projectId != null),
        switchMap(projectId => this.projectService.get(projectId, [[nameof<Project>('users')]]))
      ),
      r => {
        this.project = r.data;
        if (this.project == null) {
          return;
        }
        this.noticeService.loadingStarted();
        this.projectUsers = r.getManyIncluded<ProjectUser>(this.project.users);
        const userRows: Row[] = new Array(this.projectUsers.length);
        const tasks: Promise<any>[] = [];
        for (let i = 0; i < this.projectUsers.length; i++) {
          const projectUser = this.projectUsers[i];
          const index = i;
          const role = this.projectService.roles.get(projectUser.role);
          const roleName = role ? role.displayName : '';
          tasks.push(
            this.userService
              .getProfile(projectUser.userRef)
              .then(userDoc => (userRows[index] = { id: userDoc.id, user: userDoc.data, roleName, active: true }))
          );
        }
        Promise.all(tasks).then(() => {
          this._userRows = userRows;
          this.noticeService.loadingFinished();
        });
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
    const projectUser = this.projectUsers.find(pu => pu.userRef === userId);
    if (projectUser == null) {
      return;
    }
    this.projectUserService.onlineDelete(projectUser.id);
  }

  private page(rows: Row[]): Row[] {
    const start = this.pageSize * this.pageIndex;
    return rows.slice(start, start + this.pageSize);
  }
}
