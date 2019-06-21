import { SFProjectBase } from './sfdomain-model.generated';

export class SFProject extends SFProjectBase {
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

export { SFProjectRef } from './sfdomain-model.generated';
