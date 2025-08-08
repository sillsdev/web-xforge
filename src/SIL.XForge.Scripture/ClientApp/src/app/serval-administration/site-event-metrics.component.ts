import { Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { DraftJobsComponent } from './draft-jobs.component';

/**
 * Site-wide draft jobs component for the serval administration page.
 * Shows draft jobs across all projects for system administrators.
 */
@Component({
  selector: 'app-site-event-metrics',
  templateUrl: './site-event-metrics.component.html',
  styleUrls: ['./site-event-metrics.component.scss'],
  standalone: true,
  imports: [DraftJobsComponent, TranslocoModule]
})
export class SiteEventMetricsComponent {}
