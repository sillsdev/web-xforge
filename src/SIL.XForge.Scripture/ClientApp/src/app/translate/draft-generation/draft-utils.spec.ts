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

    it('handles setting training and drafting sources', () => {
      const testSource = translateSource('test source');
      const testAdditionalTrainingSource = translateSource('test additional training source');
      const testAlternateTrainingSource = translateSource('test alternate training source');
      const testAlternateSource = translateSource('test alternate source');
      const testProject = createTestProjectProfile({
        translateConfig: {
          source: testSource,
          draftConfig: {
            draftingSources: [testAlternateSource],
            trainingSources: [testAlternateTrainingSource, testAdditionalTrainingSource]
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
