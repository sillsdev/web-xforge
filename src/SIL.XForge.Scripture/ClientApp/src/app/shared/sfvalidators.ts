import { ErrorStateMatcher } from '@angular-mdc/web';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormGroupDirective,
  NgForm,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { TextsByBookId } from '../core/models/texts-by-book-id';

export class SFValidators {
  static verseStr(textsByBookId: TextsByBookId): ValidatorFn {
    return function validateVerseStr(control: AbstractControl): ValidationErrors | null {
      if (!control.value) {
        return null;
      }

      const { verseRef } = VerseRef.tryParse(control.value);
      if (!verseRef.valid || verseRef.hasMultiple) {
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

  static verseStartBeforeEnd(group: FormGroup): ValidationErrors | null {
    const scriptureStart = group.controls.scriptureStart.value;
    const scriptureEnd = group.controls.scriptureEnd.value;
    const { verseRef: scriptureStartRef } = VerseRef.tryParse(scriptureStart != null ? scriptureStart : '');
    const { verseRef: scriptureEndRef } = VerseRef.tryParse(scriptureEnd != null ? scriptureEnd : '');
    if (
      !scriptureStartRef.valid ||
      !scriptureEndRef.valid ||
      group.controls.scriptureStart.errors ||
      group.controls.scriptureEnd.errors
    ) {
      return null;
    }
    if (scriptureStartRef.BBBCCC !== scriptureEndRef.BBBCCC) {
      return { verseDifferentBookOrChapter: true };
    }
    const isAfterStart: boolean = scriptureStartRef.verseNum <= scriptureEndRef.verseNum;
    return isAfterStart ? null : { verseBeforeStart: true };
  }

  static requireIfEndReferenceProvided(group: FormGroup): ValidationErrors | null {
    return group.controls.scriptureEnd.value && !group.controls.scriptureStart.value
      ? { startReferenceRequired: true }
      : null;
  }
}

/**
 * An error state matcher for the end reference text field to match when the field should be styled
 * with red outline. This prevents the end reference text field from showing red outline if the
 * start reference is already invalid
 */
export class ParentAndStartErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const invalidCtrl = !!(control && control.invalid && control.parent.dirty);
    const invalidStart = !!(
      control &&
      control.parent &&
      control.parent.controls &&
      control.parent.controls['scriptureStart'] &&
      !control.parent.controls['scriptureStart'].hasError('verseFormat') &&
      !control.parent.controls['scriptureStart'].hasError('verseRange') &&
      (control.parent.controls['scriptureStart'].invalid ||
        control.parent.hasError('verseDifferentBookOrChapter') ||
        control.parent.hasError('verseBeforeStart'))
    );

    return (control.touched || control.parent.controls['scriptureStart'].touched) && (invalidCtrl || invalidStart);
  }
}

export class StartReferenceRequiredErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const invalidCtrl = !!(control && control.invalid);
    const endReferenceExists = !!(
      control &&
      control.parent &&
      control.parent.controls &&
      control.parent.controls['scriptureEnd'] &&
      control.parent.controls['scriptureEnd'].value &&
      control.parent.controls['scriptureEnd'].dirty &&
      control.parent.controls['scriptureEnd'].touched
    );
    return (control.touched && invalidCtrl) || (endReferenceExists && !control.value);
  }
}
