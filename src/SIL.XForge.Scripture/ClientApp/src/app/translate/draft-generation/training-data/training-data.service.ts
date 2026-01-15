import { DestroyRef, Injectable } from '@angular/core';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { getTrainingDataId, TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { CommandService } from 'xforge-common/command.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { QueryParameters } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { PROJECTS_URL } from 'xforge-common/url-constants';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';

@Injectable({
  providedIn: 'root'
})
export class TrainingDataService {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly commandService: CommandService
  ) {}

  async createTrainingDataAsync(trainingData: TrainingData): Promise<void> {
    const docId: string = getTrainingDataId(trainingData.projectRef, trainingData.dataId);
    await this.realtimeService.create<TrainingDataDoc>(TrainingDataDoc.COLLECTION, docId, trainingData);
  }

  async deleteTrainingDataAsync(trainingData: TrainingData): Promise<void> {
    await this.commandService.onlineInvoke<void>(PROJECTS_URL, 'markTrainingDataDeleted', {
      projectId: trainingData.projectRef,
      dataId: trainingData.dataId
    });
  }

  queryTrainingDataAsync(projectId: string, destroyRef: DestroyRef): Promise<RealtimeQuery<TrainingDataDoc>> {
    const queryParams: QueryParameters = {
      [obj<TrainingData>().pathStr(t => t.projectRef)]: projectId
    };
    return this.realtimeService.subscribeQuery(TrainingDataDoc.COLLECTION, queryParams, destroyRef);
  }
}
