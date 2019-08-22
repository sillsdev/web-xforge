import { Project } from 'realtime-server/lib/common/models/project';
import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';

export abstract class ProjectDoc<T extends Project = Project> extends JsonRealtimeDoc<T> {
  static readonly TYPE = 'projects';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(ProjectDoc.TYPE, adapter, store);
  }

  abstract get taskNames(): string[];
}
