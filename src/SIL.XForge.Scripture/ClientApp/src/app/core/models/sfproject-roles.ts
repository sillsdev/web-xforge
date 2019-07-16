import { ProjectRole } from 'xforge-common/models/project-role';

export { ProjectRole, ProjectRoles } from 'xforge-common/models/project-role';

export function canTranslate(role: string): boolean {
  return (role != null && role === SFProjectRoles.ParatextAdministrator) || role === SFProjectRoles.ParatextTranslator;
}

export enum SFProjectRoles {
  ParatextAdministrator = 'pt_administrator',
  ParatextTranslator = 'pt_translator',
  ParatextConsultant = 'pt_consultant',
  ParatextObserver = 'pt_observer',
  ParatextRead = 'pt_read',
  ParatextWriteNote = 'pt_write_note',
  Reviewer = 'sf_reviewer'
}

export const SF_PROJECT_ROLES: ProjectRole[] = [
  { role: SFProjectRoles.ParatextAdministrator, displayName: 'Administrator' },
  { role: SFProjectRoles.ParatextTranslator, displayName: 'Translator' },
  { role: SFProjectRoles.ParatextConsultant, displayName: 'Consultant/Reviewer/Archivist/Typesetter' },
  { role: SFProjectRoles.Reviewer, displayName: 'Reviewer' },
  { role: SFProjectRoles.ParatextObserver, displayName: 'Observer' }
];
