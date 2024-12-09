export interface Project {
  name: string;
  rolePermissions: { [role: string]: string[] };
  userRoles: { [userRef: string]: string };
  userPermissions: { [userRef: string]: string[] };
  /** Whether the project has its capability to synchronize project data turned off. */
  syncDisabled?: boolean;
}
