import { Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { CommandService } from 'xforge-common/command.service';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RetryingRequestService } from 'xforge-common/retrying-request.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_PROJECT_ROLES } from '../core/models/sf-project-role-info';

@Injectable({
  providedIn: 'root'
})
export class ServalAdministrationService extends ProjectService<SFProjectProfile, SFProjectProfileDoc> {
  protected readonly collection = SFProjectProfileDoc.COLLECTION;

  constructor(
    realtimeService: RealtimeService,
    commandService: CommandService,
    protected readonly retryingRequestService: RetryingRequestService
  ) {
    super(realtimeService, commandService, retryingRequestService, SF_PROJECT_ROLES);
  }
}
