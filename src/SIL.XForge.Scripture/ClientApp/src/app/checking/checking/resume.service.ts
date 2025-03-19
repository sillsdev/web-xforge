import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { BehaviorSubject, distinctUntilChanged, filter, map, merge, Observable, of, shareReplay } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

/**
 * The base class for resuming the different workflows. Listens to changes in the URL and tracks the last viewed book,
 * chapter, and task in the user config.
 */
@Injectable({ providedIn: 'root' })
export abstract class ResumeServiceBase {
  abstract readonly resumeLink$: Observable<string[] | undefined>;

  protected readonly projectUserConfigDoc$ = new BehaviorSubject<SFProjectUserConfigDoc | undefined>(undefined);
  private projectUserConfigDoc?: SFProjectUserConfigDoc;

  protected readonly currentParams$: Observable<Params> = merge(
    // Get initial route params on component init
    of(this.router.routerState.snapshot.root.firstChild),

    // Get params on subsequent navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.routerState.snapshot.root.firstChild)
    )
  ).pipe(
    filterNullish(),
    distinctUntilChanged((prev, curr) => JSON.stringify(prev?.url) === JSON.stringify(curr?.url)),
    takeUntilDestroyed(this.destroyRef),
    shareReplay(1),
    map(route => route.params)
  );

  constructor(
    protected readonly router: Router,
    protected readonly userService: UserService,
    protected readonly activatedProjectService: ActivatedProjectService,
    protected readonly onlineStatusService: OnlineStatusService,
    protected readonly projectService: SFProjectService,
    protected readonly permissionsService: PermissionsService,
    protected readonly destroyRef: DestroyRef
  ) {
    this.activatedProjectService.projectId$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async projectId => {
        await this.updateProjectUserConfig(projectId);
      });

    this.currentParams$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(async params => {
      const routeChapter: string | undefined = params['chapter'];
      const routeChapterNum: number | undefined = routeChapter != null ? Number.parseInt(routeChapter) : undefined;
      const routeBookId: string | undefined = params['bookId']?.toLowerCase();
      // Handle 'ALL' scope being passed as book param
      const routeBookNum: number | undefined =
        routeBookId != null && routeBookId !== 'all' ? Canon.bookIdToNumber(routeBookId) : undefined;

      if (routeBookNum && this.projectUserConfigDoc$.value) {
        await this.projectUserConfigDoc$.value.submitJson0Op(op => {
          if (this.router.url.includes('checking')) op.set<string>(puc => puc.selectedTask!, 'checking');
          else if (this.router.url.includes('translate')) op.set<string>(puc => puc.selectedTask!, 'translate');
          op.set(puc => puc.selectedBookNum!, routeBookNum);
          op.set(puc => puc.selectedChapterNum!, routeChapterNum ?? 1);
        });
      }
    });
  }

  private async updateProjectUserConfig(projectId: string | undefined): Promise<void> {
    this.projectUserConfigDoc = undefined;
    if (projectId != null) {
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
      this.projectUserConfigDoc$.next(this.projectUserConfigDoc);
    }
  }
}
