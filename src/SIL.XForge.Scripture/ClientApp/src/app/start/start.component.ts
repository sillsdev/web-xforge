import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { from, of } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';

@Component({
  selector: 'app-start',
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss']
})
export class StartComponent extends SubscriptionDisposable implements OnInit {
  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly userService: UserService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      from(this.userService.getCurrentUser()).pipe(
        filter(userDoc => userDoc.data != null),
        switchMap(userDoc => {
          if (userDoc.data.sites['sf'] != null && userDoc.data.sites['sf'].currentProjectId != null) {
            return of(userDoc.data.sites['sf'].currentProjectId);
          }
          return this.userService
            .getProjects(userDoc.id)
            .pipe(map(r => (r.data.length > 0 ? r.data[0].project.id : null)));
        }),
        filter(projectId => projectId != null)
      ),
      projectId => this.router.navigate(['./', projectId], { relativeTo: this.route, replaceUrl: true })
    );
  }
}
