import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';

// An interface for objects with scripture reference properties i.e. Questions
export interface ScriptureReference {
  readonly scriptureStart?: VerseRefData;
  readonly scriptureEnd?: VerseRefData;
}
