import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserDoc } from 'xforge-common/models/user-doc';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';
import { OnlineStatusService } from '../../xforge-common/online-status.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';

/** Presents user with list of available projects to open or connect to. */
@Component({
  selector: 'app-my-projects',
  templateUrl: './my-projects.component.html',
  styleUrls: ['./my-projects.component.scss']
})
export class MyProjectsComponent extends SubscriptionDisposable implements OnInit {
  userConnectedProjects: SFProjectProfileDoc[] = [];
  userConnectedResources: SFProjectProfileDoc[] = [];
  /** PT projects that the user can access that they are not connected to on SF. */
  userUnconnectedUserParatextProjects: ParatextProject[] = [];
  user?: UserDoc;
  problemGettingPTProjects: boolean = false;
  loggedIntoPT: boolean = true;
  loadingPTProjects: boolean = false;
  initialLoadingSFProjects: boolean = true;

  constructor(
    private readonly userProjectsService: SFUserProjectsService,
    readonly paratextService: ParatextService,
    private readonly router: Router,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly userService: UserService
  ) {
    super();
  }

  /** If we are aware of any SF or PT projects that the user can access. */
  get userHasProjects(): boolean {
    return (
      this.userConnectedProjects.length > 0 ||
      this.userConnectedResources.length > 0 ||
      this.userUnconnectedUserParatextProjects.length > 0
    );
  }

  protected get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  ngOnInit(): void {
    this.subscribe(this.userProjectsService.projectDocs$, (projects?: SFProjectProfileDoc[]) => {
      if (projects == null) return;
      this.userConnectedProjects = projects.filter(project => !this.isResource(project));
      this.userConnectedResources = projects.filter(project => this.isResource(project));
      this.initialLoadingSFProjects = false;
    });
    this.loadUser();
    this.subscribe(this.onlineStatusService.onlineStatus$, online => {
      if (online) this.loadParatextProjects();
    });
  }

  isLastSelectedProject(project: SFProjectProfileDoc): boolean {
    return project.id === this.user?.data?.sites[environment.siteId].currentProjectId;
  }

  private async loadUser(): Promise<void> {
    this.user = await this.userService.getCurrentUser();
  }

  private async loadParatextProjects(): Promise<void> {
    if (!this.isOnline) return;
    this.loadingPTProjects = true;
    this.problemGettingPTProjects = false;
    try {
      const userPTProjects = await this.paratextService.getProjects();
      if (userPTProjects == null) {
        this.loggedIntoPT = false;
        return;
      } else {
        this.loggedIntoPT = true;
      }
      this.userUnconnectedUserParatextProjects = userPTProjects.filter(project => !project.isConnected);
    } catch {
      this.problemGettingPTProjects = true;
    } finally {
      this.loadingPTProjects = false;
    }
  }

  private isResource(project: SFProjectProfileDoc): boolean {
    const resourceIdLength: number = 16;
    return project.data?.paratextId.length === resourceIdLength;
  }
}