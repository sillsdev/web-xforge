import { ProjectRoleInfo } from 'xforge-common/models/project-role';

export function canTranslate(role: string): boolean {
  return role != null && (role === SFProjectRole.ParatextAdministrator || role === SFProjectRole.ParatextTranslator);
}

export enum SFProjectRole {
  ParatextAdministrator = 'pt_administrator',
  ParatextTranslator = 'pt_translator',
  ParatextConsultant = 'pt_consultant',
  ParatextObserver = 'pt_observer',
  ParatextRead = 'pt_read',
  ParatextWriteNote = 'pt_write_note',
  Reviewer = 'sf_reviewer'
}

export const SF_PROJECT_ROLES: ProjectRoleInfo[] = [
  { role: SFProjectRole.ParatextAdministrator, displayName: 'Administrator' },
  { role: SFProjectRole.ParatextTranslator, displayName: 'Translator' },
  { role: SFProjectRole.ParatextConsultant, displayName: 'Consultant/Reviewer/Archivist/Typesetter' },
  { role: SFProjectRole.Reviewer, displayName: 'Reviewer' },
  { role: SFProjectRole.ParatextObserver, displayName: 'Observer' }
];
