import { Injectable } from '@angular/core';
import { CommandService } from 'xforge-common/command.service';
import { ONBOARDING_REQUESTS_URL } from 'xforge-common/url-constants';
import { SFProjectService } from '../../core/sf-project.service';

export interface DraftRequestComment {
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

/** Represents a draft request detail. */
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
  status: DraftRequestStatusOption;
  resolution: DraftRequestResolutionKey;
  comments: DraftRequestComment[];
}

/** Represents a comment on a draft request. */
export interface DraftRequestComment {
  id: string;
  userId: string;
  text: string;
  dateCreated: string;
}

/** Status options for draft requests. Some are user-selectable, others are system-managed. */
export const DRAFT_REQUEST_STATUS_OPTIONS = [
  { value: 'new', label: 'New', icon: 'fiber_new', color: 'grey' },
  { value: 'in_progress', label: 'In Progress', icon: 'autorenew', color: 'blue' },
  { value: 'completed', label: 'Completed', icon: 'check_circle', color: 'green' }
] as const;
export type DraftRequestStatusOption = (typeof DRAFT_REQUEST_STATUS_OPTIONS)[number]['value'];
export type DraftRequestStatusMetadata = (typeof DRAFT_REQUEST_STATUS_OPTIONS)[number];

export const DRAFT_REQUEST_RESOLUTION_OPTIONS = [
  { key: null, label: 'Unresolved', icon: 'help_outline', color: 'gray' },
  { key: 'approved', label: 'Approved', icon: 'check_circle', color: 'green' },
  { key: 'declined', label: 'Declined', icon: 'cancel', color: 'red' },
  { key: 'outsourced', label: 'Outsourced', icon: 'launch', color: 'blue' }
] as const;

export type DraftRequestResolutionKey = (typeof DRAFT_REQUEST_RESOLUTION_OPTIONS)[number]['key'];
export type DraftRequestResolutionMetadata = (typeof DRAFT_REQUEST_RESOLUTION_OPTIONS)[number];

@Injectable({ providedIn: 'root' })
export class OnboardingRequestService {
  constructor(
    private readonly commandService: CommandService,
    private readonly projectService: SFProjectService
  ) {}

  getStatus(status: DraftRequestStatusOption): DraftRequestStatusMetadata {
    return DRAFT_REQUEST_STATUS_OPTIONS.find(opt => opt.value === status)!;
  }

  getResolution(resolution: DraftRequestResolutionKey): DraftRequestResolutionMetadata {
    // Use weak equality so status can be undefined or null
    // eslint-disable-next-line eqeqeq
    return DRAFT_REQUEST_RESOLUTION_OPTIONS.find(opt => opt.key == resolution)!;
  }

  /** Approves an onboarding request and enables pre-translation for the project. */
  async approveRequest(options: { requestId: string; sfProjectId: string }): Promise<OnboardingRequest> {
    const requestUpdateResult = await this.onlineInvoke<OnboardingRequest | undefined>('setResolution', {
      requestId: options.requestId,
      resolution: 'approved' satisfies DraftRequestResolutionKey
    });
    await this.projectService.onlineSetPreTranslate(options.sfProjectId, true);
    return requestUpdateResult!;
  }

  /** Submits a new signup request. */
  async submitOnboardingRequest(projectId: string, formData: DraftingSignupFormData): Promise<string> {
    return (await this.onlineInvoke<string>('submitOnboardingRequest', { projectId, formData }))!;
  }

  /** Gets the existing signup request for the specified project, if any. */
  async getOpenOnboardingRequest(projectId: string): Promise<OnboardingRequest | null> {
    return (await this.onlineInvoke<OnboardingRequest | null>('getOpenOnboardingRequest', { projectId }))!;
  }

  /** Gets all onboarding requests (Serval admin only). */
  async getAllRequests(): Promise<OnboardingRequest[]> {
    return (await this.onlineInvoke<OnboardingRequest[]>('getAllRequests'))!;
  }

  /** Sets the assignee for an onboarding request (Serval admin only). */
  async setAssignee(requestId: string, assigneeId: string): Promise<OnboardingRequest> {
    return (await this.onlineInvoke<OnboardingRequest | undefined>('setAssignee', { requestId, assigneeId }))!;
  }

  /** Sets the resolution of an onboarding request (Serval admin only). */
  async setResolution(requestId: string, resolution: DraftRequestResolutionKey | null): Promise<OnboardingRequest> {
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
