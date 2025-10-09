import { TestBed } from '@angular/core/testing';
import { instance, mock, reset, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { BuildDto } from '../../machine-api/build-dto';
import { DraftOptionsService, FORMATTING_OPTIONS_SUPPORTED_DATE } from './draft-options.service';

const activatedProjectMock = mock(ActivatedProjectService);
const featureFlagServiceMock = mock(FeatureFlagService);

describe('DraftOptionsService', () => {
  let service: DraftOptionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DraftOptionsService,
        { provide: ActivatedProjectService, useValue: instance(activatedProjectMock) },
        { provide: FeatureFlagService, useValue: instance(featureFlagServiceMock) }
      ]
    });
    // default: feature flag enabled unless a test overrides
    when(featureFlagServiceMock.usfmFormat).thenReturn(createTestFeatureFlag(true));
    service = TestBed.inject(DraftOptionsService);
  });

  function setProjectDoc(data: any | undefined): void {
    when(activatedProjectMock.projectDoc).thenReturn(
      data == null ? (undefined as unknown as SFProjectProfileDoc) : ({ data } as SFProjectProfileDoc)
    );
  }

  describe('areFormattingOptionsSelected', () => {
    it('returns true when flag enabled and both options set', () => {
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: { paragraphFormat: 'p', quoteFormat: 'q1' } } } });
      expect(service.areFormattingOptionsSelected()).toBe(true);
    });

    it('returns false when flag enabled and one option missing', () => {
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: { paragraphFormat: 'p' } } } });
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });

    it('returns false when flag enabled and both options missing', () => {
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: {} } } });
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });

    it('returns false when project doc missing', () => {
      setProjectDoc(undefined);
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });

    it('returns false when flag disabled even if both options set', () => {
      reset(featureFlagServiceMock);
      when(featureFlagServiceMock.usfmFormat).thenReturn(createTestFeatureFlag(false));
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: { paragraphFormat: 'p', quoteFormat: 'q1' } } } });
      expect(service.areFormattingOptionsSelected()).toBe(false);
    });
  });

  describe('areFormattingOptionsAvailableButUnselected', () => {
    it('returns true when flag enabled and both options missing', () => {
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: {} } } });
      expect(service.areFormattingOptionsAvailableButUnselected()).toBe(true);
    });

    it('returns true when flag enabled and one option missing', () => {
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: { quoteFormat: 'q1' } } } });
      expect(service.areFormattingOptionsAvailableButUnselected()).toBe(true);
    });

    it('returns false when flag enabled and both options set', () => {
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: { paragraphFormat: 'p', quoteFormat: 'q1' } } } });
      expect(service.areFormattingOptionsAvailableButUnselected()).toBe(false);
    });

    it('returns false when flag disabled', () => {
      reset(featureFlagServiceMock);
      when(featureFlagServiceMock.usfmFormat).thenReturn(createTestFeatureFlag(false));
      setProjectDoc({ translateConfig: { draftConfig: { usfmConfig: {} } } });
      expect(service.areFormattingOptionsAvailableButUnselected()).toBe(false);
    });

    it('returns false when project doc missing', () => {
      setProjectDoc(undefined);
      // Without a project doc, formatting options are implicitly unselected while flag is enabled
      expect(service.areFormattingOptionsAvailableButUnselected()).toBe(true);
    });
  });

  describe('areFormattingOptionsSupportedForBuild', () => {
    function buildWith(date: Date | undefined, flagEnabled: boolean = true): BuildDto | undefined {
      reset(featureFlagServiceMock);
      when(featureFlagServiceMock.usfmFormat).thenReturn(createTestFeatureFlag(flagEnabled));
      if (date == null) {
        return { additionalInfo: {} } as BuildDto;
      }
      return { additionalInfo: { dateFinished: date.toJSON() } } as BuildDto;
    }

    it('returns true when flag enabled and date after supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() + 1));
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(true);
    });

    it('returns false when flag disabled even if date after supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() + 1), false);
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(false);
    });

    it('returns false when date equals supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime()));
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(false);
    });

    it('returns false when date before supported date', () => {
      const entry = buildWith(new Date(FORMATTING_OPTIONS_SUPPORTED_DATE.getTime() - 1));
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(false);
    });

    it('returns false when dateFinished missing', () => {
      const entry = buildWith(undefined);
      expect(service.areFormattingOptionsSupportedForBuild(entry)).toBe(false);
    });

    it('returns false when entry undefined', () => {
      reset(featureFlagServiceMock);
      when(featureFlagServiceMock.usfmFormat).thenReturn(createTestFeatureFlag(true));
      expect(service.areFormattingOptionsSupportedForBuild(undefined)).toBe(false);
    });
  });
});
