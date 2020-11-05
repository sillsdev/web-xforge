import { Observable } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { FeatureOfflineData } from './models/feature-offline-data';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { SubscriptionDisposable } from './subscription-disposable';

/**
 * A service to execute a feature that requires an internet connection using data stored in IndexedDB
 */
export abstract class OnlineFeatureService extends SubscriptionDisposable {
  private onlineStatus$: Observable<boolean>;
  constructor(protected readonly offlineStore: OfflineStore, protected readonly pwaService: PwaService) {
    super();
    this.onlineStatus$ = this.pwaService.onlineStatus.pipe(
      filter(online => online),
      share()
    );
  }

  protected put<T extends FeatureOfflineData>(collection: string, data: T): Promise<void> {
    return this.offlineStore.put(collection, data);
  }

  protected getAll<T extends FeatureOfflineData>(collection: string): Promise<T[]> {
    return this.offlineStore.getAll<T>(collection);
  }
  protected get<T extends FeatureOfflineData>(collection: string, id: string): Promise<T | undefined> {
    return this.offlineStore.get(collection, id);
  }

  protected delete(collection: string, id: string): Promise<void> {
    return this.offlineStore.delete(collection, id);
  }

  protected onlineCallback(callback: () => any): void {
    this.subscribe(this.onlineStatus$, callback);
  }
}
