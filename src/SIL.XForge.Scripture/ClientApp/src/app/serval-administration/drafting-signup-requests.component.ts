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
import { UserService } from 'xforge-common/user.service';
import { RouterLinkDirective } from '../../xforge-common/router-link.directive';
import { NoticeComponent } from '../shared/notice/notice.component';
import { projectLabel } from '../shared/utils';
import { DraftingSignupService } from '../translate/draft-generation/drafting-signup.service';
import { DRAFT_REQUEST_RESOLUTION_OPTIONS, getResolutionLabel, getStatusLabel } from './draft-request-constants';
import { ServalAdministrationService } from './serval-administration.service';

/** Represents a draft request as returned from the backend. */
interface DraftingSignupRequest {
  id: string;
  submission: {
    projectId: string;
    userId: string;
    timestamp: string;
    formData: {
      name: string;
      email: string;
      organization?: string;
      projectLanguageName?: string;
      projectLanguageCode?: string;
      ntStage?: string;
      otStage?: string;
      completedBooks?: number[];
      nextBooksToDraft?: number[];
      sourcesUsed?: string;
      isAdaptation?: string;
      primarySourceProject?: string;
      primarySourceIsoCode?: string;
      secondarySourceProject?: string;
      additionalSourceProject?: string;
      draftingSourceProject?: string;
      backTranslationStage?: string;
      backTranslationProject?: string;
      additionalComments?: string;
      partnerOrganization?: string;
      partnerName?: string;
    };
  };
  // Assignee ID - empty string represents "Unassigned"
  assigneeId: string;
  // Status of the request: "new", "in_progress", "completed", etc.
  status: string;
}

type RequestFilterFunction = (request: DraftingSignupRequest, currentUserId: string | undefined) => boolean;

interface FilterOption {
  name: string;
  filter: RequestFilterFunction;
}

const filterOptions = {
  newAndMine: {
    name: 'New + Mine',
    filter: (request: DraftingSignupRequest, currentUserId: string | undefined) =>
      request.status === 'new' || request.assigneeId === currentUserId
  },
  new: {
    name: 'New',
    filter: (request: DraftingSignupRequest, _currentUserId: string | undefined) => request.status === 'new'
  },
  mine: {
    name: 'Mine',
    filter: (request: DraftingSignupRequest, currentUserId: string | undefined) => request.assigneeId === currentUserId
  },
  in_progress: {
    name: 'In Progress',
    filter: (request: DraftingSignupRequest, _currentUserId: string | undefined) => request.status === 'in_progress'
  },
  completed: {
    name: 'Completed',
    filter: (request: DraftingSignupRequest, _currentUserId: string | undefined) => request.status === 'completed'
  },
  all: {
    name: 'All',
    filter: (_request: DraftingSignupRequest, _currentUserId: string | undefined) => true
  }
} as const satisfies Record<string, FilterOption>;

type FilterName = keyof typeof filterOptions;

/**
 * Component for displaying draft requests in the Serval Administration interface.
 * Only accessible to Serval admins.
 */
