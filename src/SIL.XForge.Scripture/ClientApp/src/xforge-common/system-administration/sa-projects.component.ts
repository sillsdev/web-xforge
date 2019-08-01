import { Component, HostBinding, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NoticeService } from 'xforge-common/notice.service';
import { ProjectDoc } from '../models/project-doc';
import { NONE_ROLE, ProjectRole } from '../models/project-role';
import { ProjectService } from '../project.service';
import { QueryParameters } from '../realtime.service';
import { SubscriptionDisposable } from '../subscription-disposable';
import { UserService } from '../user.service';

class Row {
  isUpdatingRole: boolean = false;

  constructor(public readonly projectDoc: ProjectDoc, public projectRole: ProjectRole) {}

  get id(): string {
    return this.projectDoc.id;
  }

  get isMember(): boolean {
    return this.projectRole !== NONE_ROLE;
  }

  get name(): string {
    return this.projectDoc.data.projectName;
  }

  get tasks(): string {
    return this.projectDoc.taskNames.join(', ');
  }
}

@Component({
  selector: 'app-sa-projects',
  templateUrl: './sa-projects.component.html',
  styleUrls: ['./sa-projects.component.scss']
})
export class SaProjectsComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  @HostBinding('class') classes = 'flex-column';

  rows: Row[];

  length: number = 0;
  pageIndex: number = 0;
  pageSize: number = 50;

  private projectDocs: ProjectDoc[];

  private readonly searchTerm$: BehaviorSubject<string>;
  private readonly queryParameters$: BehaviorSubject<QueryParameters>;

  constructor(
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly userService: UserService
  ) {
    super();
    this.searchTerm$ = new BehaviorSubject<string>('');
    this.queryParameters$ = new BehaviorSubject<QueryParameters>(this.getQueryParameters());
  }

  get isLoading(): boolean {
    return this.projectDocs == null;
  }

  get projectRoles(): ProjectRole[] {
    return Array.from(this.projectService.roles.values());
  }

  ngOnInit() {
    this.noticeService.loadingStarted();
    this.subscribe(this.projectService.onlineSearch(this.searchTerm$, this.queryParameters$), searchResults => {
      this.noticeService.loadingStarted();
      this.projectDocs = searchResults.docs;
      this.length = searchResults.totalPagedCount;
      this.generateRows();
      this.noticeService.loadingFinished();
    });
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

  async updateRole(row: Row, projectRole: ProjectRole): Promise<void> {
    row.isUpdatingRole = true;
    if (row.projectRole === NONE_ROLE) {
      // add user to project
      await this.projectService.onlineAddCurrentUser(row.id, projectRole.role);
    } else if (projectRole === NONE_ROLE) {
      // remove user from project
      await this.projectService.onlineRemoveUser(row.id, this.userService.currentUserId);
    } else {
      // update role in project
      await this.projectService.onlineUpdateCurrentUserRole(row.id, projectRole.role);
    }
    row.projectRole = projectRole;
    row.isUpdatingRole = false;
  }

  private generateRows(): void {
    if (this.isLoading) {
      return;
    }

    const rows: Row[] = [];
    for (const projectDoc of this.projectDocs) {
      let projectRole = NONE_ROLE;
      if (this.userService.currentUserId in projectDoc.data.userRoles) {
        projectRole = this.projectService.roles.get(projectDoc.data.userRoles[this.userService.currentUserId]);
      }
      rows.push(new Row(projectDoc, projectRole));
    }
    this.rows = rows;
  }

  private getQueryParameters(): QueryParameters {
    return {
      sort: { projectName: 1 },
      skip: this.pageIndex * this.pageSize,
      limit: this.pageSize
    };
  }
}
