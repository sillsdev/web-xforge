import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { EventMetric } from './event-metric';

@Component({
    selector: 'app-event-metric-dialog',
    templateUrl: './event-metric-dialog.component.html',
    styleUrls: ['./event-metric-dialog.component.scss'],
    imports: [CommonModule, MatDialogModule, TranslocoModule, UICommonModule]
})
export class EventMetricDialogComponent {
  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: EventMetric
  ) {}
}
