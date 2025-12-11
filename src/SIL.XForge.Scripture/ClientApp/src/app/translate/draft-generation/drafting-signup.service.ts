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

  primarySourceProject: string;
  secondarySourceProject?: string;
  additionalSourceProject?: string;
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
  status: string;
  resolution: string | null;
  comments: DraftRequestComment[];
}

@Injectable({ providedIn: 'root' })
export class OnboardingRequestService {
  constructor(
    private readonly commandService: CommandService,
    private readonly projectService: SFProjectService
  ) {}

  /** Approves an onboarding request and enables pre-translation for the project. */
  async approveRequest(options: { requestId: string; sfProjectId: string }): Promise<OnboardingRequest> {
    const requestUpdateResult = await this.onlineInvoke<OnboardingRequest | undefined>('setResolution', {
      requestId: options.requestId,
      resolution: 'approved'
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
  async setResolution(requestId: string, resolution: string | null): Promise<OnboardingRequest> {
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
