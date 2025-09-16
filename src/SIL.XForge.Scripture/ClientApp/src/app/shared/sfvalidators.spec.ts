import { fakeAsync } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { SFValidators } from './sfvalidators';

describe('SFValidators', () => {
  describe('balanced parentheses', () => {
    it('no error on null control', fakeAsync(() => {
      expect(SFValidators.balancedParentheses(null)).toBeNull();
    }));

    it('no error on null or empty value', fakeAsync(() => {
      expect(SFValidators.balancedParentheses(new FormControl(null))).toBeNull();
      expect(SFValidators.balancedParentheses(new FormControl(''))).toBeNull();
    }));

    it('no error if brackets match or are missing', fakeAsync(() => {
      expect(SFValidators.balancedParentheses(new FormControl('a'))).toBeNull();
      expect(SFValidators.balancedParentheses(new FormControl('a()'))).toBeNull();
      expect(SFValidators.balancedParentheses(new FormControl('(a)'))).toBeNull();
      expect(SFValidators.balancedParentheses(new FormControl('((a))'))).toBeNull();
      expect(SFValidators.balancedParentheses(new FormControl('(())\n()'))).toBeNull();
      expect(SFValidators.balancedParentheses(new FormControl('(())\n(())\n(())\n'))).toBeNull();
    }));

    it('error when brackets are not closed', fakeAsync(() => {
      expect(SFValidators.balancedParentheses(new FormControl('('))).toEqual({ unbalancedParentheses: true });
      expect(SFValidators.balancedParentheses(new FormControl(')'))).toEqual({ unbalancedParentheses: true });
      expect(SFValidators.balancedParentheses(new FormControl('(()'))).toEqual({ unbalancedParentheses: true });
      expect(SFValidators.balancedParentheses(new FormControl('()))'))).toEqual({ unbalancedParentheses: true });
      expect(SFValidators.balancedParentheses(new FormControl('(\n)'))).toEqual({ unbalancedParentheses: true });
      expect(SFValidators.balancedParentheses(new FormControl('(()\n)'))).toEqual({ unbalancedParentheses: true });
    }));
  });
});
