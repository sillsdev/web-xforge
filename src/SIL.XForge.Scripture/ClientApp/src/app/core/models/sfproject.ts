import { InputSystem } from 'xforge-common/models/input-system';
import { Project, ProjectRef } from 'xforge-common/models/project';

export class SFProject extends Project {
  /** type identifier string for domain type mapping */
  static readonly TYPE: string = 'project';

  paratextId?: string;
  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  downloadAudioFiles?: boolean;
  translateEnabled?: boolean;
  sourceParatextId?: string;
  sourceInputSystem?: InputSystem;

  constructor(init?: Partial<SFProject>) {
    super(SFProject.TYPE, init);
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

export class SFProjectRef extends ProjectRef {
  static readonly TYPE: string = SFProject.TYPE;

  constructor(id: string) {
    super(SFProjectRef.TYPE, id);
  }
}
