import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { getTrainingDataId, TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { anything, mock, verify } from 'ts-mockito';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { UNKNOWN_COMPONENT_OR_SERVICE } from 'xforge-common/models/realtime-doc';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { Snapshot } from 'xforge-common/models/snapshot';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TypeRegistry } from 'xforge-common/type-registry';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { TrainingDataService } from './training-data.service';

describe('TrainingDataService', () => {
  const trainingData: Partial<Snapshot<TrainingData>>[] = [
    {
      id: getTrainingDataId('project01', 'data01'),
      data: {
        projectRef: 'project01',
        dataId: 'data01',
        fileUrl: 'project01/test.csv',
        mimeType: 'text/csv',
        skipRows: 0,
        title: 'test.csv',
        ownerRef: 'user01'
      }
    },
    {
      id: getTrainingDataId('project02', 'data02'),
      data: {
        projectRef: 'project02',
        dataId: 'data02',
        fileUrl: 'project02/test2.csv',
        mimeType: 'text/csv',
        skipRows: 0,
        title: 'test2.csv',
        ownerRef: 'user01'
      }
    }
  ];
  let trainingDataService: TrainingDataService;
  let realtimeService: TestRealtimeService;
  const mockedFileService = mock(FileService);

  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(new TypeRegistry([TrainingDataDoc], [FileType.TrainingData], []))],
    providers: [{ provide: FileService, useMock: mockedFileService }]
  }));

  beforeEach(() => {
    realtimeService = TestBed.inject(TestRealtimeService);
    realtimeService.addSnapshots<TrainingData>(TrainingDataDoc.COLLECTION, trainingData);
    trainingDataService = TestBed.inject(TrainingDataService);
  });

  it('should create a training data doc', fakeAsync(async () => {
    const newTrainingData = {
      projectRef: 'project01',
      dataId: 'data03',
      fileUrl: 'project01/test3.csv',
      mimeType: 'text/csv',
      skipRows: 0,
      title: 'test3.csv',
      ownerRef: 'user01'
    };
    await trainingDataService.createTrainingDataAsync(newTrainingData);
    tick();

    const trainingDataDoc = realtimeService.get<TrainingDataDoc>(
      TrainingDataDoc.COLLECTION,
      getTrainingDataId('project01', 'data03'),
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    expect(trainingDataDoc.data).toEqual(newTrainingData);
  }));

  it('should delete a training data doc', fakeAsync(async () => {
    // Verify the document exists
    const existingTrainingDataDoc = realtimeService.get<TrainingDataDoc>(
      TrainingDataDoc.COLLECTION,
      getTrainingDataId('project01', 'data01'),
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    expect(existingTrainingDataDoc.data?.dataId).toBe('data01');
    expect(existingTrainingDataDoc.data?.projectRef).toBe('project01');

    // SUT
    const trainingDataToDelete: TrainingData = {
      projectRef: 'project01',
      dataId: 'data01',
      fileUrl: '',
      mimeType: '',
      skipRows: 0,
      title: '',
      ownerRef: 'user01'
    };
    await trainingDataService.deleteTrainingDataAsync(trainingDataToDelete);
    tick();

    const trainingDataDoc = realtimeService.get<TrainingDataDoc>(
      TrainingDataDoc.COLLECTION,
      getTrainingDataId('project01', 'data01'),
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    expect(trainingDataDoc.data).toBeUndefined();
    verify(
      mockedFileService.deleteFile(
        FileType.TrainingData,
        'project01',
        TrainingDataDoc.COLLECTION,
        anything(),
        anything()
      )
    ).once();
  }));

  it('should query training data docs', fakeAsync(async () => {
    const query: RealtimeQuery<TrainingDataDoc> = await trainingDataService.queryTrainingDataAsync(
      'project01',
      noopDestroyRef
    );
    tick();

    expect(trainingData.length).toEqual(2);
    expect(query.docs.length).toEqual(1);
  }));
});
