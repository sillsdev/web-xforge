import { Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { isResource, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { AuthService } from 'xforge-common/auth.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';
import { SFProjectProfileDoc } from './models/sf-project-profile-doc';
import {
  roleCanAccessCommunityChecking,
  roleCanAccessDrafts,
  roleCanAccessTranslate
} from './models/sf-project-role-info';
import { TextDocId } from './models/text-doc';
import { ParatextService } from './paratext.service';
import { SFProjectService } from './sf-project.service';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService
  ) {}

  get isServalAdmin(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.ServalAdmin);
  }

  get isSystemAdmin(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.SystemAdmin);
  }

  canAccessCommunityChecking(project: SFProjectProfileDoc, userId?: string): boolean {
    if (project.data == null) return false;
    const role = project.data.userRoles[userId ?? this.userService.currentUserId];

    return (
      role != null &&
      project.data.checkingConfig.checkingEnabled &&
      roleCanAccessCommunityChecking(role as SFProjectRole)
    );
  }

  canAccessTranslate(project: SFProjectProfileDoc, userId?: string): boolean {
    if (project.data == null) return false;
    const role = project.data.userRoles[userId ?? this.userService.currentUserId];
    return role != null && roleCanAccessTranslate(role as SFProjectRole);
  }

  canAccessDrafts(project?: SFProjectProfileDoc, userId?: string): boolean {
    if (project?.data == null) return false;
    const role = project.data.userRoles[userId ?? this.userService.currentUserId];
    return role != null && roleCanAccessDrafts(role as SFProjectRole);
  }

  async isUserOnProject(projectId: string): Promise<boolean> {
    const currentUserDoc = await this.userService.getCurrentUser();
    return currentUserDoc?.data?.sites[environment.siteId].projects.includes(projectId) ?? false;
  }

  async userHasParatextRoleOnProject(projectId: string): Promise<boolean> {
    const currentUserDoc: UserDoc = await this.userService.getCurrentUser();
    const projectDoc: SFProjectProfileDoc = await this.projectService.getProfile(projectId);
    return isParatextRole(projectDoc.data?.userRoles[currentUserDoc.id] ?? SFProjectRole.None);
  }

  /**
   * Determines if a user can access the text in the specified project.
   * @param textDocId The text document id.
   * @param project The project.
   * @returns A boolean value.
   */
  canAccessText(textDocId: TextDocId, project?: SFProjectProfile): boolean {
    // Ensure the user has project level permission to view the text
    if (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.View)
    ) {
      // Check chapter permissions
      const text: TextInfo | undefined = project.texts.find(t => t.bookNum === textDocId.bookNum);
      const chapter: Chapter | undefined = text?.chapters.find(c => c.number === textDocId.chapterNum);
      if (text != null && chapter != null) {
        // If the chapter permission is not present, use the book permission instead
        const chapterPermission: string | undefined =
          chapter.permissions[this.userService.currentUserId] ?? text.permissions[this.userService.currentUserId];
        // If there is no chapter permission, they will have access to the chapter as they have access to the project.
        // We should only deny access if there is an explicit "None" permission.
        return chapterPermission !== TextInfoPermission.None;
      }
    }

    return false;
  }

  /**
   * Determines if a user can access a text.
   * @param textDocId The text document id.
   * @returns A promise for a boolean value.
   */
  async canAccessTextAsync(textDocId: TextDocId): Promise<boolean> {
    // Get the project doc, if the user is on that project
    let projectDoc: SFProjectProfileDoc | undefined;
    if (textDocId.projectId != null) {
      const isUserOnProject = await this.isUserOnProject(textDocId.projectId);
      projectDoc = isUserOnProject ? await this.projectService.getProfile(textDocId.projectId) : undefined;
      return this.canAccessText(textDocId, projectDoc?.data);
    }

    return false;
  }

  /** Whether the user can open the project settings and users pages (serval admins get read-only access). */
  canAccessProjectSettings(projectDoc: SFProjectProfileDoc): boolean {
    return projectDoc.data != null && (this.isServalAdmin || this.canEditProjectSettings(projectDoc));
  }

  /** Whether the user can open the sync page (serval admins get read-only access). */
  canAccessSync(projectDoc: SFProjectProfileDoc): boolean {
    return projectDoc.data != null && (this.isServalAdmin || this.canInitiateSync(projectDoc));
  }

  /** Whether the user has the project role required to edit project settings and manage project users. */
  canEditProjectSettings(projectDoc: SFProjectProfileDoc, userId?: string): boolean {
    return this.isProjectAdmin(projectDoc, userId);
  }

  /** Whether the user can initiate a synchronization of the project. */
  canInitiateSync(projectDoc: SFProjectProfileDoc, userId?: string): boolean {
    if (projectDoc.data == null) return false;
    if (
      SF_PROJECT_RIGHTS.hasRight(
        projectDoc.data,
        userId ?? this.userService.currentUserId,
        SFProjectDomain.Texts,
        Operation.Edit
      )
    ) {
      return true;
    }
    // The backend allows anyone with any Paratext role to sync a DBL resource, so serval admins can sync resources
    // they have read access to
    return (
      this.isServalAdmin &&
      isResource(projectDoc.data) &&
      SF_PROJECT_RIGHTS.hasRight(
        projectDoc.data,
        userId ?? this.userService.currentUserId,
        SFProjectDomain.Texts,
        Operation.View
      )
    );
  }

  canSync(projectDoc: SFProjectProfileDoc, userId?: string): boolean {
    if (projectDoc.data == null) {
      return false;
    }

    const role: string = projectDoc.data.userRoles[userId ?? this.userService.currentUserId];

    // Any paratext user role can sync DBL resources
    if (ParatextService.isResource(projectDoc.data.paratextId)) {
      return isParatextRole(role);
    }

    // Only PT admin and PT translator can sync non-resource projects
    return role === SFProjectRole.ParatextAdministrator || role === SFProjectRole.ParatextTranslator;
  }

  /** Whether the user is allowed to configure drafting sources for the project. */
  canConfigureSources(projectDoc?: SFProjectProfileDoc, userId?: string): boolean {
    return this.isProjectAdmin(projectDoc, userId);
  }

  /** Whether the user's role on the project is Paratext administrator. */
  private isProjectAdmin(projectDoc?: SFProjectProfileDoc, userId?: string): boolean {
    if (projectDoc?.data == null) return false;
    return projectDoc.data.userRoles[userId ?? this.userService.currentUserId] === SFProjectRole.ParatextAdministrator;
  }

  canAccessBiblicalTerms(projectDoc: SFProjectProfileDoc): boolean {
    if (projectDoc?.data?.biblicalTermsConfig?.biblicalTermsEnabled !== true) return false;
    return SF_PROJECT_RIGHTS.hasRight(
      projectDoc.data,
      this.userService.currentUserId,
      SFProjectDomain.BiblicalTerms,
      Operation.View
    );
  }
}
