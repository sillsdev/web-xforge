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

export function canAccessTranslateApp(role?: SFProjectRole) {
  return role != null && role !== SFProjectRole.CommunityChecker;
}
