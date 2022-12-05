import { isParatextRole, SFProjectRole } from '../models/sf-project-role';

/** Determine if a user can view note threads created in Paratext. */
export function canViewParatextNotes(role: string): boolean {
  return isParatextRole(role) || role === SFProjectRole.Observer;
}
