export function hasParatextRole(role: string | undefined): boolean {
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

export function hasTranslateRole(role: string | undefined): boolean {
  if (hasParatextRole(role)) {
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
  ParatextRead = 'pt_read',
  ParatextWriteNote = 'pt_write_note',
  Reviewer = 'sf_reviewer',
  CommunityChecker = 'sf_community_checker',
  Observer = 'sf_observer',
  None = 'none'
}
