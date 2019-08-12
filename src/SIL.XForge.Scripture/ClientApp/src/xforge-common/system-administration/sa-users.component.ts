import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, HostBinding, OnInit } from '@angular/core';
import { User } from 'realtime-server/lib/common/models/user';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataLoadingComponent } from '../data-loading-component';
import { ProjectDoc } from '../models/project-doc';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { QueryParameters, QueryResults } from '../realtime.service';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';
import { UserDoc } from 'xforge-common/models/user-doc';

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

  uninviteProjectUser(emailToUninvite: string): void {
    this.projectService.onlineUninviteUser('some-project-id', emailToUninvite);
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

  private async loadSearchResults(searchResults: QueryResults<UserDoc>) {
    this.loadingStarted();
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

    // TODO Probably some other way
    for (const projectId of projectDocs.keys()) {
      const invitedEmailAddresses = await this.projectService.onlineInvitedUsers(projectId);
      if (invitedEmailAddresses != null) {
        const invitees: Row[] = invitedEmailAddresses.map(invitee => {
          return {
            id: '',
            user: { email: invitee } as User,
            active: false
            // TODO projectDocs:
          } as Row;
        });
        // TODO this.length+=...
        this.userRows = this.userRows.concat(invitees);
      }
    }

    this.loadingFinished();
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

// TODO handle uninviting user from a *specific* project, since they could be invited to many.
// TODO handle uninviting an existing user without deleting that user.
// TODO update collab user list after an invitation is sent.
// TODO update collab user list after uninviting
// TODO update sa user list after uninviting.
// TODO test that invitees from multiple projects all show up in the list.
