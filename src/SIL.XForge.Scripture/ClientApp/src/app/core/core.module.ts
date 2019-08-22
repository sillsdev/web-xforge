import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeDocTypes } from 'xforge-common/realtime-doc-types';
import { CommentListDoc } from './models/comment-list-doc';
import { QuestionListDoc } from './models/question-list-doc';
import { SFProjectDoc } from './models/sf-project-doc';
import { SFProjectUserConfigDoc } from './models/sf-project-user-config-doc';
import { TextDoc } from './models/text-doc';
import { SFProjectService } from './sf-project.service';

const REALTIME_DOC_TYPES = [SFProjectDoc, SFProjectUserConfigDoc, QuestionListDoc, TextDoc, CommentListDoc];

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: SFProjectService },
    { provide: RealtimeDocTypes, useFactory: () => new RealtimeDocTypes(REALTIME_DOC_TYPES) }
  ]
})
export class CoreModule {}