@Component({
  selector: 'app-drafting-signup-requests',
  standalone: true,
  templateUrl: './drafting-signup-requests.component.html',
  styleUrls: ['./drafting-signup-requests.component.scss'],
  imports: [
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
export class DraftingSignupRequestsComponent extends DataLoadingComponent implements OnInit {
  requests: DraftingSignupRequest[] = [];
  filteredRequests: DraftingSignupRequest[] = [];
  displayedColumns: string[] = ['project', 'user', 'status', 'assignee', 'resolution'];
  currentUserId?: string;
  assignedUserIds: Set<string> = new Set();
  userDisplayNames: Map<string, string> = new Map();
  projectNames: Map<string, string> = new Map();
  filterOptions = filterOptions;

  // Resolution options
  readonly resolutionOptions = DRAFT_REQUEST_RESOLUTION_OPTIONS;

  value: number | null = null;
  options = [
    { label: 'None', value: null },
    { label: 'One', value: 1 },
    { label: 'Two', value: 2 },
    { label: 'Three', value: 3 }
  ];

  constructor(
    private readonly userService: UserService,
    protected readonly noticeService: NoticeService,
    private readonly servalAdministrationService: ServalAdministrationService,
    private readonly draftingSignupService: DraftingSignupService
  ) {
    super(noticeService);
  }

  ngOnInit(): void {
    this.currentUserId = this.userService.currentUserId;
    void this.loadRequests();
  }

  private async loadRequests(): Promise<void> {
    this.loadingStarted();
    try {
      const requests = await this.draftingSignupService.getAllRequests();
      if (requests != null) {
        this.requests = requests;
        this.initializeRequestData();
      }
      this.loadingFinished();
    } catch (error) {
      console.error('Error loading draft requests:', error);
      this.noticeService.showError('Failed to load draft requests');
      this.loadingFinished();
    }
  }

  /**
   * Initializes derived data from the requests array.
   * Called after loading all requests or after updating individual requests.
   */
  private initializeRequestData(): void {
    // Collect all assigned user IDs for the dropdown options (excluding empty string)
    this.assignedUserIds = new Set(
      this.requests.map(r => r.assigneeId).filter((id): id is string => id != null && id !== '')
    );

    // Pre-cache display names for all assigned users
    this.assignedUserIds.forEach(userId => void this.cacheUserDisplayName(userId));

    this.filterRequests();

    // Load project names for all requests
    void this.loadProjectNames();
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

  /**
   * Gets the list of user IDs to show in the assignee dropdown (excluding "Unassigned").
   * Includes current user first, then all users assigned to other requests.
   */
  getAssignedUserOptions(): string[] {
    const options: string[] = [];

    // Add current user first if available
    if (this.currentUserId != null) {
      options.push(this.currentUserId);
      void this.cacheUserDisplayName(this.currentUserId);
    }

    // Add all other assigned users
    this.assignedUserIds.forEach(userId => {
      if (userId !== this.currentUserId && !options.includes(userId)) {
        options.push(userId);
        void this.cacheUserDisplayName(userId);
      }
    });

    return options;
  }

  /**
   * Caches the display name for a user ID.
   */
  private async cacheUserDisplayName(userId: string): Promise<void> {
    if (!this.userDisplayNames.has(userId)) {
      try {
        const userDoc = await this.userService.getProfile(userId);
        if (userDoc?.data != null) {
          const displayName = this.currentUserId === userId ? 'Me' : userDoc.data.displayName || 'Unknown User';
          this.userDisplayNames.set(userId, displayName);
        }
      } catch (error) {
        console.error('Error loading user display name:', error);
        this.userDisplayNames.set(userId, 'Unknown User');
      }
    }
  }

  /** Gets the display name for a user ID. */
  getUserDisplayName(userId: string): string {
    return this.userDisplayNames.get(userId) || 'Loading...';
  }

  /** Gets the user-friendly label for a status value. */
  getStatusLabel(status: string): string {
    return getStatusLabel(status);
  }

  /** Gets the display label for a resolution value. */
  getResolutionLabelDisplay(resolution: string | null): string {
    return getResolutionLabel(resolution);
  }

  /**
   * Comparison function for resolution values.
   * Needed to properly handle null values in the select dropdown and the resolution not yet being set on a request.
   */
  compareResolutions(r1: string | null, r2: string | null): boolean {
    return r1 === r2 || (r1 == null && r2 == null);
  }

  private _activeFilter: FilterName = 'newAndMine';
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
      this.filteredRequests = this.requests.filter(request => filterFunction(request, this.currentUserId));
    }
  }

  /**
   * Handles assignee change for a request.
   * Calls the backend to persist the change and updates local state with the response.
   */
  async onAssigneeChange(request: DraftingSignupRequest, newAssigneeId: string): Promise<void> {
    try {
      // Call backend to persist the assignee and status change
      const updatedRequest = await this.draftingSignupService.setAssignee(request.id, newAssigneeId);

      // Find and replace the request in the local array with the updated version
      const index = this.requests.findIndex(r => r.id === request.id);
      if (index !== -1) {
        // Create a new array to trigger Angular change detection
        this.requests = [...this.requests.slice(0, index), updatedRequest, ...this.requests.slice(index + 1)];
      }

      // Re-initialize derived data (assigned users, cached names, etc.)
      this.initializeRequestData();
    } catch (error) {
      console.error('Error updating assignee:', error);
      this.noticeService.showError('Failed to update assignee');
      // Reload to restore correct state
      await this.loadRequests();
    }
  }

  /**
   * Handles resolution change for a request.
   * Calls the backend to persist the change and updates local state with the response.
   */
  async onResolutionChange(request: DraftingSignupRequest, newResolution: string | null): Promise<void> {
    try {
      // Call backend to update resolution
      const updatedRequest = await this.draftingSignupService.setResolution(request.id, newResolution);

      // Find and replace the request in the local array with the updated version
      const index = this.requests.findIndex(r => r.id === request.id);
      if (index !== -1) {
        // Create a new array to trigger Angular change detection
        this.requests = [...this.requests.slice(0, index), updatedRequest, ...this.requests.slice(index + 1)];
      }

      // Re-initialize derived data
      this.initializeRequestData();
    } catch (error) {
      console.error('Error updating resolution:', error);
      this.noticeService.showError('Failed to update resolution');
      // Reload to restore correct state
      await this.loadRequests();
    }
  }
}
