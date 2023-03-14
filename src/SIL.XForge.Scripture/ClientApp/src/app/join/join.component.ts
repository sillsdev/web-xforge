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
import { AnonymousService } from 'xforge-common/anonymous.service';
import { LocationService } from 'xforge-common/location.service';
import { UntypedFormControl, Validators } from '@angular/forms';
import { XFValidators } from 'xforge-common/xfvalidators';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { SFProjectService } from '../core/sf-project.service';

export interface AnonymousShareKeyDetails {
  projectName: string;
  role: string;
}
export interface AnonymousShareKeyResponse extends AnonymousShareKeyDetails {
  shareKey: string;
}

@Component({
  selector: 'app-join',
  templateUrl: './join.component.html',
  styleUrls: ['./join.component.scss']
})
export class JoinComponent extends DataLoadingComponent {
  name: UntypedFormControl = new UntypedFormControl('');
  joiningProgress?: 'joining' | 'unavailable';
  private joiningResponse?: AnonymousShareKeyResponse;

  constructor(
    private readonly anonymousService: AnonymousService,
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    readonly i18nService: I18nService,
    private readonly locationService: LocationService,
    private readonly projectService: SFProjectService,
    private readonly pwaService: PwaService,
    private readonly reportingService: ErrorReportingService,
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
      this.checkShareKey(joining.shareKey);
    });
    this.subscribe(this.pwaService.onlineStatus$, () => this.showOfflineMessage());
  }

  get isFormEnabled(): boolean {
    return this.joiningProgress == null;
  }

  get inviteText(): string {
    if (this.joiningResponse == null) {
      return '';
    }
    return this.i18nService.translateAndInsertTags('join.invited_to_join', {
      projectName: this.joiningResponse.projectName,
      role: this.i18nService.localizeRole(this.joiningResponse.role)
    });
  }

  get isJoining(): boolean {
    return this.joiningProgress === 'joining';
  }

  get isOnline(): boolean {
    return this.pwaService.isOnline;
  }

  async joinProject(): Promise<void> {
    if (!this.name.valid || this.joiningResponse == null) {
      return;
    }
    this.joiningProgress = 'joining';
    try {
      this.name.disable();
      await this.anonymousService.generateAccount(
        this.joiningResponse.shareKey,
        this.name.value,
        this.i18nService.localeCode
      );
      await this.authService.tryTransparentAuthentication();
      if (await this.authService.isLoggedIn) {
        await this.joinWithShareKey(this.joiningResponse.shareKey);
      } else {
        this.reportingService.silentError('Unable to login after generating transparent user account');
        await this.dialogService.message('join.error_occurred_login', 'error_messages.try_again');
        this.name.enable();
      }
    } catch (e) {
      await this.invalidShareLink();
    }
    this.joiningProgress = undefined;
  }

  logIn(): void {
    if (this.joiningProgress != null) {
      return;
    }
    this.authService.logIn({ returnUrl: this.locationService.pathname, signUp: false });
  }

  private async joinWithShareKey(shareKey: string): Promise<void> {
    // if the link has sharing turned on, check if the current user needs to be added to the project
    try {
      // It doesn't matter if they are logged in, but we do need to wait for authentication to complete
      // If that fails the user will be redirected to auth0 to sign up
      await this.authService.isLoggedIn;
      const projectId = await this.projectService.onlineJoinWithShareKey(shareKey);
      this.router.navigateByUrl(`/projects/${projectId}`, { replaceUrl: true });
    } catch (err) {
      if (
        err instanceof CommandError &&
        (err.code === CommandErrorCode.Forbidden || err.code === CommandErrorCode.NotFound)
      ) {
        await this.invalidShareLink();
      } else {
        throw err;
      }
      this.router.navigateByUrl('/projects', { replaceUrl: true });
    }
  }

  private async checkShareKey(shareKey: string): Promise<void> {
    this.loadingStarted();
    const isLoggedIn: boolean = await this.authService.isLoggedIn;
    if (isLoggedIn) {
      await this.joinWithShareKey(shareKey);
    }
    this.name.setValidators([Validators.required, XFValidators.someNonWhitespace]);
    try {
      this.joiningResponse = await this.anonymousService.checkShareKey(shareKey);
      this.loadingFinished();
    } catch {
      await this.invalidShareLink();
    }
  }

  private async showOfflineMessage(): Promise<void> {
    if (this.pwaService.isOnline) {
      this.name.enable();
      this.joiningProgress = undefined;
      return;
    }
    if (await this.authService.isLoggedIn) {
      await this.dialogService.message('join.please_connect_to_use_link');
      this.router.navigateByUrl('/projects', { replaceUrl: true });
      return;
    } else {
      this.name.disable();
      this.joiningProgress = 'unavailable';
    }
  }

  private async invalidShareLink(): Promise<void> {
    await this.dialogService.message('join.project_link_is_invalid');
    this.locationService.go(this.locationService.origin);
  }
}
