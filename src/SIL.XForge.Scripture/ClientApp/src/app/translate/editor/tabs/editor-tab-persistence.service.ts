import { Injectable } from '@angular/core';
import { isEqual } from 'lodash-es';
import { EditorTabPersistData } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab-persist-data';
import { combineLatest, firstValueFrom, Observable, of, startWith, Subject, Subscription, switchMap, tap } from 'rxjs';
import { distinctUntilChanged, finalize, shareReplay } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../../core/sf-project.service';

@Injectable({
  providedIn: 'root'
})
export class EditorTabPersistenceService {
  private readonly projectUserConfigDoc$: Observable<SFProjectUserConfigDoc> = this.getProjectUserConfigDoc();

  /**
   * Observable list of open editor tabs.
   */
  readonly persistedTabs$: Observable<EditorTabPersistData[]> = this.projectUserConfigDoc$.pipe(
    switchMap(configDoc => of(configDoc.data?.editorTabsOpen ?? [])),
    distinctUntilChanged(isEqual)
  );

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService
  ) {}

  /**
   * Persist the specified list of open editor tabs to SFProjectUserConfigDoc.
   */
  async persistTabsOpen(tabs: EditorTabPersistData[]): Promise<void> {
    const pucDoc = await firstValueFrom(this.projectUserConfigDoc$);
    const existingTabs = pucDoc.data?.editorTabsOpen;

    if (existingTabs != null && !isEqual(existingTabs, tabs)) {
      await pucDoc.updateEditorOpenTabs(tabs);
    }
  }

  /**
   * Get latest project user config (refetch when project id changes or when project user config changes).
   */
  private getProjectUserConfigDoc(): Observable<SFProjectUserConfigDoc> {
    const pucChanged$ = new Subject<void>();
    let pucChangesSub: Subscription | undefined;

    return combineLatest([
      this.activatedProject.projectId$.pipe(filterNullish()),
      pucChanged$.pipe(startWith(undefined))
    ]).pipe(
      switchMap(([projectId]) => this.projectService.getUserConfig(projectId, this.userService.currentUserId)),
      tap(pucDoc => {
        pucChangesSub?.unsubscribe();
        pucChangesSub = pucDoc.changes$.subscribe(() => {
          pucChanged$.next();
        });
      }),
      finalize(() => pucChangesSub?.unsubscribe()),
      shareReplay(1) // Replay last value
    );
  }
}
