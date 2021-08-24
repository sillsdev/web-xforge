import { Canon } from './canon';
import { ScrVers } from './scr-vers';
import { ScrVersType } from './versification';

function splitMulti(str: string, tokens: string[]): string[] {
  const tempChar = tokens[0]; // We can use the first token as a temporary join character
  for (let i = 1; i < tokens.length; i++) {
    str = str.split(tokens[i]).join(tempChar);
  }
  return str.split(tempChar);
}

/**
 * Stores a reference to a specific verse in Scripture.
 *
 * Partially converted from https://github.com/sillsdev/libpalaso/blob/master/SIL.Scripture/VerseRef.cs
 */
export class VerseRef {
  static readonly verseRangeSeparator = '-';
  static readonly verseSequenceIndicator = ',';
  static readonly defaultVersification: ScrVers = ScrVers.English;
  static readonly verseRangeSeparators: string[] = [VerseRef.verseRangeSeparator];
  static readonly verseSequenceIndicators: string[] = [VerseRef.verseSequenceIndicator];

  private static readonly chapterDigitShifter: number = 1000;
  private static readonly bookDigitShifter: number = VerseRef.chapterDigitShifter * VerseRef.chapterDigitShifter;
  private static readonly bcvMaxValue: number = VerseRef.chapterDigitShifter - 1;

  static parse(verseStr: string, versification: ScrVers = VerseRef.defaultVersification): VerseRef {
    const vref = new VerseRef(undefined, undefined, undefined, versification);
    vref.parse(verseStr);
    return vref;
  }

  /**
   * Tries to parse the specified string into a verse reference
   * @param string str The string to attempt to parse
   * @returns success: True if the specified string was successfully parsed, false otherwise
   * @returns verseRef: The result of the parse if successful, or empty VerseRef if it failed
   */
  static tryParse(str: string): { success: boolean; verseRef: VerseRef } {
    let verseRef: VerseRef;
    try {
      verseRef = VerseRef.parse(str);
      return { success: true, verseRef };
    } catch (error) {
      if (error instanceof VerseRefException) {
        verseRef = new VerseRef();
        return { success: false, verseRef };
      }
      throw error;
    }
  }

  /**
   * Determines if the verse string is in a valid format (does not consider versification).
   */
  static isVerseParseable(verse: string): boolean {
    return (
      verse.length !== 0 &&
      '0123456789'.includes(verse[0]) &&
      verse[verse.length - 1] !== this.verseRangeSeparator &&
      verse[verse.length - 1] !== this.verseSequenceIndicator
    );
  }

  static getBBBCCCVVV(bookNum: number, chapterNum: number, verseNum: number): number {
    return (
      (bookNum % VerseRef.bcvMaxValue) * VerseRef.bookDigitShifter +
      (chapterNum >= 0 ? (chapterNum % VerseRef.bcvMaxValue) * VerseRef.chapterDigitShifter : 0) +
      (verseNum >= 0 ? verseNum % VerseRef.bcvMaxValue : 0)
    );
  }

  /**
   * Parses a verse string and gets the leading numeric portion as a number.
   * @param string verseStr
   * @returns true if the entire string could be parsed as a single, simple verse number (1-999);
   *    false if the verse string represented a verse bridge, contained segment letters, or was invalid
   */
  private static tryGetVerseNum(verseStr?: string): { success: boolean; vNum: number } {
    let vNum: number;
    if (!verseStr) {
      vNum = -1;
      return { success: true, vNum };
    }

    vNum = 0;
    let ch: string;
    for (let i = 0; i < verseStr.length; i++) {
      ch = verseStr[i];
      if (ch < '0' || ch > '9') {
        if (i === 0) {
          vNum = -1;
        }
        return { success: false, vNum };
      }

      vNum = vNum * 10 + +ch - +'0';
      if (vNum > VerseRef.bcvMaxValue) {
        // whoops, we got too big!
        vNum = -1;
        return { success: false, vNum };
      }
    }
    return { success: true, vNum };
  }

