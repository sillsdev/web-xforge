import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { from, of } from 'rxjs';
import { distinctUntilChanged, filter, map, switchMap } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { SFProject } from '../core/models/sfproject';
import { canTranslate } from '../core/models/sfproject-roles';
import { SFProjectUser } from '../core/models/sfproject-user';
import { SFProjectService } from '../core/sfproject.service';

@Component({
  selector: 'app-projects',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})
export class ProjectComponent extends SubscriptionDisposable implements OnInit {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    private readonly userService: UserService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.route.params.pipe(
        map(params => params['projectId'] as string),
        distinctUntilChanged(),
        filter(projectId => projectId != null),
        switchMap(projectId => {
          // if the link has sharing turned on, check if the current user needs to be added to the project
          const sharing = this.route.snapshot.queryParams['sharing'] as string;
          if (sharing === 'true') {
            return from(this.projectService.onlineCheckLinkSharing(projectId)).pipe(map(() => projectId));
          } else {
            return of(projectId);
          }
        }),
        switchMap(projectId => this.projectService.get(projectId, [[nameof<SFProject>('users')]]))
      ),
      async r => {
        const project = r.data;
        if (project == null) {
          return;
        }
        const projectUser = r
          .getManyIncluded<SFProjectUser>(project.users)
          .find(pu => pu.user != null && pu.user.id === this.userService.currentUserId);
        if (projectUser == null) {
          return;
        }
        // navigate to last location
        if (projectUser.selectedTask != null && projectUser.selectedTask !== '') {
          // the user has previously navigated to a location in a task
          let bookId: string;
          switch (projectUser.selectedTask) {
            case 'translate':
              bookId = projectUser.translateConfig.selectedBookId;
              break;

            case 'checking':
              // TODO: get last selected text
              break;
          }
          if (bookId != null) {
            this.router.navigate(['./', projectUser.selectedTask, bookId], {
              relativeTo: this.route,
              replaceUrl: true
            });
          }
        } else {
          const projectDataDoc = await this.projectService.getDataDoc(project.id);
          if (projectDataDoc.data.texts != null && projectDataDoc.data.texts.length > 0) {
            // the user has not navigated anywhere before, so navigate to the default location in the first enabled task
            let task: string;
            if (project.translateEnabled != null && project.translateEnabled && canTranslate(projectUser.role)) {
              task = 'translate';
            } else if (project.checkingEnabled != null && project.checkingEnabled) {
              task = 'checking';
            }
            if (task != null) {
              this.router.navigate(['./', task, projectDataDoc.data.texts[0].bookId], {
                relativeTo: this.route,
                replaceUrl: true
              });
            }
          }
        }
      }
    );
  }
}
