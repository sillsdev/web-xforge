import { fakeAsync } from '@angular/core/testing';
import { UntypedFormControl } from '@angular/forms';
import { XFValidators } from './xfvalidators';

describe('XFValidators', () => {
  describe('some non-whitespace', () => {
    it('error on null control', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(null)).not.toBeNull();
    }));

    it('error on empty value', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(''))).toEqual({ someNonWhitespace: true });
    }));

    it('error on only whitespace', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(' '))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('  '))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('\n'))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(' \n '))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('\t'))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(' \t '))).toEqual({ someNonWhitespace: true });
    }));

    it('no error if any non-whitespace', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('a'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('aaa'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(' a'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('a '))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(' a '))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl(':'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('\na'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new UntypedFormControl('\ta'))).toBeNull();
    }));
  });
});
