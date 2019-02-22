import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { DomainModel } from 'xforge-common/models/domain-model';
import { ProjectUserService } from 'xforge-common/project-user.service';
import { ProjectService } from 'xforge-common/project.service';
import { TRANSCRIBER_DOMAIN_MODEL_CONFIG } from './models/transcriber-domain-model-config';
import { TranscriberProjectUserService } from './transcriber-project-user.service';
import { TranscriberProjectService } from './transcriber-project.service';

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: TranscriberProjectService },
    { provide: ProjectUserService, useExisting: TranscriberProjectUserService },
    { provide: DomainModel, useFactory: () => new DomainModel(TRANSCRIBER_DOMAIN_MODEL_CONFIG) }
  ]
})
export class CoreModule {}
