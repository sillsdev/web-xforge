import { UserRef } from 'xforge-common/models/user';
import { SFProjectRef } from './sfproject';

export class Question {
  owner?: UserRef;
  project?: SFProjectRef;
  source?: QuestionSource;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  answers?: Answer[];
}

export enum QuestionSource {
  Created = 'Created',
  Transcelerator = 'Transcelerator'
}

export interface VerseRefData {
  book?: string;
  chapter?: string;
  verse?: string;
  versification?: ScrVersType;
}

export enum ScrVersType {
  Unknown = 'Unknown',
  Original = 'Original',
  Septuagint = 'Septuagint',
  Vulgate = 'Vulgate',
  English = 'English',
  RussianProtestant = 'RussianProtestant',
  RussianOrthodox = 'RussianOrthodox'
}

export interface Answer {
  owner?: UserRef;
  text?: string;
  audioUrl?: string;
  comments?: Comment[];
}

export interface Comment {
  owner?: UserRef;
  text?: string;
  audioUrl?: string;
}
