export interface Project {
  name: string;
  userRoles: { [userRef: string]: string };
  /** Whether the project has its capability to synchronize project data turned off. */
  syncDisabled?: boolean;
}
