import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { USERS_COLLECTION, USER_PROFILES_COLLECTION } from 'realtime-server/lib/common/models/user';
import { QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { SF_PROJECTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { TEXTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
import { OfflineData } from 'xforge-common/offline-store';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../environments/environment';

export interface BetaMigrationMessage {
  progress: number;
  message: string;
}

@Component({
  templateUrl: './beta-migration.component.html'
})
export class BetaMigrationComponent {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly router: Router,
    private readonly userService: UserService
  ) {
    const collectionPromises: Promise<OfflineData[]>[] = [];
    const documentPromises: Promise<RealtimeDoc>[] = [];

    // Only run if we're in an iframe from master
    if (window.self === window.top) {
      this.router.navigateByUrl('/projects');
      return;
    }

    // Grab everything out of IndexDB
    this.postMessage({ message: 'fetching_data', progress: 10 });
    const collections = [
      QUESTIONS_COLLECTION,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      SF_PROJECTS_COLLECTION,
      TEXTS_COLLECTION,
      USERS_COLLECTION,
      USER_PROFILES_COLLECTION
    ];
    collections.map(c => {
      collectionPromises.push(this.realtimeService.offlineStore.getAll(c));
    });

    // Subscribe to all documents which will trigger any pending operations awaiting to be uploaded to the server
    Promise.all(collectionPromises).then(offlineStoreData => {
      this.postMessage({ message: 'checking_for_data', progress: 50 });
      offlineStoreData.map((offlineData: OfflineData[], index: number) => {
        offlineData.map(data => {
          documentPromises.push(this.realtimeService.subscribe(collections[index], data.id));
        });
      });

      // Close off this user from needing to migrate again and then inform the parent frame
      Promise.all(documentPromises).then(() => {
        this.postMessage({ message: 'cleaning_up', progress: 90 });
        // Mark this user as having their migration completed
        this.userService.userMigrationComplete();
        this.postMessage({ message: 'completed', progress: 100 });
      });
    });
  }

  private postMessage(message: BetaMigrationMessage) {
    window.parent.postMessage(message, environment.masterUrl);
  }
}
