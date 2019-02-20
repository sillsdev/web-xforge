import { UserRef } from 'xforge-common/models/user';

export class Question {
  owner?: UserRef;
  source?: QuestionSource;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
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
