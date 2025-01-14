import { DestroyRef, Injectable } from '@angular/core';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { getTrainingDataId, TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { QueryParameters } from 'xforge-common/query-parameters';
import { RealtimeService } from 'xforge-common/realtime.service';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';

@Injectable({
  providedIn: 'root'
})
export class TrainingDataService {
  constructor(private readonly realtimeService: RealtimeService) {}

  async createTrainingDataAsync(trainingData: TrainingData): Promise<void> {
    const docId: string = getTrainingDataId(trainingData.projectRef, trainingData.dataId);
    await this.realtimeService.create<TrainingDataDoc>(TrainingDataDoc.COLLECTION, docId, trainingData);
  }

  async deleteTrainingDataAsync(trainingData: TrainingData): Promise<void> {
    // Get the training data document
    const docId: string = getTrainingDataId(trainingData.projectRef, trainingData.dataId);
    const trainingDataDoc = this.realtimeService.get<TrainingDataDoc>(TrainingDataDoc.COLLECTION, docId);
    if (!trainingDataDoc.isLoaded) return;

    // Delete the training data file and document
    await trainingDataDoc.deleteFile(FileType.TrainingData, trainingData.dataId, trainingData.ownerRef);
    await trainingDataDoc.delete();
  }

  queryTrainingDataAsync(projectId: string, destroyRef: DestroyRef): Promise<RealtimeQuery<TrainingDataDoc>> {
    const queryParams: QueryParameters = {
      [obj<TrainingData>().pathStr(t => t.projectRef)]: projectId
    };
    return this.realtimeService.subscribeQuery(TrainingDataDoc.COLLECTION, queryParams, destroyRef);
  }
}
