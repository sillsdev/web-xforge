import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, HostBinding, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NoticeService } from 'xforge-common/notice.service';
import { GetAllParameters } from '../json-api.service';
import { Project } from '../models/project';
import { ProjectUser } from '../models/project-user';
import { User } from '../models/user';
import { SubscriptionDisposable } from '../subscription-disposable';
import { UserService } from '../user.service';
import { nameof } from '../utils';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';

interface Row {
  readonly user: User;
  readonly projects: Project[];
}

@Component({
  selector: 'app-sa-users',
  templateUrl: './sa-users.component.html',
  styleUrls: ['./sa-users.component.scss']
})
export class SaUsersComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  @HostBinding('class') classes = 'flex-column';

  length: number = 0;
  pageIndex: number = 0;
  pageSize: number = 50;

  userRows: Row[];

  private dialogRef: MdcDialogRef<SaDeleteDialogComponent>;
  private readonly searchTerm$: BehaviorSubject<string>;
  private readonly parameters$: BehaviorSubject<GetAllParameters<User>>;
  private readonly reload$: BehaviorSubject<void>;

  constructor(
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly userService: UserService
  ) {
    super();
    this.noticeService.loadingStarted();
    this.searchTerm$ = new BehaviorSubject<string>('');
    this.parameters$ = new BehaviorSubject<GetAllParameters<User>>(this.getParameters());
    this.reload$ = new BehaviorSubject<void>(null);
  }

  get isLoading(): boolean {
    return this.userRows == null;
  }

  ngOnInit() {
    const include = [[nameof<User>('projects'), nameof<ProjectUser>('project')]];
    this.subscribe(
      this.userService.onlineSearch(this.searchTerm$, this.parameters$, this.reload$, include),
      searchResults => {
        this.noticeService.loadingStarted();
        if (searchResults && searchResults.data) {
          this.userRows = searchResults.data.map(user => {
            const projects = searchResults
              .getManyIncluded<ProjectUser>(user.projects)
              .map(pu => searchResults.getIncluded<Project>(pu.project));
            return { user, projects };
          });
          this.length = searchResults.totalPagedCount;
        }
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.noticeService.loadingFinished();
  }

  updateSearchTerm(term: string): void {
    this.searchTerm$.next(term);
  }

  updatePage(pageIndex: number, pageSize: number): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.parameters$.next(this.getParameters());
  }

  removeUser(user: User): void {
    const dialogConfig: MdcDialogConfig<SaDeleteUserDialogData> = {
      data: {
        user
      }
    };
    this.dialogRef = this.dialog.open(SaDeleteDialogComponent, dialogConfig);
    this.dialogRef.afterClosed().subscribe(confirmation => {
      if (confirmation.toLowerCase() === 'confirmed') {
        this.deleteUser(user.id);
      }
    });
  }

  private async deleteUser(userId: string) {
    await this.userService.onlineDelete(userId);
    this.reload$.next(null);
  }

  private getParameters(): GetAllParameters<User> {
    return {
      sort: [{ name: 'active', order: 'descending' }, { name: 'name', order: 'ascending' }],
      pagination: { index: this.pageIndex, size: this.pageSize }
    };
  }
}