  firstChapter?: number;
  lastChapter?: number;
  lastVerse?: number;
  hasSegmentsDefined?: boolean;
  text?: string;
  BBBCCCVVVS?: string;
  longHashCode?: number;
  versificationStr?: string;

  private readonly rtlMark: string = '\u200f';
  private _bookNum = 0;
  private _chapterNum = 0;
  private _verseNum = 0;
  private _verse?: string;
  private _versification?: ScrVers;

  constructor(book?: number | string, chapter?: number | string, verse?: number | string, versification?: ScrVers) {
    if (book != null && chapter != null && verse != null) {
      if (typeof book === 'string') {
        this.book = book;
      } else {
        this._bookNum = book;
      }
      if (typeof chapter === 'string') {
        this.chapter = chapter;
      } else {
        this._chapterNum = chapter;
      }
      if (typeof verse === 'string') {
        this.verse = verse;
      } else {
        this._verseNum = verse;
      }
      this._versification = versification != null ? versification : VerseRef.defaultVersification;
    } else if (versification != null) {
      this._bookNum = 0;
      this._chapterNum = -1;
      this._verseNum = -1;
      this._versification = versification;
    }
  }

  /**
   * Checks to see if a VerseRef hasn't been set - all values are the default.
   */
  get isDefault(): boolean {
    return this.bookNum === 0 && this.chapterNum === 0 && this.verseNum === 0 && this.versification == null;
  }

  get hasMultiple(): boolean {
    return (
      this.verse != null &&
      (this.verse.includes(VerseRef.verseRangeSeparator) || this.verse.includes(VerseRef.verseSequenceIndicator))
    );
  }

  get book(): string {
    return Canon.bookNumberToId(this.bookNum, '');
  }
  set book(value: string) {
    this.bookNum = Canon.bookIdToNumber(value);
  }

  get chapter(): string {
    return this.isDefault || this._chapterNum < 0 ? '' : this._chapterNum.toString();
  }
  set chapter(value: string) {
    const chapter: number = +value;
    this._chapterNum = Number.isInteger(chapter) ? chapter : -1;
  }

  get verse(): string {
    if (this._verse != null) {
      return this._verse;
    }
    return this.isDefault || this._verseNum < 0 ? '' : this._verseNum.toString();
  }
  set verse(value: string) {
    const { success, vNum } = VerseRef.tryGetVerseNum(value);
    this._verse = !success ? value.replace(this.rtlMark, '') : undefined;
    this._verseNum = vNum;
    if (this._verseNum >= 0) {
      return;
    }

    ({ vNum: this._verseNum } = VerseRef.tryGetVerseNum(this._verse));
  }

  get bookNum(): number {
    return this._bookNum;
  }
  set bookNum(value: number) {
    if (value <= 0 || value > Canon.lastBook) {
      throw new VerseRefException('BookNum must be greater than zero and less than or equal to last book');
    }
    this._bookNum = value;
  }

  get chapterNum(): number {
    return this._chapterNum;
  }
  set chapterNum(value: number) {
    // ToDo: replace or remove this placeholder
    this.chapterNum = value;
  }

  get verseNum(): number {
    return this._verseNum;
  }
  set verseNum(value: number) {
    // ToDo: replace or remove this placeholder
    this._verseNum = value;
  }

  get versification(): ScrVers | undefined {
    return this._versification;
  }
  set versification(value: ScrVers | undefined) {
    this._versification = value;
  }

  /**
   * Determines if the reference is valid
   */
  get valid(): boolean {
    return this.validStatus === ValidStatusType.Valid;
  }

  /**
   * Get the valid status for this reference.
   */
  get validStatus(): ValidStatusType {
    return this.validateVerse(VerseRef.verseRangeSeparators, VerseRef.verseSequenceIndicators);
  }

