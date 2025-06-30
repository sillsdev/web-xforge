import { Injectable } from '@angular/core';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { map, Observable, of, shareReplay, startWith, switchMap } from 'rxjs';
import { SFProjectUserConfigDoc } from '../app/core/models/sf-project-user-config-doc';
import { SFProjectService } from '../app/core/sf-project.service';
import { ActivatedProjectService } from './activated-project.service';
import { UNKNOWN_COMPONENT_OR_SERVICE } from './models/realtime-doc';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class ActivatedProjectUserConfigService {
  readonly projectUserConfigDoc$: Observable<SFProjectUserConfigDoc | undefined> =
    this.activatedProject.projectId$.pipe(
      switchMap(projectId =>
        projectId != null
          ? this.projectService.getUserConfig(projectId, this.userService.currentUserId, UNKNOWN_COMPONENT_OR_SERVICE)
          : of(undefined)
      ),
      switchMap(
        projectUserConfigDoc =>
          projectUserConfigDoc?.changes$.pipe(
            map(() => projectUserConfigDoc),

            startWith(projectUserConfigDoc)
          ) ?? of(undefined)
      ),
      shareReplay(1)
    );

  readonly projectUserConfig$: Observable<SFProjectUserConfig | undefined> = this.projectUserConfigDoc$.pipe(
    map(doc => doc?.data)
  );

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}
}
