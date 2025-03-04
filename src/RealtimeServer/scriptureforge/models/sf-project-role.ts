export function canParatextRoleWrite(role: string | undefined): boolean {
  switch (role) {
    case SFProjectRole.ParatextAdministrator:
    case SFProjectRole.ParatextTranslator:
    case SFProjectRole.ParatextConsultant:
      return true;
    default:
      return false;
  }
}

export function isParatextRole(role: string | undefined): boolean {
  switch (role) {
    case SFProjectRole.ParatextAdministrator:
    case SFProjectRole.ParatextTranslator:
    case SFProjectRole.ParatextConsultant:
    case SFProjectRole.ParatextObserver:
      return true;
    default:
      return false;
  }
}

export function isTranslateRole(role: string | undefined): boolean {
  if (isParatextRole(role)) {
    return true;
  }
  switch (role) {
    case SFProjectRole.Commenter:
    case SFProjectRole.Viewer:
      return true;
    default:
      return false;
  }
}

export enum SFProjectRole {
  ParatextAdministrator = 'pt_administrator',
  ParatextTranslator = 'pt_translator',
  ParatextConsultant = 'pt_consultant',
  ParatextObserver = 'pt_observer',
  CommunityChecker = 'sf_community_checker',
  Commenter = 'sf_commenter',
  Viewer = 'sf_observer',
  None = 'none'
}
