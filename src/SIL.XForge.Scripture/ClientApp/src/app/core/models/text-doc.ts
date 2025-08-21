import { VerseRef } from '@sillsdev/scripture';
import { Range } from 'quill';
import {
  getTextDocId,
  TEXT_INDEX_PATHS,
  TextData,
  TEXTS_COLLECTION,
  TextType
} from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-remote-store';
import { RealtimeService } from 'xforge-common/realtime.service';
import { getVerseStrFromSegmentRef } from '../../shared/utils';

export type TextDocSource = 'Draft' | 'Editor' | 'History' | 'Paratext';

/**
 * This class represents the different components for a text doc id. It can be converted to the actual text doc id
 * string using the "toString()" method.
 */
export class TextDocId {
  constructor(
    public readonly projectId: string,
    public readonly bookNum: number,
    public readonly chapterNum: number,
    public readonly textType: TextType = 'target'
  ) {}

  toString(): string {
    return getTextDocId(this.projectId, this.bookNum, this.chapterNum, this.textType);
  }

  isSameBookAndChapter(verseRef: VerseRef): boolean {
    return verseRef.bookNum === this.bookNum && verseRef.chapterNum === this.chapterNum;
  }
}

/**
 * This is the real-time doc for a text doc. Texts contain the textual data for one particular Scripture book
 * and chapter.
 */
export class TextDoc extends RealtimeDoc<TextData, TextData, Range> {
  static readonly COLLECTION = TEXTS_COLLECTION;
  static readonly INDEX_PATHS = TEXT_INDEX_PATHS;

  constructor(
    protected readonly realtimeService: RealtimeService,
    public readonly adapter: RealtimeDocAdapter
  ) {
    adapter.submitSource = true;
    super(realtimeService, adapter);
  }

  getSegmentCount(): { translated: number; blank: number } {
    let blank = 0;
    let translated = 0;
    if (this.data != null && this.data.ops != null) {
      for (let i = 0; i < this.data.ops.length; i++) {
        const op = this.data.ops[i];
        const nextOp = i < this.data.ops.length - 1 ? this.data.ops[i + 1] : undefined;
        if (op.attributes != null && op.attributes.segment != null) {
          const segRef: string = op.attributes.segment as string;
          if ((op.insert as any).blank != null) {
            if (
              nextOp == null ||
              nextOp.insert == null ||
              (nextOp.insert as any).verse == null ||
              (segRef.startsWith('verse_') && !segRef.includes('/'))
            ) {
              blank++;
            }
          } else if (!segRef.startsWith('id_')) {
            // Exclude the id segment from the translated count
            translated++;
          }
        }
      }
    }
    return { translated, blank };
  }

  getNonEmptyVerses(): string[] {
    const verses: string[] = [];
    if (this.data != null && this.data.ops != null) {
      for (const op of this.data.ops) {
        if (op.attributes != null && op.attributes.segment != null && (op.insert as any).blank == null) {
          const segRef: string = op.attributes.segment as string;
          if (segRef.startsWith('verse_')) {
            const verse: string | undefined = getVerseStrFromSegmentRef(segRef);
            if (verse != null && !verses.includes(verse)) {
              verses.push(verse);
            }
          }
        }
      }
    }

    return verses;
  }

  getSegmentText(ref: string): string {
    if (this.data == null || this.data.ops == null) {
      return '';
    }
    let text = '';
    let inSegment = false;
    for (const op of this.data.ops) {
      if (op.attributes?.segment != null && op.attributes.segment === ref) {
        if (op.insert != null && typeof op.insert === 'string') {
          text += op.insert;
          inSegment = true;
        }
      } else if (inSegment) {
        break;
      }
    }

    return text;
  }

  getSegmentTextIncludingRelated(verseStr: string): string {
    if (this.data == null || this.data.ops == null) {
      return '';
    }
    let text = '';
    // Keep track of insert text even if not initially used as some inserts, like blank lines,
    // can appear between related segments.
    let textBetweenRelatedSegments = '';

    for (const i in this.data.ops) {
      if (!this.data.ops.hasOwnProperty(i)) {
        continue;
      }
      const index = parseInt(i, 10);
      const op = this.data.ops[index];
      if (op.insert == null || typeof op.insert !== 'string') {
        continue;
      }
      // Locate range of ops that match the verse segments
      const opSegmentRef: string = (op.attributes?.segment as string) ?? '';
      const segmentVerse: string | undefined = getVerseStrFromSegmentRef(opSegmentRef);
      if (segmentVerse === verseStr) {
        text += textBetweenRelatedSegments + op.insert;
        // Reset text so no double-ups
        textBetweenRelatedSegments = '';
      } else {
        // Only track text once an initial segment has been found
        if (text !== '') {
          textBetweenRelatedSegments += op.insert;
        }
      }
    }
    return text;
  }

  protected prepareDataForStore(data: TextData): any {
    return { ops: data.ops };
  }
}
