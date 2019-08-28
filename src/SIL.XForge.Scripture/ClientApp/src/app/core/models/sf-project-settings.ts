import { InputSystem } from 'realtime-server/lib/common/models/input-system';
import { SharingLevel } from 'realtime-server/lib/common/models/sharing-level';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translateEnabled?: boolean;
  sourceName?: string;
  sourceParatextId?: string;
  sourceInputSystem?: InputSystem;

  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  shareEnabled?: boolean;
  shareLevel?: SharingLevel;
}
