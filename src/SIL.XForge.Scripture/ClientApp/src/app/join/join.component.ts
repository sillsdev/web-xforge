import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { en, I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { ObjectPaths } from '../../type-utils';
import { CommandError } from '../../xforge-common/command.service';
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
  name: FormControl<string | null> = new FormControl<string | null>('');
  status: 'input' | 'joining' | 'unavailable' = 'unavailable';
  private joiningResponse?: AnonymousShareKeyResponse;

  constructor(
    private readonly anonymousService: AnonymousService,
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    readonly i18nService: I18nService,
    private readonly locationService: LocationService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly reportingService: ErrorReportingService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    noticeService: NoticeService
  ) {
    super(noticeService);
    const joining$ = this.route.params.pipe(
      map(params => ({
        shareKey: params['shareKey'] as string,
        locale: (params['locale'] as string | undefined) ?? I18nService.defaultLocale.canonicalTag
      })),
      filter(key => typeof key.shareKey === 'string')
    );
    const checkLinkSharing$ = combineLatest([joining$, this.onlineStatusService.onlineStatus$]).pipe(
      filter(([_, isOnline]) => isOnline),
      map(([joining, _]) => joining),
      distinctUntilChanged()
    );
    this.subscribe(checkLinkSharing$, joining => {
      // Set locale only if not logged in
      if (this.authService.currentUserId == null) {
        this.i18nService.setLocale(joining.locale, this.authService);
      }
      this.initialize(joining.shareKey);
    });
    this.subscribe(this.onlineStatusService.onlineStatus$, () => this.updateOfflineJoiningStatus());
  }

  get isFormEnabled(): boolean {
    return this.status === 'input';
  }

  get inviteText(): string {
    if (this.joiningResponse == null) {
      return '';
    }
    return this.i18nService.translateAndInsertTags('join.invited_to_join', {
      projectName: this.joiningResponse.projectName
    });
  }

  get isJoining(): boolean {
    return this.status === 'joining';
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  async joinProject(): Promise<void> {
    if (!this.name.valid || this.name.value == null || this.joiningResponse == null) {
      return;
    }
    this.status = 'joining';
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
      await this.handleErrorJoining(e);
      this.locationService.go(this.locationService.origin);
    }
    this.status = 'input';
  }

  logIn(): void {
    if (this.status !== 'input') {
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
      this.handleErrorJoining(err);
      this.router.navigateByUrl('/projects', { replaceUrl: true });
    }
  }

  private async initialize(shareKey: string): Promise<void> {
    this.loadingStarted();
    const isLoggedIn: boolean = await this.authService.isLoggedIn;
    if (isLoggedIn) {
      await this.joinWithShareKey(shareKey);
      return;
    }
    this.name.setValidators([Validators.required, XFValidators.someNonWhitespace]);
    try {
      this.joiningResponse = await this.anonymousService.checkShareKey(shareKey);
    } catch (e) {
      await this.handleErrorJoining(e);
      this.locationService.go(this.locationService.origin);
    } finally {
      this.loadingFinished();
    }
  }

  private async updateOfflineJoiningStatus(): Promise<void> {
    if (this.onlineStatusService.isOnline && this.status === 'unavailable') {
      this.name.enable();
      this.status = 'input';
    } else if (!this.onlineStatusService.isOnline && (await this.authService.isLoggedIn)) {
      await this.dialogService.message('join.please_connect_to_use_link');
      this.router.navigateByUrl('/projects', { replaceUrl: true });
    } else {
      this.name.disable();
      this.status = 'unavailable';
    }
  }

  private async showJoinError(key: ObjectPaths<typeof en.join>): Promise<void> {
    await this.dialogService.message(`join.${key}`);
  }

  private async handleErrorJoining(error: unknown): Promise<void> {
    const KNOWN_ERROR_CODES: ObjectPaths<typeof en.join>[] = [
      'error_occurred_login',
      'key_already_used',
      'key_expired',
      'max_users_reached',
      'role_not_found'
    ];

    if (error instanceof HttpErrorResponse && KNOWN_ERROR_CODES.includes(error.error)) {
      await this.showJoinError(error.error);
    } else if (error instanceof CommandError && KNOWN_ERROR_CODES.includes(error.message as any)) {
      await this.showJoinError(error.message as any);
    } else {
      throw error;
    }
  }
}
