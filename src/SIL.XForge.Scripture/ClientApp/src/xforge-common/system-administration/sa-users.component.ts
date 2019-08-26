import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, HostBinding, OnInit } from '@angular/core';
import { Project } from 'realtime-server/lib/common/models/project';
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
  readonly isInvitee: boolean;
  readonly projectDocs: ProjectDoc[];
}

@Component({
  selector: 'app-sa-users',
  templateUrl: './sa-users.component.html',
  styleUrls: ['./sa-users.component.scss']
})
export class SaUsersComponent extends DataLoadingComponent implements OnInit {
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

  uninviteUser(projectId: string, emailToUninvite: string): void {
    this.projectService.onlineUninviteUser(projectId, emailToUninvite);
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

  private async loadSearchResults(users: QueryResults<UserDoc>) {
    this.loadingStarted();
    const projectDocs = await this.getUserProjectDocs(users);
    const projectUserRows = users.docs.map(
      userDoc =>
        ({
          id: userDoc.id,
          user: userDoc.data,
          isInvitee: false,
          projectDocs: userDoc.data.sites[environment.siteId].projects.map(id => projectDocs.get(id))
        } as Row)
    );
    const inviteeRows = await this.getInviteeRows(Array.from(projectDocs.values()));
    this.userRows = projectUserRows.concat(inviteeRows);
    this.length = users.totalPagedCount + inviteeRows.length;
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

  private async getInviteeRows(projectDocs: ProjectDoc<Project>[]) {
    let invitees: Array<Row> = [];
    for (const projectDoc of projectDocs.values()) {
      const invitedEmailAddresses = await this.projectService.onlineInvitedUsers(projectDoc.id);
      if (invitedEmailAddresses != null) {
        const projectInvitees: Row[] = invitedEmailAddresses.map(invitee => {
          return {
            id: '',
            user: { email: invitee } as User,
            isInvitee: true,
            // Not showing all projects an email address is invited to,
            // but one per row, so they can be uninvited individually.
            projectDocs: [projectDoc] as ProjectDoc[]
          } as Row;
        });
        invitees = invitees.concat(projectInvitees);
      }
    }
    return invitees;
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
