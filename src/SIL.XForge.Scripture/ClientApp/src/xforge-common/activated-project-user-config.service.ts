import { DestroyRef, Injectable } from '@angular/core';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { concat, finalize, from, map, Observable, of, shareReplay, switchMap } from 'rxjs';
import { SFProjectUserConfigDoc } from '../app/core/models/sf-project-user-config-doc';
import { SFProjectService } from '../app/core/sf-project.service';
import { ActivatedProjectService } from './activated-project.service';
import { DocSubscription } from './models/realtime-doc';
import { UserService } from './user.service';
import { quietTakeUntilDestroyed } from './util/rxjs-util';

@Injectable({
  providedIn: 'root'
})
export class ActivatedProjectUserConfigService {
  private currentDocSubscription?: DocSubscription;

  readonly projectUserConfigDoc$: Observable<SFProjectUserConfigDoc | undefined> =
    this.activatedProject.projectId$.pipe(
      switchMap(projectId => {
        if (projectId == null) {
          this.currentDocSubscription?.unsubscribe();
          this.currentDocSubscription = undefined;
          return of(undefined);
        }

        const previousDocSubscription: DocSubscription | undefined = this.currentDocSubscription;
        const newDocSubscription = new DocSubscription('ActivatedProjectUserConfigService');

        return from(
          this.projectService.getUserConfig(projectId, this.userService.currentUserId, newDocSubscription)
        ).pipe(
          switchMap(projectUserConfigDoc => {
            this.currentDocSubscription = newDocSubscription;

            return concat(
              of(projectUserConfigDoc).pipe(
                // Unsubscribe from previous doc after new doc is emitted.
                finalize(() => previousDocSubscription?.unsubscribe())
              ),
              projectUserConfigDoc?.changes$.pipe(map(() => projectUserConfigDoc)) ?? of(undefined)
            );
          }),

          finalize(() => {
            // If this inner stream is canceled before the new doc becomes current
            // (for example, rapid project switching), release that pending subscription.

            if (this.currentDocSubscription !== newDocSubscription) {
              newDocSubscription.unsubscribe();
            }
          })
        );
      }),
      shareReplay(1),
      quietTakeUntilDestroyed(this.destroyRef)
    );

  readonly projectUserConfig$: Observable<SFProjectUserConfig | undefined> = this.projectUserConfigDoc$.pipe(
    map(doc => doc?.data)
  );

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => this.currentDocSubscription?.unsubscribe());
  }
}
