export { ProjectRole, ProjectRoles } from 'xforge-common/models/project-role';

export function canTranslate(role: string): boolean {
  return (role != null && role === SFProjectRoles.ParatextAdministrator) || role === SFProjectRoles.ParatextTranslator;
}

export enum SFProjectRoles {
  ParatextAdministrator = 'pt_administrator',
  ParatextTranslator = 'pt_translator',
  Reviewer = 'sf_reviewer'
}
