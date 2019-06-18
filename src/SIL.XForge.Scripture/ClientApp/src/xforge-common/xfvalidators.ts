import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

const EMAIL_REGEXP = /^[a-zA-Z0-9.+_-]{1,}@[a-zA-Z0-9.-]{1,}[.]{1}[a-zA-Z]{2,}$/;
const DATE_REGEXP = /^\d{4}-\d{2}-\d{2}$/;

export class XFValidators {
  static email(control: AbstractControl): ValidationErrors | null {
    if (control.value == null || control.value.length === 0) {
      return null;
    }

    const result = Validators.email(control);
    if (result != null) {
      return result;
    }

    return EMAIL_REGEXP.test(control.value) ? null : { email: true };
  }

  /** Pass if control value contains any non-whitespace. Error otherwise. */
  static someNonWhitespace(control: AbstractControl): ValidationErrors | null {
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

  static requireOneWithValue(formGroupPaths: string[], value: any): ValidatorFn {
    return function validate(formGroup: FormGroup) {
      let checked = 0;
      for (const formGroupPath of formGroupPaths) {
        const control = formGroup.get(formGroupPath);
        if (control.value === value) {
          checked++;
        }
      }

      if (checked < 1) {
        return {
          requireAtLeastOneWithValue: true
        };
      }

      return null;
    };
  }

  static date(control: AbstractControl): ValidationErrors | null {
    if (control.value == null || control.value.length === 0) {
      return null;
    }
    return DATE_REGEXP.test(control.value) ? null : { date: true };
  }
}
