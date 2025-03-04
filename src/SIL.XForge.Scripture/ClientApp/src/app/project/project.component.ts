import { Component, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { lastValueFrom, Observable } from 'rxjs';
import { distinctUntilChanged, filter, first, map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { QuietDestroyRef } from 'xforge-common/utils';
import { environment } from '../../environments/environment';
import { ResumeCheckingService } from '../checking/checking/resume-checking.service';
import { PermissionsService } from '../core/permissions.service';
import { SFProjectService } from '../core/sf-project.service';

type TaskType = 'translate' | 'checking';

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
    private readonly permissions: PermissionsService,
    private readonly resumeCheckingService: ResumeCheckingService,
    private readonly dialogService: DialogService,
    noticeService: NoticeService,
    private destroyRef: QuietDestroyRef
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
      projectId$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(id => {
        projectId = id;
        subscriber.next(projectId);
      });
      userDoc.remoteChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        subscriber.next(projectId);
      });
    });

    navigateToProject$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async projectId => {
      if (userDoc.data?.sites[environment.siteId].projects?.includes(projectId)) {
        this.navigateToProject(projectId);
      } else {
        await this.dialogService.message('app.project_has_been_deleted');
        this.router.navigateByUrl('/projects', { replaceUrl: true });
      }
    });
  }

  private async navigateToProject(projectId: string): Promise<void> {
    this.loadingStarted();

    try {
      const [projectUserConfigDoc, projectDoc] = await Promise.all([
        this.projectService.getUserConfig(projectId, this.userService.currentUserId),
        this.projectService.getProfile(projectId)
      ]);

      const projectUserConfig = projectUserConfigDoc.data;
      const project = projectDoc.data;

      if (project == null || projectUserConfig == null) {
        return;
      }

      const selectedTask = projectUserConfig.selectedTask;
      const isTranslateAccessible = this.permissions.canAccessTranslate(projectDoc);
      const isCheckingAccessible = this.permissions.canAccessCommunityChecking(projectDoc);

      const tasks: { task: TaskType; accessible: boolean }[] = [
        // first listed task will be treated as default
        { task: 'translate', accessible: isTranslateAccessible },
        { task: 'checking', accessible: isCheckingAccessible }
      ];
      const task =
        tasks.find(t => t.task === selectedTask && t.accessible)?.task ?? tasks.find(t => t.accessible)?.task;

      if (task === 'translate') {
        this.navigateToTranslate(projectId, project, projectUserConfig);
      } else if (task === 'checking') {
        await this.navigateToChecking(projectId);
      }
    } finally {
      this.loadingFinished();
    }
  }

  private navigateToTranslate(
    projectId: string,
    project: SFProjectProfile,
    projectUserConfig: SFProjectUserConfig,
    task: TaskType = 'translate'
  ): void {
    const routePath = ['projects', projectId, task];
    let bookNum: number | undefined = projectUserConfig.selectedBookNum;
    if (bookNum == null || !project.texts.some(t => t.bookNum === bookNum)) {
      bookNum = project.texts[0]?.bookNum;
    }

    if (bookNum != null) {
      routePath.push(Canon.bookNumberToId(bookNum));

      const chapterNum: number | undefined =
        projectUserConfig.selectedChapterNum ?? project.texts[bookNum]?.chapters[0]?.number;

      if (chapterNum != null) {
        routePath.push(chapterNum.toString());
      }
    }

    this.router.navigate(routePath, { replaceUrl: true });
  }

  private async navigateToChecking(projectId: string, task: TaskType = 'checking'): Promise<void> {
    const defaultCheckingLink: string[] = ['/projects', projectId, task];
    const link = await lastValueFrom(this.resumeCheckingService.checkingLink$.pipe(first()));

    this.router.navigate(link ?? defaultCheckingLink, { replaceUrl: true });
  }
}
