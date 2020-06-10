import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ProjectService } from 'xforge-common/project.service';
import { TypeRegistry } from 'xforge-common/type-registry';
import { SF_TYPE_REGISTRY } from './models/sf-type-registry';
import { SFProjectService } from './sf-project.service';

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [
    { provide: ProjectService, useExisting: SFProjectService },
    { provide: TypeRegistry, useValue: SF_TYPE_REGISTRY }
  ]
})
export class CoreModule {}
