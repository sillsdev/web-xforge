import { Component, ErrorHandler, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { canAccessTranslateApp } from '../core/models/sf-project-role-info';
import { SFProjectService } from '../core/sf-project.service';

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
    private readonly errorHandler: ErrorHandler,
    noticeService: NoticeService
  ) {
    super(noticeService);
  }

  ngOnInit(): void {
    this.subscribe(
      this.route.params.pipe(
        map(params => params['projectId'] as string),
        distinctUntilChanged(),
        filter(projectId => projectId != null)
      ),
      async projectId => {
        this.loadingStarted();
        // if the link has sharing turned on, check if the current user needs to be added to the project
        const sharing = this.route.snapshot.queryParams['sharing'] as string;
        if (sharing === 'true') {
          const shareKey = this.route.snapshot.queryParams['shareKey'] as string;
          try {
            await this.projectService.onlineCheckLinkSharing(projectId, shareKey);
          } catch (err) {
            if (
              err instanceof CommandError &&
              (err.code === CommandErrorCode.Forbidden || err.code === CommandErrorCode.NotFound)
            ) {
              await this.projectService.localDelete(projectId);
              await this.noticeService.showMessageDialog(() =>
                this.transloco.translate('project.project_link_is_invalid')
              );
              this.router.navigateByUrl('/projects', { replaceUrl: true });
              return;
            } else {
              throw err;
            }
          }
        }
        const projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
        const projectUserConfig = projectUserConfigDoc.data;
        const projectDoc = await this.projectService.get(projectId);
        const project = projectDoc.data;

        if (project == null || projectUserConfig == null) {
          const message: string = this.transloco.translate('project.problem_finding_project', {
            projectID: projectDoc.id
          });
          const error: Error = new Error(message);
          this.errorHandler.handleError(error);
          this.userService.setCurrentProjectId();
          this.router.navigateByUrl('/projects', { replaceUrl: true });
          return;
        }

        const projectRole = project.userRoles[this.userService.currentUserId] as SFProjectRole;
        const selectedTask = projectUserConfig.selectedTask;

        // navigate to last location
        if (
          (selectedTask === 'translate' && canAccessTranslateApp(projectRole)) ||
          (selectedTask === 'checking' && project.checkingConfig.checkingEnabled)
        ) {
          const taskRoute = ['./', selectedTask];
          // the user has previously navigated to a location in a task
          const bookNum = projectUserConfig.selectedBookNum;
          if (bookNum != null) {
            taskRoute.push(Canon.bookNumberToId(bookNum));
          } else if (selectedTask === 'checking') {
            taskRoute.push('ALL');
          }
          this.router.navigate(taskRoute, { relativeTo: this.route, replaceUrl: true });
        } else {
          // navigate to the default location in the first enabled task
          let task: string | undefined;
          if (canAccessTranslateApp(projectRole)) {
            task = 'translate';
          } else if (project.checkingConfig.checkingEnabled) {
            task = 'checking';
          }
          if (task != null) {
            const taskRoute = ['./', task];
            if (project.texts.length > 0) {
              taskRoute.push(task === 'checking' ? 'ALL' : Canon.bookNumberToId(project.texts[0].bookNum));
            }
            this.router.navigate(taskRoute, { relativeTo: this.route, replaceUrl: true });
          }
        }
        this.loadingFinished();
      }
    );
  }
}
