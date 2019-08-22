import { ProjectRole } from 'realtime-server/lib/common/models/project-role';

export const NONE_ROLE: ProjectRoleInfo = { role: ProjectRole.None, displayName: 'None' };

export interface ProjectRoleInfo {
  role: string;
  displayName: string;
}
