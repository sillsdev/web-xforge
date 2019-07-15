import { ProjectUser, ProjectUserRef } from 'xforge-common/models/project-user';

export class SFProjectUser extends ProjectUser {
  /** type identifier string for domain type mapping */
  static readonly TYPE: string = 'projectUser';

  selectedTask?: string;
  selectedBookId?: string;
  selectedChapter?: number;
  isTargetTextRight?: boolean;
  confidenceThreshold?: number;
  isSuggestionsEnabled?: boolean;
  selectedSegment?: string;
  selectedSegmentChecksum?: number;
  questionRefsRead?: string[];
  answerRefsRead?: string[];
  commentRefsRead?: string[];

  constructor(init?: Partial<SFProjectUser>) {
    super(SFProjectUser.TYPE, init);
  }
}

export class SFProjectUserRef extends ProjectUserRef {
  static readonly TYPE: string = SFProjectUser.TYPE;

  constructor(id: string) {
    super(SFProjectUserRef.TYPE, id);
  }
}
