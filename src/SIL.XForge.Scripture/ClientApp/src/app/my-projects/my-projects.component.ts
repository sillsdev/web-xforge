import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { isPTUser } from 'realtime-server/lib/esm/common/models/user';
import { isResource } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { Observable } from 'rxjs';
import { en } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { getQuietDestroyRef } from 'xforge-common/utils';
import { environment } from '../../environments/environment';
import { ObjectPaths } from '../../type-utils';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';
import { PermissionsService } from '../core/permissions.service';
import { SFProjectService } from '../core/sf-project.service';

/** Presents user with list of available projects to open or connect to. */
@Component({
  selector: 'app-my-projects',
  templateUrl: './my-projects.component.html',
  styleUrls: ['./my-projects.component.scss']
})
export class MyProjectsComponent implements OnInit {
  /** PT projects that the user can access. */
  private userParatextProjects: ParatextProject[] = [];

  /** SF projects that the current user is on at SF. */
  userConnectedProjects: SFProjectProfileDoc[] = [];
  /** Resources on SF that the current user is on at SF. */
  userConnectedResources: SFProjectProfileDoc[] = [];
  sfProjects: SFProjectDoc[] = [];

  user?: UserDoc;
  problemGettingPTProjects: boolean = false;
  errorMessage: ObjectPaths<typeof en.my_projects> = 'problem_getting_pt_list';
  loadingPTProjects: boolean = false;
  initialLoadingSFProjects: boolean = true;
  userIsPTUser: boolean = false;
  joiningProjects: string[] = [];
  private destroyRef = getQuietDestroyRef();

  constructor(
    private readonly projectService: SFProjectService,
    private readonly userProjectsService: SFUserProjectsService,
    readonly paratextService: ParatextService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly userService: UserService,
    private readonly permissions: PermissionsService,
    private readonly noticeService: NoticeService,
    private readonly router: Router
  ) {}

  /** If we are aware of any SF or PT projects that the user can access. */
  get userHasProjects(): boolean {
    return (
      this.userConnectedProjects.length > 0 ||
      this.userConnectedResources.length > 0 ||
      this.userUnconnectedParatextProjects.length > 0 ||
      this.userUpdateParatextProjects.length > 0
    );
  }

  get userUnconnectedParatextProjects(): ParatextProject[] {
    return this.userParatextProjects.filter(project => !project.isConnected);
  }

  get userUpdateParatextProjects(): ParatextProject[] {
    return this.userParatextProjects.filter(project => project.hasUserRoleChanged && project.projectId != null);
  }

  get isOnline(): Observable<boolean> {
    return this.onlineStatusService.onlineStatus$;
  }

  async ngOnInit(): Promise<void> {
    await this.loadUser();
    this.userProjectsService.projectDocs$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((projects?: SFProjectProfileDoc[]) => {
        if (projects == null) return;
        this.userConnectedProjects = projects.filter(
          project => project.data != null && !isResource(project.data) && !this.joiningProjects.includes(project.id)
        );
        this.userConnectedResources = projects.filter(project => project.data != null && isResource(project.data));
        this.initialLoadingSFProjects = false;
      });

    await this.onlineStatusService.online;
    if (this.userIsPTUser) await this.loadParatextProjects();
  }

  currentUserRole(projectId: string): string | undefined {
    return this.userConnectedProjects.find(project => project.id === projectId)?.data?.userRoles[this.user!.id];
  }

  isLastSelectedProject(project: SFProjectProfileDoc): boolean {
    return project.id === this.user?.data?.sites[environment.siteId].currentProjectId;
  }

  /** Get descriptive text to show on a project card regarding what the project is used for, such as
   *  Community Checking. */
  projectTypeDescription(sfProject: SFProjectProfileDoc): string {
    const isTranslateAccessible = this.permissions.canAccessTranslate(sfProject);
    const isCheckingAccessible = this.permissions.canAccessCommunityChecking(sfProject) ?? false;

    const drafting = isTranslateAccessible ? translate('my_projects.drafting') : '';
    const checking = isCheckingAccessible
      ? isTranslateAccessible
        ? ' • ' + translate('app.community_checking')
        : translate('app.community_checking')
      : '';

    return `${drafting}${checking}`;
  }

  async joinProject(projectId: string): Promise<void> {
    try {
      this.noticeService.loadingStarted(this.constructor.name);
      this.joiningProjects.push(projectId);
      await this.projectService.onlineAddCurrentUser(projectId);
      this.router.navigate(['projects', projectId]);
    } catch {
      this.noticeService.show(translate('my_projects.failed_to_join_project'));
    } finally {
      this.noticeService.loadingFinished(this.constructor.name);
      this.joiningProjects.pop();
    }
  }

  async syncUserRole(projectId: string): Promise<void> {
    try {
      this.noticeService.loadingStarted(this.constructor.name);
      await this.projectService.onlineSyncUserRole(projectId);
      this.noticeService.show(translate('my_projects.user_role_updated'));
      const project = this.userParatextProjects.find(project => project.projectId === projectId);
      if (project != null) project.hasUserRoleChanged = false;
    } catch {
      this.noticeService.showError(translate('my_projects.failed_to_update_user_role'));
    } finally {
      this.noticeService.loadingFinished(this.constructor.name);
    }
  }

  private async loadUser(): Promise<void> {
    this.user = await this.userService.getCurrentUser();
    this.userIsPTUser = this.user.data != null ? isPTUser(this.user.data) : false;
  }

  private async loadParatextProjects(): Promise<void> {
    this.loadingPTProjects = true;
    this.problemGettingPTProjects = false;
    try {
      const userPtProjects = await this.paratextService.getProjects();
      if (userPtProjects == null) {
        this.problemGettingPTProjects = true;
        return;
      }
      this.userParatextProjects = userPtProjects;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === HttpStatusCode.ServiceUnavailable) {
        this.errorMessage = 'failed_to_connect_to_pt_server';
      }
      this.problemGettingPTProjects = true;
    } finally {
      this.loadingPTProjects = false;
    }
  }
}
