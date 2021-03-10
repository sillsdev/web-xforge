export const NONE_ROLE: ProjectRoleInfo = { role: 'none', displayName: 'None', canBeShared: false };

export interface ProjectRoleInfo {
  role: string;
  displayName: string;
  canBeShared: boolean;
}
