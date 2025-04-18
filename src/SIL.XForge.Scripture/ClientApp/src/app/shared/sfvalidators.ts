import {
  AbstractControl,
  FormGroupDirective,
  NgForm,
  UntypedFormControl,
  UntypedFormGroup,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { VerseRef } from '@sillsdev/scripture';
import { TextsByBookId } from '../core/models/texts-by-book-id';
import { SelectableProject } from '../core/paratext.service';

export enum CustomValidatorState {
  InvalidProject,
  BookNotFound,
  NoWritePermissions,
  MissingChapters,
  None
}

export class SFValidators {
  static verseStr(textsByBookId?: TextsByBookId): ValidatorFn {
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

      if (textsByBookId == null) {
        return null;
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

  static selectableProject(canBeBlank: boolean = false): ValidatorFn {
    return function validateProject(control: AbstractControl): ValidationErrors | null {
      if (control.value == null || (canBeBlank && control.value === '')) {
        return null;
      }
      const selectedProject = control.value as SelectableProject;
      if (selectedProject.paratextId != null && selectedProject.name != null) {
        return null;
      }
      return { invalidSelection: true };
    };
  }

  static customValidator(state: CustomValidatorState): ValidatorFn {
    return function validateProject(): ValidationErrors | null {
      switch (state) {
        case CustomValidatorState.InvalidProject:
          return { invalidProject: true };
        case CustomValidatorState.BookNotFound:
          return { bookNotFound: true };
        case CustomValidatorState.NoWritePermissions:
          return { noWritePermissions: true };
        case CustomValidatorState.MissingChapters:
          return { missingChapters: true };
        default:
          return null;
      }
    };
  }

  static verseStartBeforeEnd(group: AbstractControl): ValidationErrors | null {
    if (!(group instanceof UntypedFormGroup)) {
      return null;
    }
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

  static requireIfEndReferenceProvided(group: UntypedFormGroup): ValidationErrors | null {
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
  isErrorState(control: UntypedFormControl | null, _form: FormGroupDirective | NgForm | null): boolean {
    if (control == null || control.parent == null) {
      return false;
    }

    const invalidCtrl = control.invalid && control.parent.dirty;
    const invalidParent =
      control.parent.controls['scriptureStart'].valid &&
      (control.parent.hasError('verseDifferentBookOrChapter') || control.parent.hasError('verseBeforeStart'));
    return (
      (control.touched && invalidCtrl) ||
      ((control.touched || control.parent.controls['scriptureStart'].touched) && invalidParent)
    );
  }
}

/**
 * An error state matcher for the start reference text field to match when the field should be styled with red outline
 */
export class StartReferenceRequiredErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: UntypedFormControl | null, _form: FormGroupDirective | NgForm | null): boolean {
    if (control == null || control.parent == null) {
      return false;
    }

    const invalidCtrl = control.invalid;
    const endReferenceExists =
      control.parent.controls['scriptureEnd'].value &&
      control.parent.controls['scriptureEnd'].dirty &&
      control.parent.controls['scriptureEnd'].touched;
    return (control.touched && invalidCtrl) || (endReferenceExists && !control.value);
  }
}
