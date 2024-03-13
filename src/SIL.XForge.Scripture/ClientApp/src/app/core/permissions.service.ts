import { Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { Chapter } from 'realtime-server/scriptureforge/models/text-info';
import { environment } from 'src/environments/environment';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from './models/sf-project-profile-doc';
import { roleCanAccessCommunityChecking, roleCanAccessTranslate } from './models/sf-project-role-info';
import { TextDocId } from './models/text-doc';
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
}
