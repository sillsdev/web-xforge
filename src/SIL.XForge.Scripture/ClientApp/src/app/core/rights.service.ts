import { OwnedData } from 'realtime-server/lib/esm/common/models/owned-data';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

export class RightsService {
  static hasRight(
    project: Project,
    userId: string,
    projectDomain: string,
    operation: Operation,
    data?: OwnedData
  ): boolean {
    const role = project.userRoles[userId] || SFProjectRole.None;
    const permissions = project.userPermissions[userId] || [];
    return SF_PROJECT_RIGHTS.hasRight(role, permissions, { projectDomain, operation }, userId, data);
  }
}
