import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, HostBinding, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NoticeService } from 'xforge-common/notice.service';
import { environment } from '../../environments/environment';
import { ProjectDoc } from '../models/project-doc';
import { User } from '../models/user';
import { ProjectService } from '../project.service';
import { QueryParameters } from '../realtime.service';
import { SubscriptionDisposable } from '../subscription-disposable';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';

interface Row {
  readonly id: string;
  readonly user: User;
  readonly active: boolean;
  readonly projectDocs: ProjectDoc[];
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
  private readonly queryParameters$: BehaviorSubject<QueryParameters>;
  private readonly reload$: BehaviorSubject<void>;

  constructor(
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly userService: UserService,
    private readonly projectService: ProjectService
  ) {
    super();
    this.searchTerm$ = new BehaviorSubject<string>('');
    this.queryParameters$ = new BehaviorSubject<QueryParameters>(this.getQueryParameters());
    this.reload$ = new BehaviorSubject<void>(null);
  }

  get isLoading(): boolean {
    return this.userRows == null;
  }

  ngOnInit() {
    this.noticeService.loadingStarted();
    this.subscribe(
      this.userService.onlineSearch(this.searchTerm$, this.queryParameters$, this.reload$),
      async searchResults => {
        this.noticeService.loadingStarted();
        const projectDocs = new Map<string, ProjectDoc>();
        for (const userDoc of searchResults.docs) {
          for (const projectId of userDoc.data.sites[environment.siteId].projects) {
            projectDocs.set(projectId, null);
          }
        }
        const projectDocArray = await this.projectService.onlineGetMany(Array.from(projectDocs.keys()));
        for (const projectDoc of projectDocArray) {
          projectDocs.set(projectDoc.id, projectDoc);
        }
        this.userRows = searchResults.docs.map(
          userDoc =>
            ({
              id: userDoc.id,
              user: userDoc.data,
              active: true,
              projectDocs: userDoc.data.sites[environment.siteId].projects.map(id => projectDocs.get(id))
            } as Row)
        );
        this.length = searchResults.totalPagedCount;
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
    this.queryParameters$.next(this.getQueryParameters());
  }

  removeUser(userId: string, user: User): void {
    const dialogConfig: MdcDialogConfig<SaDeleteUserDialogData> = {
      data: {
        user
      }
    };
    this.dialogRef = this.dialog.open(SaDeleteDialogComponent, dialogConfig);
    this.dialogRef.afterClosed().subscribe(confirmation => {
      if (confirmation.toLowerCase() === 'confirmed') {
        this.deleteUser(userId);
      }
    });
  }

  private async deleteUser(userId: string) {
    await this.userService.onlineDelete(userId);
    this.reload$.next(null);
  }

  private getQueryParameters(): QueryParameters {
    return {
      sort: { name: 1 },
      skip: this.pageIndex * this.pageSize,
      limit: this.pageSize
    };
  }
}
