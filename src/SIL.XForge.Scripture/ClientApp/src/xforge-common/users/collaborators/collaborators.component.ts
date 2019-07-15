import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, filter, map, switchMap } from 'rxjs/operators';
import { Project } from 'xforge-common/models/project';
import { ProjectUser } from 'xforge-common/models/project-user';
import { User } from 'xforge-common/models/user';
import { ProjectUserService } from 'xforge-common/project-user.service';
import { nameof } from 'xforge-common/utils';
import { XFValidators } from 'xforge-common/xfvalidators';
import { NoticeService } from '../../notice.service';
import { ProjectService } from '../../project.service';
import { SubscriptionDisposable } from '../../subscription-disposable';

interface Row {
  readonly user: User;
  readonly roleName: string;
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
  private projectUsers: ProjectUser[];
  private term: string;
  private _userRows: Row[];

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly projectUserService: ProjectUserService
  ) {
    super();
    this.noticeService.loadingStarted();
  }

  get inviteDisabled(): boolean {
    return this.userInviteForm.invalid || !this.userInviteForm.value.email || this.inviteButtonClicked;
  }

  get hasEmailError(): boolean {
    return this.userInviteForm.controls.email.hasError('email');
  }

  get isLoading(): boolean {
    return this._userRows == null;
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
                (userRow.user.email && userRow.user.email.includes(this.term)) ||
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
        switchMap(projectId =>
          this.projectService.get(projectId, [[nameof<Project>('users'), nameof<ProjectUser>('user')]])
        )
      ),
      r => {
        this.noticeService.loadingStarted();
        const project = r.data;
        if (project == null) {
          return;
        }
        this.projectUsers = r.getManyIncluded<ProjectUser>(project.users);
        this._userRows = r.getManyIncluded<ProjectUser>(project.users).map(pu => {
          const user = r.getIncluded<User>(pu.user);
          const role = this.projectService.roles.get(pu.role);
          const roleName = role ? role.displayName : '';
          return { user, roleName };
        });
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.noticeService.loadingFinished();
  }

  updateSearchTerm(term: string): void {
    this.term = term;
  }

  updatePage(pageIndex: number, pageSize: number): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
  }

  removeProjectUser(user: User): void {
    const projectUser = this.projectUsers.find(pu => pu.user != null && pu.user.id === user.id);
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
