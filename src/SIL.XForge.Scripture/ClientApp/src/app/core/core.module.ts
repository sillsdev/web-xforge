import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeDocTypes } from 'xforge-common/realtime-doc-types';
import { QuestionListDoc } from './models/question-list-doc';
import { SFProjectDoc } from './models/sf-project-doc';
import { SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
import { TextDoc } from './models/text-doc';
import { SFProjectService } from './sf-project.service';

const REALTIME_DOC_TYPES = [UserDoc, UserProfileDoc, SFProjectDoc, SFProjectUserConfigDoc, QuestionListDoc, TextDoc];

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: SFProjectService },
    { provide: RealtimeDocTypes, useFactory: () => new RealtimeDocTypes(REALTIME_DOC_TYPES) }
  ]
})
export class CoreModule {}
