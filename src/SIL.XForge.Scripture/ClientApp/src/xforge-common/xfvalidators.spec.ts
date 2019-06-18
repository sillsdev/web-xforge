import { fakeAsync } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { XFValidators } from './xfvalidators';

describe('XFValidators', () => {
  describe('some non-whitespace', () => {
    it('error on null control', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(null)).not.toBeNull();
    }));

    it('error on empty value', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(new FormControl(''))).toEqual({ someNonWhitespace: true });
    }));

    it('error on only whitespace', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(new FormControl(' '))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new FormControl('  '))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new FormControl('\n'))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new FormControl(' \n '))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new FormControl('\t'))).toEqual({ someNonWhitespace: true });
      expect(XFValidators.someNonWhitespace(new FormControl(' \t '))).toEqual({ someNonWhitespace: true });
    }));

    it('no error if any non-whitespace', fakeAsync(() => {
      expect(XFValidators.someNonWhitespace(new FormControl('a'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl('aaa'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl(' a'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl('a '))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl(' a '))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl(':'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl('\na'))).toBeNull();
      expect(XFValidators.someNonWhitespace(new FormControl('\ta'))).toBeNull();
    }));
  });
});
