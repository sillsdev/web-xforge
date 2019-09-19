export interface Project {
  name: string;
  userRoles: { [userRef: string]: string };
}
