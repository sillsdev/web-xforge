import { Component, HostBinding, OnInit } from '@angular/core';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
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
    return this.projectDoc == null || this.projectDoc.data == null ? '' : this.projectDoc.data.name;
  }

  get tasks(): string {
    return this.projectDoc.taskNames.join(', ');
  }

  get syncDisabled(): boolean {
    if (this.projectDoc.data == null || this.projectDoc.data.syncDisabled == null) {
      return false;
    }
    return this.projectDoc.data.syncDisabled;
  }
}

@Component({
  selector: 'app-sa-projects',
  templateUrl: './sa-projects.component.html',
  styleUrls: ['./sa-projects.component.scss']
})
export class SaProjectsComponent extends DataLoadingComponent implements OnInit {
  @HostBinding('class') classes = 'flex-column';

  rows: Row[] = [];

  length: number = 0;
  pageIndex: number = 0;
  pageSize: number = 50;

  private projectDocs?: Readonly<ProjectDoc[]>;

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
    this.subscribe(
      this.projectService.onlineQuery(this.searchTerm$, this.queryParameters$, [
        obj<Project>().pathStr(p => p.name),
        obj<SFProject>().pathStr(p => p.shortName)
      ]),
      searchResults => {
        this.loadingStarted();
        this.projectDocs = searchResults.docs;
        this.length = searchResults.unpagedCount;
        this.generateRows();
        this.loadingFinished();
      }
    );
  }

  updateSearchTerm(target: EventTarget | null): void {
    const termTarget = target as HTMLInputElement;
    if (termTarget?.value != null) {
      this.searchTerm$.next(termTarget.value);
    }
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

  onUpdateSyncDisabled(row: Row, newValue: boolean): Promise<void> {
    return this.projectService.onlineSetSyncDisabled(row.id, newValue);
  }

  private generateRows(): void {
    if (this.projectDocs == null) {
      return;
    }

    const rows: Row[] = [];
    for (const projectDoc of this.projectDocs) {
      let projectRole = NONE_ROLE;
      if (projectDoc.data != null && this.userService.currentUserId in projectDoc.data.userRoles) {
        projectRole = this.projectService.roles.get(
          projectDoc.data.userRoles[this.userService.currentUserId]
        ) as ProjectRoleInfo;
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
