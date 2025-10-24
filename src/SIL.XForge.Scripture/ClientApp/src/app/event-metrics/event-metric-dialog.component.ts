import { Component, Inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { JsonViewerComponent } from '../shared/json-viewer/json-viewer.component';
import { EventMetric } from './event-metric';

@Component({
  selector: 'app-event-metric-dialog',
  templateUrl: './event-metric-dialog.component.html',
  styleUrls: ['./event-metric-dialog.component.scss'],
  imports: [
    MatButton,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    TranslocoModule,
    JsonViewerComponent
  ]
})
export class EventMetricDialogComponent {
  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: EventMetric
  ) {}
}
