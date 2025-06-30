import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { Observable } from 'rxjs';
import { CommandService } from 'xforge-common/command.service';
import { ProjectService } from 'xforge-common/project.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RetryingRequestService } from 'xforge-common/retrying-request.service';
import { PARATEXT_API_NAMESPACE } from 'xforge-common/url-constants';
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
    protected readonly retryingRequestService: RetryingRequestService,
    private readonly httpClient: HttpClient,
    destroyRef: DestroyRef
  ) {
    super(realtimeService, commandService, retryingRequestService, SF_PROJECT_ROLES, destroyRef);
  }

  /**
   * Downloads a project zip file as a blob
   * @param projectId The Scripture Forge project identifier.
   * @returns An observable.
   */
  downloadProject(projectId: string): Observable<Blob> {
    return this.httpClient.get(`${PARATEXT_API_NAMESPACE}/projects/${projectId}/download`, {
      responseType: 'blob' // Set responseType to 'blob' to handle binary data
    });
  }

  /**
   * Starts a job to retrieve the pre-translation status for a project.
   * This is the equivalent of running the webhook.
   * @param projectId The Scripture Forge project identifier.
   * @returns An promise.
   */
  onlineRetrievePreTranslationStatus(projectId: string): Promise<void> {
    return this.onlineInvoke<void>('retrievePreTranslationStatus', { projectId });
  }
}
