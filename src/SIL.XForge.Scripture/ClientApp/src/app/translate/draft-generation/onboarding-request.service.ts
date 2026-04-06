import { Injectable } from '@angular/core';
import { CommandService } from 'xforge-common/command.service';
import { ONBOARDING_REQUESTS_URL } from 'xforge-common/url-constants';
import { SFProjectService } from '../../core/sf-project.service';

export interface OnboardingRequestComment {
  id: string;
  userId: string;
  text: string;
  dateCreated: string;
}

export interface DraftingSignupFormData {
  name: string;
  email: string;
  organization: string;
  partnerOrganization: string;

  translationLanguageName: string;
  translationLanguageIsoCode: string;

  completedBooks: number[];
  nextBooksToDraft: number[];

  sourceProjectA: string;
  sourceProjectB?: string;
  sourceProjectC?: string;
  draftingSourceProject: string;

  backTranslationStage: string;
  backTranslationProject: string | null;
  backTranslationLanguageName?: string;
  backTranslationLanguageIsoCode?: string;

  additionalComments?: string;
}

export interface OnboardingRequest {
  id: string;
  submittedAt: string;
  submittedBy: { name: string; email: string };
  submission: {
    projectId: string;
    userId: string;
    timestamp: string;
    formData: DraftingSignupFormData;
  };
  assigneeId: string;
  status: OnboardingRequestStatusOption;
  resolution: OnboardingRequestResolutionKey;
  comments: OnboardingRequestComment[];
}

/** Represents a comment on an onboarding request. */
export interface OnboardingRequestComment {
  id: string;
  userId: string;
  text: string;
  dateCreated: string;
}

/** Status options for onboarding requests. Some are user-selectable, others are system-managed. */
export const ONBOARDING_REQUEST_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
] as const;
export type OnboardingRequestStatusOption = (typeof ONBOARDING_REQUEST_STATUS_OPTIONS)[number]['value'];
export type OnboardingRequestStatusMetadata = (typeof ONBOARDING_REQUEST_STATUS_OPTIONS)[number];

export const ONBOARDING_REQUEST_RESOLUTION_OPTIONS = [
  { key: 'unresolved', label: 'Unresolved' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
  { key: 'outsourced', label: 'Outsourced' }
] as const;

export type OnboardingRequestResolutionKey = (typeof ONBOARDING_REQUEST_RESOLUTION_OPTIONS)[number]['key'];
export type OnboardingRequestResolutionMetadata = (typeof ONBOARDING_REQUEST_RESOLUTION_OPTIONS)[number];

@Injectable({ providedIn: 'root' })
export class OnboardingRequestService {
  constructor(
    private readonly commandService: CommandService,
    private readonly projectService: SFProjectService
  ) {}

  getStatus(status: OnboardingRequestStatusOption): OnboardingRequestStatusMetadata {
    return ONBOARDING_REQUEST_STATUS_OPTIONS.find(opt => opt.value === status)!;
  }

  getResolution(resolution: OnboardingRequestResolutionKey): OnboardingRequestResolutionMetadata {
    return ONBOARDING_REQUEST_RESOLUTION_OPTIONS.find(opt => opt.key === resolution)!;
  }

  /**
   * Comparison function for resolution values in select dropdowns.
   * Needed to properly handle null values when the resolution has not yet been set on a request.
   */
  compareResolutions(r1: string | null, r2: string | null): boolean {
    return r1 === r2 || (r1 == null && r2 == null);
  }

  /** Approves an onboarding request and enables pre-translation for the project. */
  async approveRequest(options: { requestId: string; sfProjectId: string }): Promise<OnboardingRequest> {
    const requestUpdateResult = await this.onlineInvoke<OnboardingRequest | undefined>('setResolution', {
      requestId: options.requestId,
      resolution: 'approved' satisfies OnboardingRequestResolutionKey
    });
    await this.projectService.onlineSetPreTranslate(options.sfProjectId, true);
    return requestUpdateResult!;
  }

  /** Submits a new onboarding request. */
  async submitOnboardingRequest(projectId: string, formData: DraftingSignupFormData): Promise<string> {
    return (await this.onlineInvoke<string>('submitOnboardingRequest', { projectId, formData }))!;
  }

  /** Gets the existing onboarding request for the specified project, if any. */
  async getOpenOnboardingRequest(projectId: string): Promise<OnboardingRequest | null> {
    return (await this.onlineInvoke<OnboardingRequest | null>('getOpenOnboardingRequest', { projectId }))!;
  }

  async getRequestById(requestId: string): Promise<OnboardingRequest> {
    return (await this.onlineInvoke<OnboardingRequest>('getRequestById', { requestId }))!;
  }

  /** Gets all onboarding requests (Serval admin only). */
  async getAllRequests(): Promise<OnboardingRequest[]> {
    return (await this.onlineInvoke<OnboardingRequest[]>('getAllRequests'))!;
  }

  /** Sets the assignee for an onboarding request (Serval admin only). */
  async setAssignee(requestId: string, assigneeId: string): Promise<OnboardingRequest> {
    return (await this.onlineInvoke<OnboardingRequest | undefined>('setAssignee', { requestId, assigneeId }))!;
  }

  /** Gets the userIds of Serval admins that are currently assigned to requests. */
  async getCurrentlyAssignedUserIds(): Promise<string[]> {
    return (await this.onlineInvoke<string[]>('getCurrentlyAssignedUserIds')) ?? [];
  }

  /** Sets the resolution of an onboarding request (Serval admin only). */
  async setResolution(
    requestId: string,
    resolution: OnboardingRequestResolutionKey | null
  ): Promise<OnboardingRequest> {
    return (await this.onlineInvoke<OnboardingRequest | undefined>('setResolution', { requestId, resolution }))!;
  }

  /** Adds a comment to an onboarding request (Serval admin only). */
  async addComment(requestId: string, commentText: string): Promise<OnboardingRequest> {
    return (await this.onlineInvoke<OnboardingRequest>('addComment', { requestId, commentText }))!;
  }

  /** Deletes an onboarding request (Serval admin only). */
  async deleteRequest(requestId: string): Promise<void> {
    await this.onlineInvoke<boolean>('deleteRequest', { requestId });
  }

  protected onlineInvoke<T>(method: string, params?: any): Promise<T | undefined> {
    return this.commandService.onlineInvoke<T>(ONBOARDING_REQUESTS_URL, method, params);
  }
}
