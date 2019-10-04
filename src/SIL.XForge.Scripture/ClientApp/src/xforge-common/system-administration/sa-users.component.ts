import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, HostBinding, OnInit } from '@angular/core';
import { User } from 'realtime-server/lib/common/models/user';
import { obj } from 'realtime-server/lib/common/utils/obj-path';
import { BehaviorSubject } from 'rxjs';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { environment } from '../../environments/environment';
import { DataLoadingComponent } from '../data-loading-component';
import { ProjectDoc } from '../models/project-doc';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { QueryParameters } from '../query-parameters';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';

interface Row {
  readonly id: string;
  readonly user: User;
  readonly projectDocs: ProjectDoc[];
}

@Component({
  selector: 'app-sa-users',
  templateUrl: './sa-users.component.html',
  styleUrls: ['./sa-users.component.scss']
})
export class SaUsersComponent extends DataLoadingComponent implements OnInit {
  @HostBinding('class') classes = 'flex-column';

  totalRecordCount: number = 0;
  pageIndex: number = 0;
  pageSize: number = 50;

  userRows: Row[];

  private dialogRef: MdcDialogRef<SaDeleteDialogComponent>;
  private readonly searchTerm$: BehaviorSubject<string>;
  private readonly queryParameters$: BehaviorSubject<QueryParameters>;
  private readonly reload$: BehaviorSubject<void>;

  constructor(
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    private readonly userService: UserService,
    private readonly projectService: ProjectService
  ) {
    super(noticeService);
    this.searchTerm$ = new BehaviorSubject<string>('');
    this.queryParameters$ = new BehaviorSubject<QueryParameters>(this.getQueryParameters());
    this.reload$ = new BehaviorSubject<void>(null);
  }

  get isLoading(): boolean {
    return this.userRows == null;
  }

  ngOnInit() {
    this.loadingStarted();
    this.subscribe(
      this.userService.onlineQuery(this.searchTerm$, this.queryParameters$, this.reload$),
      async searchResults => {
        // Process the query for users into Rows that can be displayed.
        this.loadingStarted();
        const projectDocs = await this.getUserProjectDocs(searchResults);
        this.userRows = searchResults.docs.map(
          userDoc =>
            ({
              id: userDoc.id,
              user: userDoc.data,
              projectDocs: userDoc.data.sites[environment.siteId].projects.map(id => projectDocs.get(id))
            } as Row)
        );
        this.totalRecordCount = searchResults.unpagedCount;
        this.loadingFinished();
      }
    );
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

  /** Get project docs for each project associated with each user, keyed by project id. */
  private async getUserProjectDocs(userDocs: RealtimeQuery<UserDoc>) {
    const projectDocsLookup = new Map<string, ProjectDoc>();
    for (const userDoc of userDocs.docs) {
      for (const projectId of userDoc.data.sites[environment.siteId].projects) {
        projectDocsLookup.set(projectId, null);
      }
    }

    const projectDocs = await this.projectService.onlineGetMany(Array.from(projectDocsLookup.keys()));
    for (const projectDoc of projectDocs) {
      projectDocsLookup.set(projectDoc.id, projectDoc);
    }
    return projectDocsLookup;
  }

  private async deleteUser(userId: string) {
    await this.userService.onlineDelete(userId);
    this.reload$.next(null);
  }

  private getQueryParameters(): QueryParameters {
    return {
      $sort: { [obj<User>().pathStr(u => u.name)]: 1 },
      $skip: this.pageIndex * this.pageSize,
      $limit: this.pageSize
    };
  }
}
