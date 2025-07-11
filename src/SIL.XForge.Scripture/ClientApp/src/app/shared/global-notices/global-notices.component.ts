import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { AuthService } from 'xforge-common/auth.service';
import { I18nKeyForComponent, I18nService } from 'xforge-common/i18n.service';
import { NoticeComponent } from '../notice/notice.component';

@Component({
  selector: 'app-global-notices',
  standalone: true,
  imports: [CommonModule, NoticeComponent, MatIconModule, MatButtonModule, MatTooltipModule, TranslocoModule],
  templateUrl: './global-notices.component.html',
  styleUrl: './global-notices.component.scss'
})
export class GlobalNoticesComponent {
  // This is only an input so that the Storybook show the notice even when it's hidden in the app
  @Input() hideNotice = false;

  get showNotice(): boolean {
    // Hide the notice for users that are not logged in since it mentions DBL and shouldn't be shown on whitelabled site
    return !this.hideNotice && this.userLoggedIn === true;
  }

  messageKey: I18nKeyForComponent<'global_notices'> = 'dbl_maintenance';

  upcomingDowntime = {
    start: new Date('2025-07-13 12:00:00 UTC'),
    durationMin: 24,
    durationMax: 48,
    durationUnit: 'hour',
    detailsUrl: 'https://paratext.org/2025/07/09/dbl-down-two-days-in-july/'
  } as const;

  userLoggedIn?: boolean;

  constructor(
    readonly i18n: I18nService,
    private readonly authService: AuthService
  ) {
    this.authService.isLoggedIn.then(isLoggedIn => (this.userLoggedIn = isLoggedIn));
  }

  get duration(): string {
    return this.i18n.translateStatic(`global_notices.${this.upcomingDowntime.durationUnit}_range`, {
      min: this.upcomingDowntime.durationMin,
      max: this.upcomingDowntime.durationMax
    });
  }
}
