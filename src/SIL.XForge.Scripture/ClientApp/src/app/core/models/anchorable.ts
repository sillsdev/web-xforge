import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';

/**
 * This interface represents objects that can be anchored to a segment of Scripture text.
 */
export interface Anchorable {
  readonly verseRef?: VerseRef;
}
