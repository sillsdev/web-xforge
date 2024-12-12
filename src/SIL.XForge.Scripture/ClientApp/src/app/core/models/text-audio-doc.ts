import {
  TEXT_AUDIO_COLLECTION,
  TEXT_AUDIO_INDEX_PATHS,
  TextAudio
} from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class TextAudioDoc extends ProjectDataDoc<TextAudio> {
  static readonly COLLECTION = TEXT_AUDIO_COLLECTION;
  static readonly INDEX_PATHS = TEXT_AUDIO_INDEX_PATHS;
}
