import merge from 'lodash/merge';
import { RecursivePartial } from '../../common/utils/type-utils';
import { TextAudio } from './text-audio';

function testTextAudio(ordinal: number): TextAudio {
  return {
    ownerRef: '',
    projectRef: '',
    dataId: '',
    timings: [],
    mimeType: 'audio/opus',
    audioUrl: `https://example.com/file${ordinal}.opus`
  };
}

export function createTestTextAudio(overrides?: RecursivePartial<TextAudio>, ordinal = 1): TextAudio {
  return merge(testTextAudio(ordinal), overrides);
}
