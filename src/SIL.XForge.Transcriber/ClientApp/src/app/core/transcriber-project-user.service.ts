import { Injectable } from '@angular/core';

import { JsonApiService } from 'xforge-common/json-api.service';
import { ProjectUserService } from 'xforge-common/project-user.service';
import { TranscriberProject } from './models/transcriber-project';
import { TranscriberProjectUser } from './models/transcriber-project-user';

@Injectable({
  providedIn: 'root'
})
export class TranscriberProjectUserService extends ProjectUserService<TranscriberProjectUser> {
  constructor(jsonApiService: JsonApiService) {
    super(TranscriberProjectUser.TYPE, jsonApiService, TranscriberProject.TYPE);
  }
}
