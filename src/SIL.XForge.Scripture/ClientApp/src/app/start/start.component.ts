import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';

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
    this.navigateToProject();
  }

  private async navigateToProject(): Promise<void> {
    let projectId = this.userService.currentProjectId;
    if (projectId == null) {
      const userDoc = await this.userService.getCurrentUser();
      const site = userDoc.data.sites[environment.siteId];
      if (site != null && site.projects.length > 0) {
        projectId = site.projects[0];
      }
    }
    if (projectId != null) {
      this.router.navigate(['./', projectId], { relativeTo: this.route, replaceUrl: true });
    }
  }
}
