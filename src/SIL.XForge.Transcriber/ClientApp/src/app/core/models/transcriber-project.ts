import { Project, ProjectRef } from 'xforge-common/models/project';

export class TranscriberProject extends Project {
  static readonly TYPE: string = 'project';

  constructor(init?: Partial<TranscriberProject>) {
    super(TranscriberProject.TYPE, init);
  }

  get taskNames(): string[] {
    return ['Transcribe'];
  }
}

export class TranscriberProjectRef extends ProjectRef {
  static readonly TYPE: string = TranscriberProject.TYPE;

  constructor(id: string) {
    super(TranscriberProjectRef.TYPE, id);
  }
}
