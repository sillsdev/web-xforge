import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';
import { Project } from './project';

export abstract class ProjectDoc<T extends Project = Project> extends JsonRealtimeDoc<T> {
  static readonly TYPE = 'projects';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(ProjectDoc.TYPE, adapter, store);
  }

  abstract get taskNames(): string[];
}
