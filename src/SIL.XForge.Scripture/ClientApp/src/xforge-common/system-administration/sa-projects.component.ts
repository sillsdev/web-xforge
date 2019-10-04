import { Component, HostBinding, OnInit } from '@angular/core';
import { Project } from 'realtime-server/lib/common/models/project';
import { obj } from 'realtime-server/lib/common/utils/obj-path';
import { BehaviorSubject } from 'rxjs';
import { DataLoadingComponent } from '../data-loading-component';
import { ProjectDoc } from '../models/project-doc';
import { NONE_ROLE, ProjectRoleInfo } from '../models/project-role-info';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { QueryParameters } from '../query-parameters';
import { UserService } from '../user.service';

class Row {
  isUpdatingRole: boolean = false;

  constructor(public readonly projectDoc: ProjectDoc, public projectRole: ProjectRoleInfo) {}

  get id(): string {
    return this.projectDoc.id;
  }

  get isMember(): boolean {
    return this.projectRole !== NONE_ROLE;
  }

  get name(): string {
    return this.projectDoc.data.name;
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
export class SaProjectsComponent extends DataLoadingComponent implements OnInit {
  @HostBinding('class') classes = 'flex-column';

  rows: Row[];

  length: number = 0;
  pageIndex: number = 0;
  pageSize: number = 50;

  private projectDocs: Readonly<ProjectDoc[]>;

  private readonly searchTerm$: BehaviorSubject<string>;
  private readonly queryParameters$: BehaviorSubject<QueryParameters>;

  constructor(
    noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly userService: UserService
  ) {
    super(noticeService);
    this.searchTerm$ = new BehaviorSubject<string>('');
    this.queryParameters$ = new BehaviorSubject<QueryParameters>(this.getQueryParameters());
  }

  get isLoading(): boolean {
    return this.projectDocs == null;
  }

  get projectRoles(): ProjectRoleInfo[] {
    return Array.from(this.projectService.roles.values());
  }

  ngOnInit() {
    this.loadingStarted();
    this.subscribe(this.projectService.onlineQuery(this.searchTerm$, this.queryParameters$), searchResults => {
      this.loadingStarted();
      this.projectDocs = searchResults.docs;
      this.length = searchResults.unpagedCount;
      this.generateRows();
      this.loadingFinished();
    });
  }

  updateSearchTerm(term: string): void {
    this.searchTerm$.next(term);
  }

  updatePage(pageIndex: number, pageSize: number): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.queryParameters$.next(this.getQueryParameters());
  }

  async updateRole(row: Row, projectRole: ProjectRoleInfo): Promise<void> {
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
      $sort: { [obj<Project>().pathStr(p => p.name)]: 1 },
      $skip: this.pageIndex * this.pageSize,
      $limit: this.pageSize
    };
  }
}
