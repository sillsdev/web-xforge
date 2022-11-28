import { SFProjectRole } from '../models/sf-project-role';

export function canViewParatextNotes(role: string): boolean {
  return role.startsWith('pt_') || role === SFProjectRole.Observer;
}
