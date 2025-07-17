import { Component, OnInit } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { MobileNotSupportedComponent } from '../shared/mobile-not-supported/mobile-not-supported.component';
import { DraftJobsComponent } from './draft-jobs.component';
import { ServalProjectsComponent } from './serval-projects.component';

/**
 * Main serval administration component with tabbed interface.
 * Supports URL parameters for filtering by project ID and selecting specific tabs.
 */
@Component({
  selector: 'app-serval-administration',
  templateUrl: './serval-administration.component.html',
  styleUrls: ['./serval-administration.component.scss'],
  imports: [ServalProjectsComponent, MobileNotSupportedComponent, DraftJobsComponent, MatTabsModule, UICommonModule],
  standalone: true
})
export class ServalAdministrationComponent implements OnInit {
  selectedTabIndex = 0;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  private readonly availableTabs = ['projects', 'draft-jobs'];

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      this.selectedTabIndex = this.availableTabs.includes(tab) ? this.availableTabs.indexOf(tab) : 0;
    });
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.availableTabs[index] },
      queryParamsHandling: 'preserve'
    });
  }
}
