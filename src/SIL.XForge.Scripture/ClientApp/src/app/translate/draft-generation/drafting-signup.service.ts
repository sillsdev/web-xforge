import { Injectable } from '@angular/core';
import { CommandService } from 'xforge-common/command.service';
import { DRAFTING_SIGNUP_URL } from 'xforge-common/url-constants';
import { SFProjectService } from '../../core/sf-project.service';

export interface UserSignupRequest {
  submittedAt: string;
  submittedBy: { name: string; email: string };
  status: string;
}

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

export interface DraftingSignupRequest {
  id: string;
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
export class DraftingSignupService {
  constructor(
    private readonly commandService: CommandService,
    private readonly projectService: SFProjectService
  ) {}

  async approveRequest(options: { requestId: string; sfProjectId: string }): Promise<DraftingSignupRequest> {
    const requestUpdateResult = await this.onlineInvoke<DraftingSignupRequest | undefined>('setResolution', {
      requestId: options.requestId,
      resolution: 'approved'
    });
    await this.projectService.onlineSetPreTranslate(options.sfProjectId, true);
    return requestUpdateResult!;
  }

  /** Submits a new signup request. */
  async submitSignupRequest(projectId: string, formData: DraftingSignupFormData): Promise<string> {
    return (await this.onlineInvoke<string>('submitSignupRequest', { projectId, formData }))!;
  }

  /** Gets the existing signup request for the specified project, if any. */
  async getOpenDraftSignupRequest(projectId: string): Promise<UserSignupRequest | null> {
    return (await this.onlineInvoke<UserSignupRequest | null>('getOpenDraftSignupRequest', { projectId }))!;
  }

  /** Gets all drafting signup requests (Serval admin only). */
  async getAllRequests(): Promise<DraftingSignupRequest[]> {
    return (await this.onlineInvoke<DraftingSignupRequest[]>('getAllRequests'))!;
  }

  /** Sets the assignee for a drafting signup request (Serval admin only). */
  async setAssignee(requestId: string, assigneeId: string): Promise<DraftingSignupRequest> {
    return (await this.onlineInvoke<DraftingSignupRequest | undefined>('setAssignee', { requestId, assigneeId }))!;
  }

  /** Sets the resolution of a drafting signup request (Serval admin only). */
  async setResolution(requestId: string, resolution: string | null): Promise<DraftingSignupRequest> {
    return (await this.onlineInvoke<DraftingSignupRequest | undefined>('setResolution', { requestId, resolution }))!;
  }

  /** Adds a comment to a drafting signup request (Serval admin only). */
  async addComment(requestId: string, commentText: string): Promise<DraftingSignupRequest> {
    return (await this.onlineInvoke<DraftingSignupRequest>('addComment', { requestId, commentText }))!;
  }

  /** Deletes a drafting signup request (Serval admin only). */
  async deleteRequest(requestId: string): Promise<void> {
    await this.onlineInvoke<boolean>('deleteRequest', { requestId });
  }

  protected onlineInvoke<T>(method: string, params?: any): Promise<T | undefined> {
    return this.commandService.onlineInvoke<T>(DRAFTING_SIGNUP_URL, method, params);
  }
}
