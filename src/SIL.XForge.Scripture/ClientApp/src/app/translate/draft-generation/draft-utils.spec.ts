import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { normalizeLanguageCodeToISO639_3, projectToDraftSources } from './draft-utils';

function translateSource(id: string): TranslateSource {
  return {
    projectRef: `SF${id}`,
    paratextId: `PT${id}`,
    writingSystem: { tag: 'en' },
    shortName: `TP${id}`,
    name: `Test Project ${id}`
  };
}

describe('DraftUtils', () => {
  describe('projectToDraftSources', () => {
    it('handles default project', () => {
      const testProject = createTestProjectProfile();
      const result = projectToDraftSources(testProject);
      expect(result).toEqual({ draftingSources: [], trainingSources: [], trainingTargets: [testProject] });
    });

    it('defaults to using a regular source as both source and target', () => {
      const testSource: TranslateSource = translateSource('test source');
      const testProject = createTestProjectProfile({ translateConfig: { source: testSource } });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testSource],
        trainingSources: [testSource],
        trainingTargets: [testProject]
      });
    });

    it('handles overriding training source', () => {
      const testSource: TranslateSource = translateSource('test source');
      const testTrainingSource: TranslateSource = translateSource('test training source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: { alternateTrainingSourceEnabled: true, alternateTrainingSource: testTrainingSource }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testSource],
        trainingSources: [testTrainingSource],
        trainingTargets: [testProject]
      });
    });

    it('handles overriding drafting source', () => {
      const testSource: TranslateSource = translateSource('test source');
      const testDraftingSource: TranslateSource = translateSource('test drafting source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: { alternateSourceEnabled: true, alternateSource: testDraftingSource }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testDraftingSource],
        trainingSources: [testSource],
        trainingTargets: [testProject]
      });
    });

    it('handles setting additional training source', () => {
      const testSource = translateSource('test source');
      const testAdditionalTrainingSource = translateSource('test additional training source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: { additionalTrainingSourceEnabled: true, additionalTrainingSource: testAdditionalTrainingSource }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testSource],
        trainingSources: [testSource, testAdditionalTrainingSource],
        trainingTargets: [testProject]
      });
    });

    it('handles setting additional training source and alternate training source', () => {
      const testSource = translateSource('test source');
      const testAdditionalTrainingSource = translateSource('test additional training source');
      const testAlternateTrainingSource = translateSource('test alternate training source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: {
            additionalTrainingSourceEnabled: true,
            additionalTrainingSource: testAdditionalTrainingSource,
            alternateTrainingSourceEnabled: true,
            alternateTrainingSource: testAlternateTrainingSource
          }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testSource],
        trainingSources: [testAlternateTrainingSource, testAdditionalTrainingSource],
        trainingTargets: [testProject]
      });
    });

    it('handles setting additional training source and alternate training source and alternate source', () => {
      const testSource = translateSource('test source');
      const testAdditionalTrainingSource = translateSource('test additional training source');
      const testAlternateTrainingSource = translateSource('test alternate training source');
      const testAlternateSource = translateSource('test alternate source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: {
            alternateSourceEnabled: true,
            alternateSource: testAlternateSource,
            additionalTrainingSourceEnabled: true,
            additionalTrainingSource: testAdditionalTrainingSource,
            alternateTrainingSourceEnabled: true,
            alternateTrainingSource: testAlternateTrainingSource
          }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testAlternateSource],
        trainingSources: [testAlternateTrainingSource, testAdditionalTrainingSource],
        trainingTargets: [testProject]
      });
    });

    it('handles sources that are set but disabled', () => {
      const testSource = translateSource('test source');
      const testAdditionalTrainingSource = translateSource('test additional training source');
      const testAlternateTrainingSource = translateSource('test alternate training source');
      const testAlternateSource = translateSource('test alternate source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: {
            alternateSourceEnabled: false,
            alternateSource: testAlternateSource,
            additionalTrainingSourceEnabled: false,
            additionalTrainingSource: testAdditionalTrainingSource,
            alternateTrainingSourceEnabled: false,
            alternateTrainingSource: testAlternateTrainingSource
          }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testSource],
        trainingSources: [testSource],
        trainingTargets: [testProject]
      });
    });

    it('handles sources that are enabled but set to undefined', () => {
      const testSource = translateSource('test source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: {
            alternateSourceEnabled: true,
            alternateSource: undefined,
            additionalTrainingSourceEnabled: true,
            additionalTrainingSource: undefined,
            alternateTrainingSourceEnabled: true,
            alternateTrainingSource: undefined
          }
        }
      });

      const result = projectToDraftSources(testProject);
      expect(result).toEqual({
        draftingSources: [testSource],
        trainingSources: [testSource],
        trainingTargets: [testProject]
      });
    });
  });
});

describe('normalizeLanguageCodeToISO639_3', () => {
  it('handles ISO 639-1 codes', () => {
    expect(normalizeLanguageCodeToISO639_3('en')).toBe('eng');
    expect(normalizeLanguageCodeToISO639_3('zh')).toBe('zho');
  });

  it('handles ISO 639-2 bibliography codes', () => {
    expect(normalizeLanguageCodeToISO639_3('fre')).toBe('fra');
    expect(normalizeLanguageCodeToISO639_3('chi')).toBe('zho');
  });

  it('handles codes with a region or script', () => {
    expect(normalizeLanguageCodeToISO639_3('en-US')).toBe('eng');
    expect(normalizeLanguageCodeToISO639_3('zh-CN')).toBe('zho');

    expect(normalizeLanguageCodeToISO639_3('zh-Hans')).toBe('zho');
    expect(normalizeLanguageCodeToISO639_3('en-Latn')).toBe('eng');

    expect(normalizeLanguageCodeToISO639_3('zh-Hans-CN')).toBe('zho');
    expect(normalizeLanguageCodeToISO639_3('en-Latn-US')).toBe('eng');
  });
});
