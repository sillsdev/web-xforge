import { InputSystem } from 'xforge-common/models/input-system';
import { Project, ProjectRef } from 'xforge-common/models/project';

export class SFProject extends Project {
  paratextId?: string;
  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  downloadAudioFiles?: boolean;
  translateEnabled?: boolean;
  sourceParatextId?: string;
  sourceInputSystem?: InputSystem;

  constructor(init?: Partial<SFProject>) {
    super(init);
  }

  get taskNames(): string[] {
    const names: string[] = [];
    if (this.checkingEnabled != null && this.checkingEnabled) {
      names.push('Community Checking');
    }
    if (this.translateEnabled != null && this.translateEnabled) {
      names.push('Translate');
    }
    return names;
  }
}

export class SFProjectRef extends ProjectRef {}
