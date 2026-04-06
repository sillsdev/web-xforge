import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { TranslocoModule } from '@ngneat/transloco';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';
import { UserService } from 'xforge-common/user.service';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { projectLabel } from '../../shared/utils';
import {
  ONBOARDING_REQUEST_RESOLUTION_OPTIONS,
  OnboardingRequest,
  OnboardingRequestResolutionKey,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { OnboardingRequestAssigneeSelectComponent } from '../onboarding-request-assignee-select/onboarding-request-assignee-select.component';
import { ServalAdministrationService } from '../serval-administration.service';

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
    MatInputModule
  ]
})
export class OnboardingRequestsComponent extends DataLoadingComponent implements OnInit {
  requests: OnboardingRequest[] = [];
  filteredRequests: OnboardingRequest[] = [];
  displayedColumns: string[] = ['status', 'project', 'languageCode', 'user', 'assignee', 'resolution'];
  currentUserId?: string;
  assignedUserIds: Set<string> = new Set();
  userDisplayNames: Map<string, string> = new Map();
  projectNames: Map<string, string> = new Map();
  filterOptions = filterOptions;

  resolutionOptions = ONBOARDING_REQUEST_RESOLUTION_OPTIONS;
  existingAssigneeIds: string[] = [];

  value: number | null = null;

  constructor(
    readonly userService: UserService,
    noticeService: NoticeService,
    private readonly servalAdministrationService: ServalAdministrationService,
    readonly onboardingRequestService: OnboardingRequestService
  ) {
    super(noticeService, 'OnboardingRequestsComponent');
  }

  ngOnInit(): void {
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

  getStatus = this.onboardingRequestService.getStatus;

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
    if (filterFunction) {
      this.filteredRequests = this.requests.filter(request => filterFunction(request, this.userService.currentUserId));
    }
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
