import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { saveAs } from 'file-saver';
import { distinctUntilChanged, map } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';
import { UserService } from 'xforge-common/user.service';
import { isPopulatedString, isString } from '../../../type-utils';
import { InfoComponent } from '../../shared/info/info.component';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { parseDate, projectLabel } from '../../shared/utils';
import {
  ONBOARDING_REQUEST_RESOLUTION_OPTIONS,
  OnboardingRequest,
  OnboardingRequestResolutionKey,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { DateRangePickerComponent, NormalizedDateRange } from '../date-range-picker.component';
import { OnboardingRequestAssigneeSelectComponent } from '../onboarding-request-assignee-select/onboarding-request-assignee-select.component';
import { ServalAdministrationService } from '../serval-administration.service';
import { OnboardingRequestsExportService } from './onboarding-requests-export.service';

type RequestFilterFunction = (request: OnboardingRequest, currentUserId: string | undefined) => boolean;

interface FilterOption {
  name: string;
  filter: RequestFilterFunction;
}

const filterOptions = {
  newAndMyActiveRequests: {
    name: 'New + My Active Requests',
    filter: (request: OnboardingRequest, currentUserId: string | undefined) =>
      request.status === 'new' || (request.assigneeId === currentUserId && request.status === 'in_progress')
  },
  new: {
    name: 'New',
    filter: (request: OnboardingRequest, _currentUserId: string | undefined) => request.status === 'new'
  },
  mine: {
    name: 'Mine',
    filter: (request: OnboardingRequest, currentUserId: string | undefined) => request.assigneeId === currentUserId
  },
  in_progress: {
    name: 'In Progress',
    filter: (request: OnboardingRequest, _currentUserId: string | undefined) => request.status === 'in_progress'
  },
  outsources: {
    name: 'Outsourced',
    filter: (request: OnboardingRequest, _currentUserId: string | undefined) => request.resolution === 'outsourced'
  },
  completed: {
    name: 'Completed',
    filter: (request: OnboardingRequest, _currentUserId: string | undefined) => request.status === 'completed'
  },
  all: {
    name: 'All',
    filter: (_request: OnboardingRequest, _currentUserId: string | undefined) => true
  }
} as const satisfies Record<string, FilterOption>;

type FilterName = keyof typeof filterOptions;

/**
 * Component for displaying onboarding requests in the Serval Administration interface.
 * Only accessible to Serval admins.
 */
@Component({
  selector: 'app-onboarding-requests',
  standalone: true,
  templateUrl: './onboarding-requests.component.html',
  styleUrls: ['./onboarding-requests.component.scss'],
  imports: [
    OnboardingRequestAssigneeSelectComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslocoModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    OwnerComponent,
    NoticeComponent,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    RouterLinkDirective,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    InfoComponent,
    DateRangePickerComponent
  ],
  providers: [provideNativeDateAdapter()]
})
export class OnboardingRequestsComponent extends DataLoadingComponent implements OnInit {
  requests: OnboardingRequest[] = [];
  filteredRequests: OnboardingRequest[] = [];
  displayedColumns: string[] = ['status', 'project', 'languageCode', 'user', 'email', 'assignee', 'resolution'];
  currentUserId?: string;
  assignedUserIds: Set<string> = new Set();
  projectNames: Map<string, string> = new Map();
  filterOptions = filterOptions;
  dateFrom: Date | null = null;
  dateTo: Date | null = null;

  resolutionOptions = ONBOARDING_REQUEST_RESOLUTION_OPTIONS;
  existingAssigneeIds: string[] = [];
  searchControl: FormControl<string> = new FormControl('', { nonNullable: true });
  private currentSearchQueryParam: string | null = null;

  value: number | null = null;

  constructor(
    readonly userService: UserService,
    noticeService: NoticeService,
    private readonly servalAdministrationService: ServalAdministrationService,
    readonly onboardingRequestService: OnboardingRequestService,
    private readonly exportService: OnboardingRequestsExportService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef
  ) {
    super(noticeService, 'OnboardingRequestsComponent');

    this.searchControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((searchTerm: string) => {
      this.updateUrlSearchQueryParam(searchTerm);
      this.filterRequests();
    });
  }

  ngOnInit(): void {
    this.route.queryParams
      .pipe(
        map(params => params['q']),
        map((queryParam: unknown) => (isString(queryParam) ? queryParam : null)),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((searchText: string | null) => {
        this.currentSearchQueryParam = searchText;
        const searchTextValue: string = searchText ?? '';
        if (this.searchControl.value !== searchTextValue) {
          this.searchControl.setValue(searchTextValue, { emitEvent: false });
        }
        this.filterRequests();
      });

    void this.loadRequests();
  }

  private async loadRequests(): Promise<void> {
    this.loadingStarted();
    try {
      void this.loadExistingAssigneeIds();
      const requests = await this.onboardingRequestService.getAllRequests();
      if (requests != null) {
        this.requests = requests;
        this.filterRequests();
        void this.loadProjectNames();
      }
    } finally {
      this.loadingFinished();
    }
  }

  private async loadExistingAssigneeIds(): Promise<void> {
    this.existingAssigneeIds = await this.onboardingRequestService.getCurrentlyAssignedUserIds();
  }

  /** Loads project names for all requests and caches them in the projectNames map. */
  private async loadProjectNames(): Promise<void> {
    // Get unique project IDs from requests
    const projectIds = new Set(this.requests.map(r => r.submission.projectId));

    // Fetch project data for each unique project ID
    for (const projectId of projectIds) {
      const projectDoc = await this.servalAdministrationService.get(projectId);
      if (projectDoc?.data != null) {
        this.projectNames.set(projectId, projectLabel(projectDoc.data));
      } else {
        this.projectNames.set(projectId, projectId);
      }
    }

    // Re-filter once project labels are loaded so search by project name works.
    this.filterRequests();
  }

  /** Exports the currently filtered requests as a CSV file. */
  exportCsv(): Promise<void> {
    return this.export('csv');
  }

  /** Exports the currently filtered requests as a TSV file. */
  exportTsv(): Promise<void> {
    return this.export('tsv');
  }

  private async export(extension: 'csv' | 'tsv'): Promise<void> {
    const requests = this.filteredRequests;
    if (requests.length === 0) {
      this.noticeService.show('No data to export.');
      return;
    }

    const content =
      extension === 'csv' ? await this.exportService.createCsv(requests) : await this.exportService.createTsv(requests);
    const mimeType = extension === 'csv' ? 'text/csv;charset=utf-8;' : 'text/tab-separated-values;charset=utf-8;';
    const blob = new Blob([content], { type: mimeType });
    saveAs(blob, this.exportService.exportFilename(extension));
  }

  /** Gets the project name for display, or falls back to project ID if not loaded yet. */
  getProjectName(projectId: string): string {
    return this.projectNames.get(projectId) ?? projectId;
  }

  private _activeFilter: FilterName = 'newAndMyActiveRequests';
  get activeFilter(): string {
    return this._activeFilter;
  }
  set activeFilter(value: FilterName) {
    this._activeFilter = value;
    this.filterRequests();
  }

  get currentFilterName(): string {
    return this.filterOptions[this._activeFilter].name;
  }

  filterRequests(): void {
    const filterOption = this.filterOptions[this._activeFilter];
    const filterFunction = filterOption?.filter;
    let filterToggleRequests: OnboardingRequest[] = [];
    if (filterFunction) {
      filterToggleRequests = this.requests.filter(request => filterFunction(request, this.userService.currentUserId));
    }
    this.filteredRequests = filterToggleRequests.filter(
      request => this.isWithinSelectedDateRange(request) && this.applyFilter(request)
    );
  }

  onDateFilterChange(dateRange: NormalizedDateRange): void {
    this.dateFrom = dateRange.start;
    this.dateTo = dateRange.end;
    this.filterRequests();
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  private applyFilter(request: OnboardingRequest): boolean {
    const normalizedSearchTerm: string = this.normalizeSearchTerm(this.searchControl.value);
    if (!isPopulatedString(normalizedSearchTerm)) {
      return true;
    }

    return this.searchableData(request).some(data => data.includes(normalizedSearchTerm));
  }

  private searchableData(request: OnboardingRequest): string[] {
    return [
      this.getProjectName(request.submission.projectId),
      request.submission.formData.name,
      request.submission.formData.email,
      request.submission.formData.translationLanguageIsoCode
    ]
      .filter(isPopulatedString)
      .map(data => this.normalizeSearchTerm(data));
  }

  private normalizeSearchTerm(value: string): string {
    return value.trim().toLowerCase();
  }

  private updateUrlSearchQueryParam(query: string): void {
    const queryParam: string | null = isPopulatedString(query) ? query : null;
    if (this.currentSearchQueryParam === queryParam) {
      return;
    }

    this.currentSearchQueryParam = queryParam;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: queryParam },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private isWithinSelectedDateRange(request: OnboardingRequest): boolean {
    const requestDate: Date | undefined = parseDate(request.submission.timestamp);
    if (requestDate == null) {
      return false;
    }

    if (this.dateFrom != null) {
      if (requestDate < this.dateFrom) {
        return false;
      }
    }

    if (this.dateTo != null) {
      if (requestDate > this.dateTo) {
        return false;
      }
    }

    return true;
  }

  /**
   * Handles assignee change for a request.
   * Calls the backend to persist the change and updates local state with the response.
   */
  async onAssigneeChange(request: OnboardingRequest, newAssigneeId: string): Promise<void> {
    try {
      // Call backend to persist the assignee and status change
      const updatedRequest = await this.onboardingRequestService.setAssignee(request.id, newAssigneeId);

      // Find and replace the request in the local array with the updated version
      const index = this.requests.findIndex(r => r.id === request.id);
      if (index !== -1) {
        // Create a new array to trigger Angular change detection
        this.requests = [...this.requests.slice(0, index), updatedRequest, ...this.requests.slice(index + 1)];
      }
    } catch (error) {
      console.error('Error updating assignee:', error);
      this.noticeService.showError('Failed to update assignee');
      // Reload to restore correct state
      await this.loadRequests();
    } finally {
      this.filterRequests();
    }
  }

  /**
   * Handles resolution change for a request.
   * Calls the backend to persist the change and updates local state with the response.
   */
  async onResolutionChange(
    request: OnboardingRequest,
    newResolution: OnboardingRequestResolutionKey | null
  ): Promise<void> {
    try {
      // Call backend to update resolution
      const updatedRequest = await this.onboardingRequestService.setResolution(request.id, newResolution);

      // Find and replace the request in the local array with the updated version
      const index = this.requests.findIndex(r => r.id === request.id);
      if (index !== -1) {
        // Create a new array to trigger Angular change detection
        this.requests = [...this.requests.slice(0, index), updatedRequest, ...this.requests.slice(index + 1)];
      }
    } catch (error) {
      console.error('Error updating resolution:', error);
      this.noticeService.showError('Failed to update resolution');
      // Reload to restore correct state
      await this.loadRequests();
    } finally {
      this.filterRequests();
    }
  }
}
