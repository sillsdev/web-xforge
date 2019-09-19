import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
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
              await this.noticeService.showMessageDialog('The project link is invalid.');
              this.router.navigateByUrl('/projects', { replaceUrl: true });
              return;
            } else {
              throw err;
            }
          }
        }
        const projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
        const projectUserConfig = projectUserConfigDoc.data;
        // navigate to last location
        if (
          projectUserConfig != null &&
          projectUserConfig.selectedTask != null &&
          projectUserConfig.selectedTask !== ''
        ) {
          // the user has previously navigated to a location in a task
          const bookNum = projectUserConfig.selectedBookNum;
          if (bookNum != null) {
            this.router.navigate(['./', projectUserConfig.selectedTask, Canon.bookNumberToId(bookNum)], {
              relativeTo: this.route,
              replaceUrl: true
            });
          }
        } else {
          const projectDoc = await this.projectService.get(projectId);
          const project = projectDoc.data;
          if (project != null && project.texts.length > 0) {
            const projectRole = project.userRoles[this.userService.currentUserId];
            // the user has not navigated anywhere before, so navigate to the default location in the first enabled task
            let task: string;
            if (projectRole !== SFProjectRole.CommunityChecker) {
              task = 'translate';
            } else if (project.checkingConfig.checkingEnabled) {
              task = 'checking';
            }
            if (task != null) {
              this.router.navigate(['./', task, Canon.bookNumberToId(project.texts[0].bookNum)], {
                relativeTo: this.route,
                replaceUrl: true
              });
            }
          }
        }
        this.loadingFinished();
      }
    );
  }
}
