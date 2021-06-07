import { hasTranslateRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ProjectRoleInfo } from 'xforge-common/models/project-role-info';

export const SF_PROJECT_ROLES: ProjectRoleInfo[] = [
  { role: SFProjectRole.ParatextAdministrator, displayName: 'Administrator', canBeShared: false },
  { role: SFProjectRole.ParatextTranslator, displayName: 'Translator', canBeShared: false },
  {
    role: SFProjectRole.ParatextConsultant,
    displayName: 'Consultant/Reviewer/Archivist/Typesetter',
    canBeShared: false
  },
  { role: SFProjectRole.ParatextObserver, displayName: 'Observer', canBeShared: false },
  { role: SFProjectRole.Reviewer, displayName: 'Reviewer', canBeShared: false },
  { role: SFProjectRole.CommunityChecker, displayName: 'Community Checker', canBeShared: true },
  { role: SFProjectRole.Observer, displayName: 'View Translation', canBeShared: true }
];

export function canAccessTranslateApp(role?: SFProjectRole) {
  return hasTranslateRole(role);
}

export const SF_DEFAULT_SHARE_ROLE: SFProjectRole = SFProjectRole.CommunityChecker;
export const SF_DEFAULT_TRANSLATE_SHARE_ROLE: SFProjectRole = SFProjectRole.Observer;
