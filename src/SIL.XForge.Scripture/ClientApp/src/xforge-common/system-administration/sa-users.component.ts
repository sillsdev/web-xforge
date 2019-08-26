import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, HostBinding, OnInit } from '@angular/core';
import { User } from 'realtime-server/lib/common/models/user';
import { BehaviorSubject } from 'rxjs';
import { UserDoc } from 'xforge-common/models/user-doc';
import { environment } from '../../environments/environment';
import { DataLoadingComponent } from '../data-loading-component';
import { ProjectDoc } from '../models/project-doc';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { QueryParameters, QueryResults } from '../realtime.service';
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
      this.userService.onlineSearch(this.searchTerm$, this.queryParameters$, this.reload$),
      async searchResults => {
        await this.loadSearchResults(searchResults);
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

  /** Process the query for users into Rows that can be displayed. */
  private async loadSearchResults(users: QueryResults<UserDoc>) {
    this.loadingStarted();
    const projectDocs = await this.getUserProjectDocs(users);
    this.userRows = users.docs.map(
      userDoc =>
        ({
          id: userDoc.id,
          user: userDoc.data,
          projectDocs: userDoc.data.sites[environment.siteId].projects.map(id => projectDocs.get(id))
        } as Row)
    );
    this.totalRecordCount = users.totalPagedCount;
    this.loadingFinished();
  }

  /** Get project docs for each project associated with each user, keyed by project id. */
  private async getUserProjectDocs(userDocs: QueryResults<UserDoc>) {
    const userProjectIds = userDocs.docs
      .map(userDoc => userDoc.data.sites[environment.siteId].projects)
      // Flatten
      .reduce((accumulator, moreProjectIds) => accumulator.concat(moreProjectIds), []);
    const uniqueUserProjectIds = Array.from(new Set<string>(userProjectIds));
    const projectDocs = await this.projectService.onlineGetMany(uniqueUserProjectIds);
    const lookup = new Map<string, ProjectDoc>();
    projectDocs.forEach(projectDoc => lookup.set(projectDoc.id, projectDoc));
    return lookup;
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
