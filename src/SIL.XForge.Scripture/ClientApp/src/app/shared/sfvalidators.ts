import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ScrVers } from '../core/models/scripture/scr-vers';
import { VerseRef } from '../core/models/scripture/verse-ref';
import { TextsByBook } from '../core/models/text';

export class SFValidators {
  static verseStr(textsByBook: TextsByBook): ValidatorFn {
    return function validateVerseStr(control: AbstractControl): ValidationErrors | null {
      if (!control.value) {
        return null;
      }

      const verseRef = VerseRef.fromStr(control.value, ScrVers.English);
      if (!verseRef.valid) {
        return { verseFormat: true };
      }

      let isRangeValid = false;
      if (verseRef.book in textsByBook) {
        const chapters = textsByBook[verseRef.book].chapters.map(c => c.number);
        if (chapters.includes(verseRef.chapterNum)) {
          const chapterIndex = chapters.indexOf(verseRef.chapterNum);
          const lastVerse = textsByBook[verseRef.book].chapters[chapterIndex].lastVerse;
          if (verseRef.verseNum >= 1 && verseRef.verseNum <= lastVerse) {
            isRangeValid = true;
          }
        }
      }

      return isRangeValid ? null : { verseRange: true };
    };
  }
}
