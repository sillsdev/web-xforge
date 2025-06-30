import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

export const NONE_ROLE: ProjectRoleInfo = { role: SFProjectRole.None, canBeShared: false };

export interface ProjectRoleInfo {
  role: SFProjectRole;
  canBeShared: boolean;
}
