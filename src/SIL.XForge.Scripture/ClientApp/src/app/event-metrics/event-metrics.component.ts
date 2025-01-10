import { Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { EventMetricsLogComponent } from './event-metrics-log.component';

@Component({
  selector: 'app-event-metrics',
  templateUrl: './event-metrics.component.html',
  styleUrls: ['./event-metrics.component.scss'],
  standalone: true,
  imports: [EventMetricsLogComponent, TranslocoModule]
})
export class EventMetricsComponent {}
