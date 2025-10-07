import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

export interface ParatextMember {
  connectedToProject: boolean;
  username: string;
  role: SFProjectRole;
}

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
  members: ParatextMember[];
  hasUserRoleChanged: boolean;
  hasUpdate: boolean;
}
