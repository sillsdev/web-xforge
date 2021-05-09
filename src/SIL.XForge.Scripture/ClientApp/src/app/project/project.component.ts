import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { SFProjectRole } from 'realtime-server/lib/cjs/scriptureforge/models/sf-project-role';
import { Canon } from 'realtime-server/lib/cjs/scriptureforge/scripture-utils/canon';
import { combineLatest } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';
import { canAccessTranslateApp } from '../core/models/sf-project-role-info';
import { SFProjectService } from '../core/sf-project.service';
import { selectValidProject } from '../start/start.component';

@Component({
  selector: 'app-projects',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})
export class ProjectComponent extends DataLoadingComponent implements OnInit {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    private readonly userService: UserService,
    private readonly transloco: TranslocoService,
    private readonly pwaService: PwaService,
    noticeService: NoticeService
  ) {
    super(noticeService);
  }

  async ngOnInit(): Promise<void> {
    const userProjects: string[] | undefined = (await this.userService.getCurrentUser()).data?.sites[environment.siteId]
      .projects;
    const projectId$ = this.route.params.pipe(
      map(params => params['projectId'] as string),
      distinctUntilChanged(),
      filter(projectId => projectId != null)
    );

    const navigateToProject$ = projectId$.pipe(
      filter(id => !!userProjects?.includes(id) || this.route.snapshot.queryParams['sharing'] == null)
    );
    this.subscribe(navigateToProject$, projectId => this.navigateToProject(projectId));
    const checkLinkSharing$ = combineLatest([projectId$, this.pwaService.onlineStatus]).pipe(
      filter(([_, isOnline]) => isOnline && (this.route.snapshot.queryParams['sharing'] as string) === 'true'),
      map(([projectId, _]) => projectId)
    );
    this.subscribe(checkLinkSharing$, projectId => this.checkLinkSharing(projectId));
    const showOfflineMessage$ = combineLatest([projectId$, this.pwaService.onlineStatus]).pipe(
      filter(
        ([id, isOnline]) =>
          !userProjects?.includes(id) && !isOnline && (this.route.snapshot.queryParams['sharing'] as string) === 'true'
      )
    );
    this.subscribe(showOfflineMessage$, () => this.showOfflineMessage());
  }

  private async checkLinkSharing(projectId: string): Promise<void> {
    this.loadingStarted();
    // if the link has sharing turned on, check if the current user needs to be added to the project
    const shareKey = this.route.snapshot.queryParams['shareKey'] as string;
    try {
      await this.projectService.onlineCheckLinkSharing(projectId, shareKey);
    } catch (err) {
      if (
        err instanceof CommandError &&
        (err.code === CommandErrorCode.Forbidden || err.code === CommandErrorCode.NotFound)
      ) {
        await this.projectService.localDelete(projectId);
        await this.noticeService.showMessageDialog(() => this.transloco.translate('project.project_link_is_invalid'));
        this.router.navigateByUrl('/projects', { replaceUrl: true });
        return;
      } else {
        throw err;
      }
    } finally {
      this.loadingFinished();
    }
    this.navigateToProject(projectId);
  }

  private async navigateToProject(projectId: string): Promise<void> {
    this.loadingStarted();
    const projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
    const projectUserConfig = projectUserConfigDoc.data;
    const projectDoc = await this.projectService.get(projectId);
    const project = projectDoc.data;
    if (project == null || projectUserConfig == null) {
      return;
    }
    const projectRole = project.userRoles[this.userService.currentUserId] as SFProjectRole;
    const selectedTask = projectUserConfig.selectedTask;

    // navigate to last location
    if (
      (selectedTask === 'translate' && canAccessTranslateApp(projectRole)) ||
      (selectedTask === 'checking' && project.checkingConfig.checkingEnabled)
    ) {
      const taskRoute = ['projects', projectId, selectedTask];
      // the user has previously navigated to a location in a task
      const bookNum = projectUserConfig.selectedBookNum;
      if (bookNum != null) {
        taskRoute.push(Canon.bookNumberToId(bookNum));
      } else if (selectedTask === 'checking') {
        taskRoute.push('ALL');
      }
      this.router.navigate(taskRoute, { replaceUrl: true });
    } else {
      // navigate to the default location in the first enabled task
      let task: string | undefined;
      if (canAccessTranslateApp(projectRole)) {
        task = 'translate';
      } else if (project.checkingConfig.checkingEnabled) {
        task = 'checking';
      }
      if (task != null) {
        const taskRoute = ['projects', projectId, task];
        if (project.texts.length > 0) {
          taskRoute.push(task === 'checking' ? 'ALL' : Canon.bookNumberToId(project.texts[0].bookNum));
        }
        this.router.navigate(taskRoute, { replaceUrl: true });
      }
    }
    this.loadingFinished();
  }

  private async showOfflineMessage(): Promise<void> {
    await this.noticeService.showMessageDialog(() => this.transloco.translate('project.please_connect_to_use_link'));
    const userDoc: UserDoc = await this.userService.getCurrentUser();
    const projectId: string | undefined = selectValidProject(userDoc, this.userService.currentProjectId);
    if (projectId == null) {
      this.router.navigateByUrl('/projects', { replaceUrl: true });
    } else {
      this.navigateToProject(projectId);
    }
  }
}
