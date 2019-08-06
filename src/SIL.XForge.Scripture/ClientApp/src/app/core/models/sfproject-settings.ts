import { InputSystem } from 'xforge-common/models/input-system';
import { SharingLevel } from 'xforge-common/models/sharing-level';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translateEnabled?: boolean;
  sourceParatextId?: string;
  sourceInputSystem?: InputSystem;

  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  downloadAudioFiles?: boolean;
  shareEnabled?: boolean;
  shareLevel?: SharingLevel;
}
