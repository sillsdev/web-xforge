import { ProjectUser, ProjectUserRef } from 'xforge-common/models/project-user';

export class SFProjectUser extends ProjectUser {
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
    super(init);
  }
}

export class SFProjectUserRef extends ProjectUserRef {}
