import { AudioData } from 'realtime-server/lib/common/models/audio-data';
import { Snapshot } from './models/snapshot';
import { QueryParameters, QueryResults } from './query-parameters';

/**
 * The model for a snapshot that is stored in the offline store.
 */
export interface RealtimeOfflineData extends Snapshot {
  pendingOps: any[];
}

export type RealtimeOfflineQueryResults = QueryResults<RealtimeOfflineData>;

/**
 * This is the abstract base class for real-time offline store implementations. An offline store is responsible for
 * saving and retrieving real-time doc snapshots in the browser.
 */
export abstract class RealtimeOfflineStore {
  abstract getAllIds(collection: string): Promise<string[]>;
  abstract getAll(collection: string): Promise<RealtimeOfflineData[]>;
  abstract getAllAudio(): Promise<AudioData[]>;
  abstract query(collection: string, parameters: QueryParameters): Promise<RealtimeOfflineQueryResults>;
  abstract get(collection: string, id: string): Promise<RealtimeOfflineData | undefined>;
  abstract getAudio(id: string): Promise<AudioData | undefined>;
  abstract put(collection: string, offlineData: RealtimeOfflineData): Promise<void>;
  abstract putAudio(audio: AudioData): Promise<AudioData | undefined>;
  abstract delete(collection: string, id: string): Promise<void>;
  abstract deleteAudio(id: string): Promise<void>;
  abstract deleteDB(): Promise<void>;
}
