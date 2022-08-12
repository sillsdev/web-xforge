export interface Site {
  // The most recent project a user has navigated to, which may be different than the current open project
  // if a user is logged in on multiple browsers
  currentProjectId?: string;
  projects: string[];
}
