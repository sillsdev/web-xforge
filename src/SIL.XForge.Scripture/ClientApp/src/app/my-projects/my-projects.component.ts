import { Component, OnInit } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { isPTUser } from 'realtime-server/lib/esm/common/models/user';
import { isResource } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';
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
  /** SF projects that the current user is on at SF. */
  userConnectedProjects: SFProjectProfileDoc[] = [];
  /** Resources on SF that the current user is on at SF. */
  userConnectedResources: SFProjectProfileDoc[] = [];
  /** PT projects that the user can access that they are not connected to on SF. */
  userUnconnectedParatextProjects: ParatextProject[] = [];
  user?: UserDoc;
  problemGettingPTProjects: boolean = false;
  loadingPTProjects: boolean = false;
  initialLoadingSFProjects: boolean = true;
  userIsPTUser: boolean = false;

  constructor(
    private readonly userProjectsService: SFUserProjectsService,
    readonly paratextService: ParatextService,
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
      this.userUnconnectedParatextProjects.length > 0
    );
  }

  public get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  async ngOnInit(): Promise<void> {
    this.subscribe(this.userProjectsService.projectDocs$, (projects?: SFProjectProfileDoc[]) => {
      if (projects == null) return;
      this.userConnectedProjects = projects.filter(project => project.data != null && !isResource(project.data));
      this.userConnectedResources = projects.filter(project => project.data != null && isResource(project.data));
      this.initialLoadingSFProjects = false;
    });
    await this.loadUser();
    this.subscribe(this.onlineStatusService.onlineStatus$, online => {
      this.userIsPTUser = this.user?.data != null ? isPTUser(this.user.data) : false;
      if (this.userIsPTUser && online) this.loadParatextProjects();
    });
  }

  isLastSelectedProject(project: SFProjectProfileDoc): boolean {
    return project.id === this.user?.data?.sites[environment.siteId].currentProjectId;
  }

  /** Get descriptive text to show on a project card regarding what the project is used for, such as
   *  Community Checking. */
  projectTypeDescription(sfProject: SFProjectProfileDoc): string {
    const drafting = translate('my_projects.drafting');
    const checking = sfProject.data?.checkingConfig?.checkingEnabled ? ' • ' + translate('app.community_checking') : '';
    return `${drafting}${checking}`;
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
        this.problemGettingPTProjects = true;
        return;
      }
      this.userUnconnectedParatextProjects = userPTProjects.filter(project => !project.isConnected);
    } catch {
      this.problemGettingPTProjects = true;
    } finally {
      this.loadingPTProjects = false;
    }
  }
}
