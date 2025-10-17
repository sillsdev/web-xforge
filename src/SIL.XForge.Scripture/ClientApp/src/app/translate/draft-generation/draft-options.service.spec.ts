import { TestBed } from '@angular/core/testing';
import {
  DraftUsfmConfig,
  ParagraphBreakFormat,
  QuoteFormat
} from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { BuildDto } from '../../machine-api/build-dto';
import { DraftOptionsService, FORMATTING_OPTIONS_SUPPORTED_DATE } from './draft-options.service';

const mockedActivatedProject = mock(ActivatedProjectService);
const mockedFeatureFlagService = mock(FeatureFlagService);

describe('DraftOptionsService', () => {
  let service: DraftOptionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DraftOptionsService,
        { provide: ActivatedProjectService, useValue: instance(mockedActivatedProject) },
        { provide: FeatureFlagService, useValue: instance(mockedFeatureFlagService) }
      ]
    });
    when(mockedFeatureFlagService.usfmFormat).thenReturn(createTestFeatureFlag(true));
    service = TestBed.inject(DraftOptionsService);
  });

  function buildProjectDoc(usfmConfig: Partial<DraftUsfmConfig> | 'absent'): SFProjectProfileDoc {
    const draftConfig: any = {};
    if (usfmConfig === 'absent') {
    } else {
      draftConfig.usfmConfig = { ...usfmConfig };
    }
    const doc = {
      data: {
        translateConfig: {
          draftConfig
        }
      }
    } as unknown as SFProjectProfileDoc;
    return doc;
  }

  function buildDtoWithDate(date: Date): BuildDto {
    return {
      additionalInfo: {
        dateFinished: date.toJSON()
      }
    } as BuildDto;
  }

  const SUPPORTED_BUILD_ENTRY: BuildDto = buildDtoWithDate(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() + 1));

  const PROJECT_DOC_BOTH_FORMATS: SFProjectProfileDoc = buildProjectDoc({
    paragraphFormat: ParagraphBreakFormat.BestGuess,
    quoteFormat: QuoteFormat.Normalized
  });
  const PROJECT_DOC_PARAGRAPH_ONLY: SFProjectProfileDoc = buildProjectDoc({
    paragraphFormat: ParagraphBreakFormat.BestGuess
  });
  const PROJECT_DOC_QUOTE_ONLY: SFProjectProfileDoc = buildProjectDoc({
    quoteFormat: QuoteFormat.Normalized
  });
  const PROJECT_DOC_EMPTY_USFM: SFProjectProfileDoc = buildProjectDoc({});

  describe('areFormattingOptionsSelected', () => {
    it('returns true when flag enabled and both options set', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_BOTH_FORMATS);
      expect(service.areFormattingOptionsSelected()).toBe(true);
    });

    it('returns false when flag enabled and one option missing', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_PARAGRAPH_ONLY);
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });

    it('returns false when flag enabled and both options missing', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_EMPTY_USFM);
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });

    it('returns false when flag disabled even if both options set', () => {
      when(mockedFeatureFlagService.usfmFormat).thenReturn(createTestFeatureFlag(false));
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_BOTH_FORMATS);
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });
  });

  describe('areFormattingOptionsAvailableButUnselected', () => {
    it('returns true when flag enabled and both options missing', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_EMPTY_USFM);
      expect(service.areFormattingOptionsAvailableButUnselected(SUPPORTED_BUILD_ENTRY)).toBe(true);
    });

    it('returns true when flag enabled and one option missing', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_QUOTE_ONLY);
      expect(service.areFormattingOptionsAvailableButUnselected(SUPPORTED_BUILD_ENTRY)).toBe(true);
    });

    it('returns false when flag enabled and both options set', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_BOTH_FORMATS);
      expect(service.areFormattingOptionsAvailableButUnselected(SUPPORTED_BUILD_ENTRY)).toBe(false);
    });

    it('returns false when flag disabled', () => {
      when(mockedFeatureFlagService.usfmFormat).thenReturn(createTestFeatureFlag(false));
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_EMPTY_USFM);
      expect(service.areFormattingOptionsAvailableButUnselected(SUPPORTED_BUILD_ENTRY)).toBe(false);
    });

    it('returns false when build entry unavailable', () => {
      when(mockedActivatedProject.projectDoc).thenReturn(PROJECT_DOC_EMPTY_USFM);
      expect(service.areFormattingOptionsAvailableButUnselected(undefined)).toBe(false);
    });
  });

  describe('areFormattingOptionsSupportedForBuild', () => {
    function buildWith(date: Date | undefined, flagEnabled: boolean = true): BuildDto | undefined {
      when(mockedFeatureFlagService.usfmFormat).thenReturn(createTestFeatureFlag(flagEnabled));
      if (date == null) {
        return { additionalInfo: {} } as BuildDto;
      }
      return buildDtoWithDate(date);
    }

    it('returns true when flag enabled and date after supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() + 1));
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(true);
    });

    it('returns false when flag disabled even if date after supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() + 1), false);
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(false);
    });

    it('returns false when date before supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() - 1));
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(false);
    });
  });
});
