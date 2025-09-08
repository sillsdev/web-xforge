import merge from 'lodash/merge';
import { RecursivePartial } from '../../common/utils/type-utils';
import { SFProjectUserConfig } from './sf-project-user-config';

export function createTestProjectUserConfig(overrides?: RecursivePartial<SFProjectUserConfig>): SFProjectUserConfig {
  // Create new object for each test
  const defaultSFProjectUserConfig: SFProjectUserConfig = {
    projectRef: 'project01',
    ownerRef: '',
    isTargetTextRight: false,
    confidenceThreshold: 0.2,
    transliterateBiblicalTerms: false,
    translationSuggestionsEnabled: true,
    numSuggestions: 1,
    selectedSegment: '',
    questionRefsRead: [],
    answerRefsRead: [],
    commentRefsRead: [],
    noteRefsRead: [],
    editorTabsOpen: [],
    lynxInsightState: {}
  };

  return merge(defaultSFProjectUserConfig, overrides);
}
