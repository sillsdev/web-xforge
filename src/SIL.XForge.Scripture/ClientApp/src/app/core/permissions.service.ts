import { Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { Chapter } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';
import { SFProjectProfileDoc } from './models/sf-project-profile-doc';
import { roleCanAccessCommunityChecking, roleCanAccessTranslate } from './models/sf-project-role-info';
import { TextDocId } from './models/text-doc';
import { ParatextService } from './paratext.service';
import { SFProjectService } from './sf-project.service';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  constructor(private readonly userService: UserService, private readonly projectService: SFProjectService) {}

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

  async canAccessText(textDocId: TextDocId): Promise<boolean> {
    // Get the project doc, if the user is on that project
    let projectDoc: SFProjectProfileDoc | undefined;
    if (textDocId.projectId != null) {
      const currentUserDoc = await this.userService.getCurrentUser();
      const userOnProject: boolean =
        currentUserDoc?.data?.sites[environment.siteId].projects.includes(textDocId.projectId) ?? false;
      projectDoc = userOnProject ? await this.projectService.getProfile(textDocId.projectId) : undefined;
    }

    // Ensure the user has project level permission to view the text
    if (
      projectDoc?.data != null &&
      SF_PROJECT_RIGHTS.hasRight(projectDoc.data, this.userService.currentUserId, SFProjectDomain.Texts, Operation.View)
    ) {
      // Check chapter permissions
      const chapter: Chapter | undefined = projectDoc.data.texts
        .find(t => t.bookNum === textDocId.bookNum)
        ?.chapters.find(c => c.number === textDocId.chapterNum);
      if (chapter != null) {
        const chapterPermission: string = chapter.permissions[this.userService.currentUserId];
        return chapterPermission === TextInfoPermission.Write || chapterPermission === TextInfoPermission.Read;
      }
    }

    return false;
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
}
