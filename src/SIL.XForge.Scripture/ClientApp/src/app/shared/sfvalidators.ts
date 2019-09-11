import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { TextsByBookId } from '../core/models/texts-by-book-id';

export class SFValidators {
  static verseStr(textsByBookId: TextsByBookId): ValidatorFn {
    return function validateVerseStr(control: AbstractControl): ValidationErrors | null {
      if (!control.value) {
        return null;
      }

      const verseRef = VerseRef.tryParse(control.value);
      if (verseRef == null) {
        return { verseFormat: true };
      }
      // basic test that the verse contains only the allowed characters
      const ALLOWED_CHARS_REGEXP = /^\d{1,}[0-9abAB,-]{0,}$/;
      // any valid letter followed by anything other than a comma or dash is not valid
      const LETTER_COMMA_DASH_REGEXP = /[abAB][^,-]/;
      // any non-digit character following a comma or dash is disallowed
      const COMMA_DASH_DIGIT_REGEXP = /[,-]\D/;
      const versePart = (control.value as string).split(':')[1];
      if (
        !ALLOWED_CHARS_REGEXP.test(versePart) ||
        LETTER_COMMA_DASH_REGEXP.test(versePart) ||
        COMMA_DASH_DIGIT_REGEXP.test(verseRef.verse)
      ) {
        return { verseFormat: true };
      }

      let isRangeValid = false;
      if (verseRef.book in textsByBookId) {
        const chapters = textsByBookId[verseRef.book].chapters.map(c => c.number);
        if (chapters.includes(verseRef.chapterNum)) {
          const chapterIndex = chapters.indexOf(verseRef.chapterNum);
          const lastVerse = textsByBookId[verseRef.book].chapters[chapterIndex].lastVerse;
          if (verseRef.verseNum >= 1 && verseRef.verseNum <= lastVerse) {
            isRangeValid = true;
          }
        }
      }

      return isRangeValid ? null : { verseRange: true };
    };
  }
}
