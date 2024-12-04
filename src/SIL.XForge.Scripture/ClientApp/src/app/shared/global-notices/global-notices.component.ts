import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeComponent } from '../notice/notice.component';

@Component({
  selector: 'app-global-notices',
  standalone: true,
  imports: [CommonModule, NoticeComponent, MatIconModule, MatButtonModule, MatTooltipModule, TranslocoModule],
  templateUrl: './global-notices.component.html',
  styleUrl: './global-notices.component.scss'
})
export class GlobalNoticesComponent {
  // This is only an input so that the Storybook can turn this on even when it's off in the app
  @Input() showDowntimeNotice = false;

  upcomingDowntime = {
    start: new Date('2024-12-04 16:30 UTC'),
    durationMin: 2,
    durationMax: 6,
    durationUnit: 'hour',
    detailsUrl: 'https://software.sil.org/scriptureforge/scripture-forge-will-be-unavailable-for-scheduled-maintenance/'
  } as const;

  constructor(readonly i18n: I18nService) {}

  get duration(): string {
    return this.i18n.translateStatic(`global_notices.${this.upcomingDowntime.durationUnit}_range`, {
      min: this.upcomingDowntime.durationMin,
      max: this.upcomingDowntime.durationMax
    });
  }
}
