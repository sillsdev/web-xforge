import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { OfflineDataTypes } from 'xforge-common/offline-data-types';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeDocTypes } from 'xforge-common/realtime-doc-types';
import { SF_OFFLINE_DATA_TYPES } from './models/sf-offline-data-types';
import { SF_REALTIME_DOC_TYPES } from './models/sf-realtime-doc-types';
import { SFProjectService } from './sf-project.service';

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: SFProjectService },
    { provide: RealtimeDocTypes, useValue: SF_REALTIME_DOC_TYPES },
    { provide: OfflineDataTypes, useValue: SF_OFFLINE_DATA_TYPES }
  ]
})
export class CoreModule {}
