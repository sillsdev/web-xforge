import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { ProjectRoleInfo } from 'xforge-common/models/project-role-info';

export const SF_PROJECT_ROLES: ProjectRoleInfo[] = [
  { role: SFProjectRole.ParatextAdministrator, displayName: 'Administrator' },
  { role: SFProjectRole.ParatextTranslator, displayName: 'Translator' },
  { role: SFProjectRole.ParatextConsultant, displayName: 'Consultant/Reviewer/Archivist/Typesetter' },
  { role: SFProjectRole.ParatextObserver, displayName: 'Observer' },
  { role: SFProjectRole.Reviewer, displayName: 'Reviewer' },
  { role: SFProjectRole.CommunityChecker, displayName: 'Community Checker' }
];

const ptRoles = [
  SFProjectRole.ParatextAdministrator,
  SFProjectRole.ParatextTranslator,
  SFProjectRole.ParatextConsultant,
  SFProjectRole.ParatextObserver,
  SFProjectRole.ParatextRead,
  SFProjectRole.ParatextWriteNote
];

export function isPTRole(role: SFProjectRole) {
  return ptRoles.some(ptRole => role === ptRole);
}
