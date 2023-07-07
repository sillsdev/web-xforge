import { ProjectData, PROJECT_DATA_INDEX_PATHS } from '../../common/models/project-data';
import { AudioTiming } from './audio-timing';

export const TEXT_AUDIO_COLLECTION = 'text_audio';
export const TEXT_AUDIO_INDEX_PATHS: string[] = PROJECT_DATA_INDEX_PATHS;

export function getTextAudioId(projectId: string, bookNum: number, chapterNum: number): string {
  return `${projectId}:${bookNum}:${chapterNum}:target`;
}

export interface TextAudio extends ProjectData {
  dataId: string;
  timings: AudioTiming[];
  mimeType: string;
  audioUrl: string;
}
