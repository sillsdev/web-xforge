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
    case SFProjectRole.Reviewer:
    case SFProjectRole.Observer:
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
  Reviewer = 'sf_reviewer',
  CommunityChecker = 'sf_community_checker',
  Observer = 'sf_observer',
  None = 'none'
}
