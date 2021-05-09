import { Project } from 'realtime-server/lib/esm/common/models/project';
import { JsonRealtimeDoc } from './json-realtime-doc';

export abstract class ProjectDoc<T extends Project = Project> extends JsonRealtimeDoc<T> {
  abstract get taskNames(): string[];
}
