import { RealtimeDocConstructor } from './realtime-doc';
import { UserDoc } from './user-doc';
import { UserProfileDoc } from './user-profile-doc';

export interface DomainModelConfig {
  realtimeDocTypes: RealtimeDocConstructor[];
}

/**
 * This class is used to register all domain model classes so that {@link JSONAPIService} and {@link RealtimeService}
 * can create them dynamically. All {@link Resource}, {@link ResourceRef}, and {@link RealtimeDoc} classes should be
 * included in the configuration. This class should be registered with the Angular DI container.
 */
export class DomainModel {
  private readonly _realtimeDocTypes = new Map<string, RealtimeDocConstructor>();

  constructor(settings: DomainModelConfig) {
    this._realtimeDocTypes = this.createMap(settings.realtimeDocTypes);
    this._realtimeDocTypes.set(UserDoc.TYPE, UserDoc);
    this._realtimeDocTypes.set(UserProfileDoc.TYPE, UserProfileDoc);
  }

  get realtimeDocTypes(): IterableIterator<string> {
    return this._realtimeDocTypes.keys();
  }

  getRealtimeDocType(recordType: string): RealtimeDocConstructor {
    return this._realtimeDocTypes.get(recordType);
  }

  private createMap(models: any[]): Map<string, any> {
    return new Map<string, any>(models.map(r => [r.TYPE, r] as [string, any]));
  }
}
