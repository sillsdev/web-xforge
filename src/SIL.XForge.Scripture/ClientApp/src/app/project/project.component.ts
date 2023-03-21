import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
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
    private readonly i18n: I18nService,
    private readonly pwaService: PwaService,
    private readonly dialogService: DialogService,
    noticeService: NoticeService
  ) {
    super(noticeService);
  }

  async ngOnInit(): Promise<void> {
    // Redirect old sharing links
    if ((this.route.snapshot.queryParams['sharing'] as string) === 'true') {
      const shareKey = this.route.snapshot.queryParams['shareKey'] as string;
      this.router.navigateByUrl(`/join/${shareKey}`, { replaceUrl: true });
      return;
    }
    const projectId$ = this.route.params.pipe(
      map(params => params['projectId'] as string),
      distinctUntilChanged(),
      filter(projectId => projectId != null)
    );

    // Can only navigate to the project if the user is on the project
    // Race condition can occur with the user doc sites so listen to remote changes
    const userDoc = await this.userService.getCurrentUser();
    const navigateToProject$: Observable<string> = new Observable(subscriber => {
      let projectId: string | undefined;
      this.subscribe(projectId$, id => {
        projectId = id;
        subscriber.next(projectId);
      });
      this.subscribe(userDoc.remoteChanges$, () => {
        subscriber.next(projectId);
      });
    });

    this.subscribe(navigateToProject$, projectId => {
      if (!userDoc.data?.sites[environment.siteId].projects?.includes(projectId)) {
        return;
      }
      this.navigateToProject(projectId);
    });
  }

  private async navigateToProject(projectId: string): Promise<void> {
    this.loadingStarted();
    const projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
    const projectUserConfig = projectUserConfigDoc.data;
    const projectDoc = await this.projectService.getProfile(projectId);
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
}
