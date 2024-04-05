import { Component } from '@angular/core';
import { Router } from '@angular/router';
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
  selector: 'app-my-projects',
  templateUrl: './my-projects.component.html',
  styleUrls: ['./my-projects.component.scss']
})
export class MyProjectsComponent extends SubscriptionDisposable {
  userConnectedProjects: SFProjectProfileDoc[] = [];
  userConnectedResources: SFProjectProfileDoc[] = [];
  /** PT projects that the user can access that they are not connected to on SF. */
  userUnconnectedUserParatextProjects: ParatextProject[] = [];
  user?: UserDoc;

  constructor(
    private readonly noticeService: NoticeService,
    private readonly userProjectsService: SFUserProjectsService,
    readonly paratextService: ParatextService,
    private readonly router: Router,
    private readonly userService: UserService
  ) {
    super();

    this.subscribe(this.userProjectsService.projectDocs$, projects => {
      this.userConnectedProjects = projects.filter(project => !this.isResource(project));
      this.userConnectedResources = projects.filter(project => this.isResource(project));
    });
    this.loadUser();
  }

  /** If we are aware of any SF or PT projects that the user can access. */
  get userHasProjects(): boolean {
    return (
      this.userConnectedProjects.length > 0 ||
      this.userConnectedResources.length > 0 ||
      this.userUnconnectedUserParatextProjects.length > 0
    );
  }

  isLastSelectedProject(project: SFProjectProfileDoc): boolean {
    return project.id === this.user?.data?.sites[environment.siteId].currentProjectId;
  }

  private async loadUser(): Promise<void> {
    this.user = await this.userService.getCurrentUser();
    this.loadParatextProjects();
  }

  private async loadParatextProjects(): Promise<void> {
    this.userUnconnectedUserParatextProjects = ((await this.paratextService.getProjects()) ?? []).filter(
      project => !project.isConnected
    );
  }

  private isResource(project: SFProjectProfileDoc): boolean {
    const resourceIdLength: number = 16;
    return project.data?.paratextId.length === resourceIdLength;
  }
}
