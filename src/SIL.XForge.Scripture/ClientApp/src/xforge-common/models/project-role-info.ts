export const NONE_ROLE: ProjectRoleInfo = { role: 'none', canBeShared: false };

export interface ProjectRoleInfo {
  role: string;
  canBeShared: boolean;
}
