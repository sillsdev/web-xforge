import { DeltaOperation } from 'rich-text';

export interface UsxStyle {
  style?: string;
}

export interface Para extends UsxStyle {
  vid?: string;
  status?: string;
}

export interface Chapter extends UsxStyle {
  number: number;
  altnumber?: string;
  pubnumber?: string;
  sid?: string;
  eid?: string;
}

export interface NoteThread {
  iconsrc: string;
  preview: string;
  threadid: string;
  highlight?: boolean;
}

export interface Verse extends UsxStyle {
  number: string;
  altnumber?: string;
  pubnumber?: string;
  sid?: string;
  eid?: string;
}

export interface Note extends UsxStyle {
  caller: string;
  closed?: string;
  category?: string;
  contents?: { ops: DeltaOperation[] };
}

export interface Figure extends UsxStyle {
  alt?: string;
  file: string;
  src?: string;
  size: string;
  loc?: string;
  copy?: string;
  ref: string;
  contents?: { ops: DeltaOperation[] };
}

export interface Ref {
  loc: string;
}

export interface Unmatched {
  marker: string;
}
