export enum ProjectRole {
  None = 'none'
}

export const NONE_ROLE: ProjectRoleInfo = { role: ProjectRole.None, displayName: 'None' };

export interface ProjectRoleInfo {
  role: string;
  displayName: string;
}
