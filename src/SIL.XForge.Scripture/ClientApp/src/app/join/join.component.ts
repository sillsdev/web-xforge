import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { PwaService } from 'xforge-common/pwa.service';
import { combineLatest } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { AuthService } from 'xforge-common/auth.service';
import { SFProjectService } from '../core/sf-project.service';

@Component({
  selector: 'app-join',
  templateUrl: './join.component.html',
  styleUrls: ['./join.component.scss']
})
export class JoinComponent extends DataLoadingComponent {
  constructor(
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    private readonly i18nService: I18nService,
    private readonly projectService: SFProjectService,
    private readonly pwaService: PwaService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    noticeService: NoticeService
  ) {
    super(noticeService);
    const joining$ = this.route.params.pipe(
      map(params => ({ shareKey: params['shareKey'] as string, locale: (params['locale'] as string) ?? 'en' })),
      filter(key => key.shareKey != null && key.locale != null)
    );
    const checkLinkSharing$ = combineLatest([joining$, this.pwaService.onlineStatus$]).pipe(
      filter(([_, isOnline]) => isOnline),
      map(([joining, _]) => joining),
      distinctUntilChanged()
    );
    this.subscribe(checkLinkSharing$, joining => {
      // Set locale only if not logged in
      if (this.authService.currentUserId == null) {
        this.i18nService.setLocale(joining.locale, this.authService);
      }
      this.checkLinkSharing(joining.shareKey);
    });
    const showOfflineMessage$ = combineLatest([joining$, this.pwaService.onlineStatus$]).pipe(
      filter(([_, isOnline]) => !isOnline)
    );
    this.subscribe(showOfflineMessage$, () => this.showOfflineMessage());
  }

  private async checkLinkSharing(shareKey: string): Promise<void> {
    this.loadingStarted();
    // if the link has sharing turned on, check if the current user needs to be added to the project
    try {
      const projectId = await this.projectService.onlineCheckLinkSharing(shareKey);
      this.router.navigateByUrl(`/projects/${projectId}`, { replaceUrl: true });
    } catch (err) {
      if (
        err instanceof CommandError &&
        (err.code === CommandErrorCode.Forbidden || err.code === CommandErrorCode.NotFound)
      ) {
        await this.dialogService.message('project.project_link_is_invalid');
      } else {
        throw err;
      }
      this.router.navigateByUrl('/projects', { replaceUrl: true });
    } finally {
      this.loadingFinished();
    }
  }

  private async showOfflineMessage(): Promise<void> {
    await this.dialogService.message('project.please_connect_to_use_link');
    this.router.navigateByUrl('/projects', { replaceUrl: true });
  }
}
