import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
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
    private readonly noticeService: NoticeService,
    private readonly userService: UserService
  ) {
    super();
  }

  get isAppLoading(): boolean {
    return this.noticeService.isAppLoading;
  }

  async ngOnInit(): Promise<void> {
    const userDoc = await this.userService.getCurrentUser();
    this.subscribe(userDoc.remoteChanges$, () => this.navigateToProject(userDoc));
    this.navigateToProject(userDoc);
  }

  private navigateToProject(userDoc: UserDoc): void {
    if (userDoc.data == null) {
      return;
    }

    let projectId: string | undefined;
    const site = userDoc.data.sites[environment.siteId];
    const currentProjectId = this.userService.currentProjectId;
    if (currentProjectId != null && site.projects.includes(currentProjectId)) {
      projectId = currentProjectId;
    } else if (site.projects.length > 0) {
      projectId = site.projects[0];
    }
    if (projectId != null) {
      this.router.navigate(['./', projectId], { relativeTo: this.route, replaceUrl: true });
    }
  }
}
