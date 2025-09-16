/** See documentation in ParatextProject.cs. */
export interface ParatextProject {
  paratextId: string;
  name: string;
  shortName: string;
  languageTag: string;
  /** SF project id */
  projectId?: string | null;
  isConnectable: boolean;
  isConnected: boolean;
  hasUserRoleChanged: boolean;
  hasUpdate: boolean;
}
