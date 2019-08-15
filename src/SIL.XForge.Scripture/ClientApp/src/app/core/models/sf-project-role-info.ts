import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { ProjectRoleInfo } from 'xforge-common/models/project-role-info';

export function canTranslate(role: string): boolean {
  return role != null && (role === SFProjectRole.ParatextAdministrator || role === SFProjectRole.ParatextTranslator);
}

export const SF_PROJECT_ROLES: ProjectRoleInfo[] = [
  { role: SFProjectRole.ParatextAdministrator, displayName: 'Administrator' },
  { role: SFProjectRole.ParatextTranslator, displayName: 'Translator' },
  { role: SFProjectRole.ParatextConsultant, displayName: 'Consultant/Reviewer/Archivist/Typesetter' },
  { role: SFProjectRole.Reviewer, displayName: 'Reviewer' },
  { role: SFProjectRole.ParatextObserver, displayName: 'Observer' }
];
