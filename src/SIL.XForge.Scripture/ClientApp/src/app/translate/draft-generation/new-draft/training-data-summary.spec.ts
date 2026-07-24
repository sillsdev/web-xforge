import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { CookieService } from 'ngx-cookie-service';
import { anything, instance, mock, when } from 'ts-mockito';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { getTestTranslocoModule } from 'xforge-common/test-utils';
import { VerboseScriptureRange } from '../../../shared/scripture-range';
import { formatTrainingBooksSummary } from './training-data-summary';

const mockedLocationService = mock(LocationService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedDocument = mock(Document);

describe('formatTrainingBooksSummary', () => {
  const GEN = Canon.bookIdToNumber('GEN');
  const EXO = Canon.bookIdToNumber('EXO');
  const LEV = Canon.bookIdToNumber('LEV');
  const NUM = Canon.bookIdToNumber('NUM');

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

  function format(bookNumbers: number[], selected: string, available: string, drafting = ''): string {
    return formatTrainingBooksSummary(
      bookNumbers,
      new VerboseScriptureRange(selected),
      new VerboseScriptureRange(available),
      new VerboseScriptureRange(drafting),
      i18n
    );
  }

  it('collapses fully-used books into a single range', () => {
    expect(format([GEN, EXO, LEV], 'GEN1-50;EXO1-40;LEV1-27', 'GEN1-50;EXO1-40;LEV1-27')).toEqual(
      'Genesis - Leviticus'
    );
  });

  it('renders a single fully-used book as its name', () => {
    expect(format([EXO], 'EXO1-40', 'EXO1-40')).toEqual('Exodus');
  });

  it('breaks a partial book in the middle out of the range and shows its chapters', () => {
    expect(format([GEN, EXO, LEV], 'GEN1-50;EXO1-10;LEV1-27', 'GEN1-50;EXO1-40;LEV1-27')).toEqual(
      'Genesis, Exodus 1-10, and Leviticus'
    );
  });

  it('handles a partial book at the start', () => {
    expect(format([GEN, EXO, LEV], 'GEN1-10;EXO1-40;LEV1-27', 'GEN1-50;EXO1-40;LEV1-27')).toEqual(
      'Genesis 1-10, Exodus, and Leviticus'
    );
  });

  it('handles a partial book at the end', () => {
    expect(format([GEN, EXO, LEV], 'GEN1-50;EXO1-40;LEV1-10', 'GEN1-50;EXO1-40;LEV1-27')).toEqual(
      'Genesis, Exodus, and Leviticus 1-10'
    );
  });

  it('does not merge full books across a partial book', () => {
    expect(format([GEN, EXO, LEV, NUM], 'GEN1-50;EXO1-5;LEV1-27;NUM1-36', 'GEN1-50;EXO1-40;LEV1-27;NUM1-36')).toEqual(
      'Genesis, Exodus 1-5, Leviticus, and Numbers'
    );
  });

  it('shows the training chapter range for a partially-drafted book whose remaining chapters are all selected', () => {
    // Draft the latter two-thirds (GEN18-50); the complete first third (GEN1-17) is available and fully selected.
    expect(format([GEN], 'GEN1-17', 'GEN1-17', 'GEN18-50')).toEqual('Genesis 1-17');
  });

  it('formats non-contiguous selected chapters with spaces after commas', () => {
    expect(format([GEN], 'GEN1-3,7', 'GEN1-50')).toEqual('Genesis (1-3, 7)');
  });

  it('treats a book missing from the target training selection as full (defensive)', () => {
    // EXO has no entry in the selection; it should not crash and should render as a full book.
    expect(format([GEN, EXO], 'GEN1-50', 'GEN1-50;EXO1-40')).toEqual('Genesis and Exodus');
  });
});
