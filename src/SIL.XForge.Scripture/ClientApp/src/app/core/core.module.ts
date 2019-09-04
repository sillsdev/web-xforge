import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeDocTypes } from 'xforge-common/realtime-doc-types';
import { SF_REALTIME_DOC_TYPES } from './models/sf-realtime-doc-types';
import { SFProjectService } from './sf-project.service';

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: SFProjectService },
    { provide: RealtimeDocTypes, useValue: SF_REALTIME_DOC_TYPES }
  ]
})
export class CoreModule {}
