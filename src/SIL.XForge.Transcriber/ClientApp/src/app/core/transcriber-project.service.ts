import { Injectable } from '@angular/core';

import { JsonApiService } from 'xforge-common/json-api.service';
import { ProjectRole } from 'xforge-common/models/project-role';
import { ProjectService } from 'xforge-common/project.service';
import { TranscriberProject } from './models/transcriber-project';

@Injectable({
  providedIn: 'root'
})
export class TranscriberProjectService extends ProjectService<TranscriberProject> {
  private static readonly ROLES: ProjectRole[] = [
    { role: 'administrator', displayName: 'Administrator' },
    { role: 'user', displayName: 'User' }
  ];

  constructor(jsonApiService: JsonApiService) {
    super(TranscriberProject.TYPE, jsonApiService, TranscriberProjectService.ROLES);
  }
}
