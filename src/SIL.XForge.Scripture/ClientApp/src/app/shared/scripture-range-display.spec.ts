import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { CookieService } from 'ngx-cookie-service';
import { anything, instance, mock, when } from 'ts-mockito';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { getTestTranslocoModule } from 'xforge-common/test-utils';
import { VerboseScriptureRange } from './scripture-range';
import {
  formatScriptureRangeCompact,
  formatScriptureRangeWithChapters,
  groupContiguousBookNumbers
} from './scripture-range-display';

const mockedLocationService = mock(LocationService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedDocument = mock(Document);

describe('groupContiguousBookNumbers', () => {
  it('groups a run of 3 or more into a range', () => {
    expect(groupContiguousBookNumbers([1, 2, 3])).toEqual([{ kind: 'range', start: 1, end: 3 }]);
  });

  it('keeps a run of 2 as individual books rather than a range', () => {
    expect(groupContiguousBookNumbers([1, 2])).toEqual([
      { kind: 'single', bookNumber: 1 },
      { kind: 'single', bookNumber: 2 }
    ]);
  });

  it('keeps a single book as an individual book', () => {
    expect(groupContiguousBookNumbers([5])).toEqual([{ kind: 'single', bookNumber: 5 }]);
  });

  it('handles multiple runs of different lengths', () => {
    expect(groupContiguousBookNumbers([1, 2, 5, 6, 7, 10])).toEqual([
      { kind: 'single', bookNumber: 1 },
      { kind: 'single', bookNumber: 2 },
      { kind: 'range', start: 5, end: 7 },
      { kind: 'single', bookNumber: 10 }
    ]);
  });

  it('returns an empty array for no book numbers', () => {
    expect(groupContiguousBookNumbers([])).toEqual([]);
  });
});

describe('formatScriptureRangeWithChapters', () => {
  let i18n: I18nService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [getTestTranslocoModule()] });
    when(mockedLocationService.search).thenReturn('');
    when(mockedCookieService.get(anything())).thenReturn('');
    // A genuine I18nService backed by the test transloco module (real 'en' translations, including book names).
    // ignoreCookieLocale=true keeps the constructor from reading the cookie locale, so the dependencies are only
    // present to satisfy construction.
    i18n = new I18nService(
      instance(mockedLocationService),
      instance(mockedBugsnagService),
      TestBed.inject(TranslocoService),
      instance(mockedCookieService),
      instance(mockedErrorReportingService),
      instance(mockedDocument),
      true
    );
  });

  function format(range: string, options?: { collapseFullBookRuns?: boolean }): string {
    return formatScriptureRangeWithChapters(new VerboseScriptureRange(range), i18n, options);
  }

  it('renders a chapter-less book as its name', () => {
    expect(format('GEN')).toEqual('Genesis');
  });

  it('renders a book whose chapters reach the canonical count as its name', () => {
    expect(format('GEN1-50')).toEqual('Genesis');
  });

  it('renders a book with a partial chapter selection with its chapter range', () => {
    expect(format('GEN1-3')).toEqual('Genesis 1-3');
  });

  it('parenthesizes only a multi-part chapter selection, with spaces after commas', () => {
    expect(format('GEN1-3,7')).toEqual('Genesis (1-3, 7)');
  });

  it('collapses adjacent full books into a range', () => {
    expect(format('GEN;EXO;LEV')).toEqual('Genesis - Leviticus');
  });

  it('lists two adjacent full books individually rather than as a range', () => {
    expect(format('GEN;EXO')).toEqual('Genesis and Exodus');
  });

  it('breaks a partial book out of a range of full books', () => {
    expect(format('GEN;EXO1-10;LEV')).toEqual('Genesis, Exodus 1-10, and Leviticus');
  });

  it('sorts books into canonical order', () => {
    expect(format('LEV;GEN;EXO1-10')).toEqual('Genesis, Exodus 1-10, and Leviticus');
  });

  it('lists full books individually when collapsing is disabled', () => {
    expect(format('GEN;EXO;LEV3', { collapseFullBookRuns: false })).toEqual('Genesis, Exodus, and Leviticus 3');
  });

  it('skips unknown book ids', () => {
    expect(format('XXX;GEN')).toEqual('Genesis');
  });

  it('returns an empty string for an empty range', () => {
    expect(format('')).toEqual('');
  });
});

describe('formatScriptureRangeCompact', () => {
  function format(range: string): string {
    return formatScriptureRangeCompact(new VerboseScriptureRange(range));
  }

  it('renders a full book as its ID', () => {
    expect(format('GEN')).toEqual('GEN');
    expect(format('GEN1-50')).toEqual('GEN');
  });

  it('renders a partial book with a space before its chapters', () => {
    expect(format('GEN2-3')).toEqual('GEN 2-3');
    expect(format('GEN1-3,7')).toEqual('GEN 1-3, 7');
  });

  it('collapses contiguous full books into an ID range', () => {
    expect(format('GEN;EXO;LEV')).toEqual('GEN-LEV');
  });

  it('lists two contiguous full books individually rather than as a range', () => {
    expect(format('GEN;EXO')).toEqual('GEN; EXO');
  });

  it('does not collapse non-contiguous full books', () => {
    expect(format('GEN;LEV')).toEqual('GEN; LEV');
  });

  it('breaks a partial book out of a range of full books', () => {
    expect(format('GEN;EXO2-3;LEV;NUM;DEU')).toEqual('GEN; EXO 2-3; LEV-DEU');
  });

  it('sorts books into canonical order', () => {
    expect(format('LEV;GEN;EXO')).toEqual('GEN-LEV');
  });

  it('returns an empty string for an empty range', () => {
    expect(format('')).toEqual('');
  });
});
