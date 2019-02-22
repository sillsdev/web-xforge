import { ProjectUser, ProjectUserRef } from 'xforge-common/models/project-user';

export class TranscriberProjectUser extends ProjectUser {
  static readonly TYPE: string = 'projectUser';

  constructor(init?: Partial<TranscriberProjectUser>) {
    super(TranscriberProjectUser.TYPE, init);
  }
}

export class TranscriberProjectUserRef extends ProjectUserRef {
  static readonly TYPE: string = TranscriberProjectUser.TYPE;

  constructor(id: string) {
    super(TranscriberProjectUserRef.TYPE, id);
  }
}
