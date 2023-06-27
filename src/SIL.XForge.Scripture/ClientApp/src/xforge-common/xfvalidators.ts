import { AbstractControl, ValidationErrors, Validators } from '@angular/forms';

const EMAIL_REGEXP = /^[a-zA-Z0-9.+_-]{1,}@[a-zA-Z0-9.-]{1,}[.]{1}[a-zA-Z]{2,}$/;
const DATE_REGEXP = /^\d{4}-\d{2}-\d{2}$/;

export class XFValidators {
  static email(control: AbstractControl): ValidationErrors | null {
    if (control.value == null || control.value.length === 0) {
      return null;
    }

    const emailPattern = /^.+@.+\..{2,}$/;
    const result = Validators.pattern(emailPattern)(control);

    if (result != null) {
      return result;
    }
    return null;
  }

  /** Pass if control value contains any non-whitespace. Error otherwise. */
  static someNonWhitespace(control: AbstractControl | null): ValidationErrors | null {
    const error = { someNonWhitespace: true };
    const someNonWhitespaceRegex = /\S+/;

    if (control == null) {
      return error;
    }
    if (someNonWhitespaceRegex.test(control.value)) {
      return null;
    }
    return error;
  }

  static date(control: AbstractControl): ValidationErrors | null {
    if (control.value == null || control.value.length === 0) {
      return null;
    }
    return DATE_REGEXP.test(control.value) ? null : { date: true };
  }
}
