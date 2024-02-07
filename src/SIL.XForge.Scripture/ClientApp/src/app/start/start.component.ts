import { Component } from '@angular/core';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';

@Component({
  selector: 'app-start',
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss']
})
export class MyProjectsComponent extends SubscriptionDisposable {
  private allParatextProjects: ParatextProject[] | undefined;

  connectedProjects: SFProjectProfileDoc[] | undefined;
  connectedResources: SFProjectProfileDoc[] | undefined;
  nonJoinedParatextProjects: ParatextProject[] | undefined;
  user: UserDoc | undefined;

  constructor(
    private readonly noticeService: NoticeService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly paratextService: ParatextService,
    private readonly userService: UserService
  ) {
    super();

    this.subscribe(this.userProjectsService.projectDocs$, projects => {
      this.connectedProjects = projects.filter(project => !this.isResource(project));
      this.connectedResources = projects.filter(project => this.isResource(project));
    });

    this.loadParatextProjects();
    this.loadUser();
  }

  get isAppLoading(): boolean {
    return this.noticeService.isAppLoading;
  }

  isLastSelectedProject(project: SFProjectProfileDoc): boolean {
    return project.id === this.user?.data?.sites[environment.siteId].currentProjectId;
  }

  get userProjectCount(): number {
    return this.user?.data?.sites[environment.siteId].projects.length ?? 0;
  }

  private async loadParatextProjects(): Promise<void> {
    this.allParatextProjects = ((await this.paratextService.getProjects()) ?? []).filter(
      project => !project.isConnected
    );
    this.updateNonJoinedParatextProjects();
  }

  private async loadUser(): Promise<void> {
    this.user = await this.userService.getCurrentUser();
    this.updateNonJoinedParatextProjects();
  }

  private updateNonJoinedParatextProjects(): void {
    this.nonJoinedParatextProjects = this.allParatextProjects?.filter(project => {
      return !this.user?.data?.sites[environment.siteId].projects.includes(project.projectId as any);
    });
  }

  private isResource(project: SFProjectProfileDoc): boolean {
    return project.data?.paratextId.length === 16;
  }
}
