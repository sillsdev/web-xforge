import { HttpErrorResponse } from '@angular/common/http';
import { QuietDestroyRef } from 'xforge-common/utils';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Component, ErrorHandler } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError } from 'xforge-common/command.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { en, I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { ObjectPaths } from '../../type-utils';
import { SFProjectService } from '../core/sf-project.service';

export interface AnonymousShareKeyDetails {
  projectName: string;
  role: string;
}
export interface AnonymousShareKeyResponse extends AnonymousShareKeyDetails {
  shareKey: string;
}

export const KNOWN_ERROR_CODES: ObjectPaths<typeof en.join>[] = [
  'error_occurred_login',
  'key_already_used',
  'key_expired',
  'max_users_reached',
  'role_not_found',
  'project_link_is_invalid'
];

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
    private readonly errorHandler: ErrorHandler,
    noticeService: NoticeService,
    private destroyRef: QuietDestroyRef
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
    checkLinkSharing$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(joining => {
      // Set locale only if not logged in
      if (this.authService.currentUserId == null) {
        this.i18nService.setLocale(joining.locale);
      }
      this.initialize(joining.shareKey);
    });
    this.onlineStatusService.onlineStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateOfflineJoiningStatus());
  }

  get isFormEnabled(): boolean {
    return this.status === 'input';
  }

  get inviteText(): string {
    return this.i18nService.translateAndInsertTags('join.invited_to_join', {
      projectName: this.joiningResponse?.projectName
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
      await this.handleJoiningError(e);
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
      await this.handleJoiningError(err);
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
      await this.handleJoiningError(e);
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

  private async handleJoiningError(error: any): Promise<void> {
    let knownErrorCode: ObjectPaths<typeof en.join> | undefined;
    if (error instanceof HttpErrorResponse) {
      knownErrorCode = this.getKnownErrorCode(error.error);
    } else if (error instanceof CommandError) {
      knownErrorCode = this.getKnownErrorCode(error.message);
    }
    knownErrorCode == null ? this.errorHandler.handleError(error) : await this.showJoinError(knownErrorCode);
  }

  private getKnownErrorCode(code: any): ObjectPaths<typeof en.join> | undefined {
    if (KNOWN_ERROR_CODES.includes(code)) return code;
    if (typeof code === 'string') {
      for (const knownCode of KNOWN_ERROR_CODES) {
        if (code.includes(knownCode)) return knownCode;
      }
    }
    return undefined;
  }
}