  /**
   * Gets the reference as a comparable integer where the book,
   * chapter, and verse each occupy three digits and the verse is 0.
   */
  get BBBCCC(): number {
    return VerseRef.getBBBCCCVVV(this._bookNum, this._chapterNum, 0);
  }

  /**
   * Gets the reference as a comparable integer where the book,
   * chapter, and verse each occupy three digits. If verse is not null
   * (i.e., this reference represents a complex reference with verse
   * segments or bridge) this cannot be used for an exact comparison.
   */
  get BBBCCCVVV(): number {
    return VerseRef.getBBBCCCVVV(this._bookNum, this._chapterNum, this._verseNum);
  }

  /**
   * Gets whether the verse is defined as an excluded verse in the versification.
   * Does not handle verse ranges.
   */
  get isExcluded(): boolean {
    // TODO: implement me
    return false;
  }

  /**
   * Parses the reference in the specified string.
   * Optionally versification can follow reference as in GEN 3:11/4
   * Throw an exception if
   * - invalid book name
   * - chapter number is missing or not a number
   * - verse number is missing or does not start with a number
   * - versifcation is invalid
   * @param string verseStr string to parse e.g. "MAT 3:11"
   */
  parse(verseStr: string): void {
    verseStr = verseStr.replace(this.rtlMark, '');
    if (verseStr.includes('/')) {
      const parts: string[] = verseStr.split('/');
      verseStr = parts[0];
      if (parts.length > 1) {
        try {
          const scrVerseCode: number = +parts[1].trim();
          this.versification = new ScrVers(ScrVersType[scrVerseCode]);
        } catch (error) {
          throw new VerseRefException('Invalid reference : ' + verseStr);
        }
      }
    }

    const b_cv: string[] = verseStr.trim().split(' ');
    if (b_cv.length !== 2) {
      throw new VerseRefException('Invalid reference : ' + verseStr);
    }

    const c_v: string[] = b_cv[1].split(':');

    const cnum: number = +c_v[0];
    if (
      c_v.length !== 2 ||
      Canon.bookIdToNumber(b_cv[0]) === 0 ||
      !Number.isInteger(cnum) ||
      cnum < 0 ||
      !VerseRef.isVerseParseable(c_v[1])
    ) {
      throw new VerseRefException('Invalid reference : ' + verseStr);
    }

    this.updateInternal(b_cv[0], c_v[0], c_v[1]);
  }

  /**
   * Simplifies this verse ref so that it has no bridging of verses or
   * verse segments like "1a".
   */
  simplify(): void {
    this._verse = undefined;
  }

  /**
   * Makes a clone of the reference.
   *
   * @returns {VerseRef} The clone.
   */
  clone(): VerseRef {
    return new VerseRef(
      this._bookNum,
      this._chapterNum,
      this._verse == null ? this._verseNum : this._verse,
      this._versification
    );
  }

  toString(): string {
    const book = this.book;
    if (book === '') {
      return '';
    }

    return `${book} ${this.chapter}:${this.verse}`;
  }

  equals(verseRef: VerseRef): boolean {
    return (
      verseRef._bookNum === this._bookNum &&
      verseRef._chapterNum === this._chapterNum &&
      verseRef._verseNum === this._verseNum &&
      verseRef._verse === this._verse &&
      verseRef._versification === this._versification
    );
  }

