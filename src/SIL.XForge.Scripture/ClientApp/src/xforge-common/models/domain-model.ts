import { RealtimeDocConstructor } from './realtime-doc';
import { ResourceConstructor, ResourceRefConstructor } from './resource';
import { User, UserRef } from './user';

export interface DomainModelConfig {
  resourceTypes: ResourceConstructor[];
  resourceRefTypes: ResourceRefConstructor[];
  realtimeDocTypes: RealtimeDocConstructor[];
}

/**
 * This class is used to register all domain model classes so that {@link JSONAPIService} and {@link RealtimeService}
 * can create them dynamically. All {@link Resource}, {@link ResourceRef}, and {@link RealtimeDoc} classes should be
 * included in the configuration. This class should be registered with the Angular DI container.
 */
export class DomainModel {
  private readonly _resourceTypes: Map<string, ResourceConstructor>;
  private readonly _resourceRefTypes = new Map<string, ResourceRefConstructor>();
  private readonly _realtimeDocTypes = new Map<string, RealtimeDocConstructor>();

  constructor(settings: DomainModelConfig) {
    this._resourceTypes = this.createMap(settings.resourceTypes);
    this._resourceTypes.set(User.TYPE, User);
    this._resourceRefTypes = this.createMap(settings.resourceRefTypes);
    this._resourceRefTypes.set(UserRef.TYPE, UserRef);
    this._realtimeDocTypes = this.createMap(settings.realtimeDocTypes);
  }

  get resourceTypes(): IterableIterator<string> {
    return this._resourceTypes.keys();
  }

  get realtimeDocTypes(): IterableIterator<string> {
    return this._realtimeDocTypes.keys();
  }

  getResourceType(recordType: string): ResourceConstructor {
    return this._resourceTypes.get(recordType);
  }

  getResourceRefType(recordType: string): ResourceRefConstructor {
    return this._resourceRefTypes.get(recordType);
  }

  getRealtimeDocType(recordType: string): RealtimeDocConstructor {
    return this._realtimeDocTypes.get(recordType);
  }

  private createMap(models: any[]): Map<string, any> {
    return new Map<string, any>(models.map(r => [r.TYPE, r] as [string, any]));
  }
}
