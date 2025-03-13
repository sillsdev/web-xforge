import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';

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
  /*
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
  */
});
