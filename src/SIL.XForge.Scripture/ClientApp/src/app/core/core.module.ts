import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { DomainModel } from 'xforge-common/models/domain-model';
import { ProjectService } from 'xforge-common/project.service';
import { SFDOMAIN_MODEL_CONFIG } from './models/sfdomain-model-config';
import { SFProjectService } from './sfproject.service';

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: SFProjectService },
    { provide: DomainModel, useFactory: () => new DomainModel(SFDOMAIN_MODEL_CONFIG) }
  ]
})
export class CoreModule {}