  /**
   * Enumerate all individual verses contained in a VerseRef.
   * Verse ranges are indicated by "-" and consecutive verses by ","s.
   * Examples:
   * GEN 1:2 returns GEN 1:2
   * GEN 1:1a-3b,5 returns GEN 1:1a, GEN 1:2, GEN 1:3b, GEN 1:5
   * GEN 1:2a-2c returns //! ??????
   *
   * @param {boolean} [specifiedVersesOnly=false] if set to <c>true</c> return only verses that are explicitly specified
   * only, not verses within a range.
   * @param {string[]} [verseRangeSeparators=VerseRef.verseRangeSeparators] Verse range separators.
   * @param {string[]} [verseSequenceSeparators=VerseRef.verseSequenceIndicators] Verse sequence separators.
   * @returns {VerseRef[]} All verses in this VerseRef.
   */
  allVerses(
    specifiedVersesOnly = false,
    verseRangeSeparators: string[] = VerseRef.verseRangeSeparators,
    verseSequenceSeparators: string[] = VerseRef.verseSequenceIndicators
  ): VerseRef[] {
    if (this._verse == null || this.chapterNum <= 0) {
      return [this.clone()];
    }

    const verseRefs: VerseRef[] = [];
    const parts = splitMulti(this._verse, verseSequenceSeparators);
    for (const pieces of parts.map(part => splitMulti(part, verseRangeSeparators))) {
      const vref = this.clone();
      vref.verse = pieces[0];
      const startVerse = vref.verseNum;
      verseRefs.push(vref);

      if (pieces.length > 1) {
        const vlast = this.clone();
        vlast.verse = pieces[1];

        if (!specifiedVersesOnly) {
          // get all verses within range
          for (let verseNum = startVerse + 1; verseNum < vlast.verseNum; verseNum++) {
            const verseInRange = new VerseRef(this._bookNum, this._chapterNum, verseNum, this._versification);
            if (!this.isExcluded) {
              verseRefs.push(verseInRange);
            }
          }
        }
        verseRefs.push(vlast);
      }
    }
    return verseRefs;
  }

  /**
   * Validates a verse number using the supplied separators rather than the defaults.
   */
  validateVerse(verseRangeSeparators: string[], verseSequenceSeparators: string[]): ValidStatusType {
    if (!this.verse) {
      return this.internalValid;
    }
    let prevVerse = 0;
    for (const vRef of this.allVerses(true, verseRangeSeparators, verseSequenceSeparators)) {
      const validStatus = vRef.internalValid;
      if (validStatus !== ValidStatusType.Valid) {
        return validStatus;
      }

      const bbbcccvvv = vRef.BBBCCCVVV;
      if (prevVerse > bbbcccvvv) {
        return ValidStatusType.VerseOutOfOrder;
      }
      if (prevVerse === bbbcccvvv) {
        return ValidStatusType.VerseRepeated;
      }
      prevVerse = bbbcccvvv;
    }
    return ValidStatusType.Valid;
  }

  /**
   * Gets whether a single verse reference is valid.
   */
  private get internalValid(): ValidStatusType {
    // Unknown versification is always invalid
    if (this._versification == null) {
      return ValidStatusType.UnknownVersification;
    }

    // If invalid book, reference is invalid
    if (this._bookNum <= 0 || this._bookNum > Canon.lastBook) {
      return ValidStatusType.OutOfRange;
    }

    // If non-biblical book, any chapter/verse is valid
    /*
    if (!Canon.isCanonical(this._bookNum)) {
      return ValidStatusType.Valid;
    }

    if (this._bookNum > this._versification.getLastBook() || this._chapterNum <= 0 ||
      this._chapterNum > this._versification.getLastChapter(this._bookNum) || this.verseNum < 0 ||
      this.verseNum > this._versification.getLastVerse(this._bookNum, this._chapterNum)
    ) {
      return ValidStatusType.OutOfRange;
    }

    return this._versification.isExcluded(this.BBBCCCVVV) ? ValidStatusType.OutOfRange : ValidStatusType.Valid;
    */
    return ValidStatusType.Valid;
  }

  private updateInternal(bookStr: string, chapterStr: string, verseStr: string): void {
    this.bookNum = Canon.bookIdToNumber(bookStr);
    this.chapter = chapterStr;
    this.verse = verseStr;
  }
}

export class VerseRefException extends Error {}

/**
 * The valid status of the VerseRef
 */
export enum ValidStatusType {
  Valid,
  UnknownVersification,
  OutOfRange,
  VerseOutOfOrder,
  VerseRepeated
}
