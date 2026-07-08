import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { getTrainingDataId, TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { CommandService } from 'xforge-common/command.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TypeRegistry } from 'xforge-common/type-registry';
import { PROJECTS_URL } from 'xforge-common/url-constants';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
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
        ownerRef: 'user01',
        deleted: false
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
        ownerRef: 'user01',
        deleted: false
      }
    },
    {
      id: getTrainingDataId('project01', 'deletedData'),
      data: {
        projectRef: 'project01',
        dataId: 'deletedData',
        fileUrl: 'project01/deleted.csv',
        mimeType: 'text/csv',
        skipRows: 0,
        title: 'deleted.csv',
        ownerRef: 'user01',
        deleted: true
      }
    }
  ];
  let trainingDataService: TrainingDataService;
  let realtimeService: TestRealtimeService;
  const mockedCommandService = mock(CommandService);

  configureTestingModule(() => ({
    providers: [
      provideTestRealtime(new TypeRegistry([TrainingDataDoc], [], [])),
      { provide: CommandService, useMock: mockedCommandService }
    ]
  }));

  beforeEach(() => {
    realtimeService = TestBed.inject(TestRealtimeService);
    realtimeService.addSnapshots<TrainingData>(TrainingDataDoc.COLLECTION, trainingData);
    trainingDataService = TestBed.inject(TrainingDataService);

    when(mockedCommandService.onlineInvoke<void>(anything(), anything(), anything())).thenResolve();
  });

  it('should create a training data doc', fakeAsync(async () => {
    const newTrainingData = {
      projectRef: 'project01',
      dataId: 'data03',
      fileUrl: 'project01/test3.csv',
      mimeType: 'text/csv',
      skipRows: 0,
      title: 'test3.csv',
      ownerRef: 'user01',
      deleted: false
    };
    await trainingDataService.createTrainingDataAsync(newTrainingData);
    tick();

    const trainingDataDoc = await realtimeService.get<TrainingDataDoc>(
      TrainingDataDoc.COLLECTION,
      getTrainingDataId('project01', 'data03'),
      new DocSubscription('spec')
    );
    expect(trainingDataDoc.data).toEqual(newTrainingData);
  }));

  it('should request deletion via RPC', fakeAsync(async () => {
    const trainingDataToDelete: TrainingData = {
      projectRef: 'project01',
      dataId: 'data01',
      fileUrl: '',
      mimeType: '',
      skipRows: 0,
      title: '',
      ownerRef: 'user01',
      deleted: false
    };

    await trainingDataService.deleteTrainingDataAsync(trainingDataToDelete);
    tick();

    verify(
      mockedCommandService.onlineInvoke<void>(
        PROJECTS_URL,
        'markTrainingDataDeleted',
        deepEqual({ projectId: 'project01', dataId: 'data01' })
      )
    ).once();
    expect().nothing();
  }));

  describe('getTrainingData', () => {
    it('should emit only non-deleted files for the specified project', fakeAsync(() => {
      let emittedFiles: TrainingData[] | undefined;
      const subscription = trainingDataService.getTrainingData('project01', noopDestroyRef).subscribe(files => {
        emittedFiles = files;
      });
      tick();

      // Should include data01 (project01, not deleted) but exclude data02 (wrong project) and deletedData (deleted)
      expect(emittedFiles).toBeDefined();
      expect(emittedFiles!.map(f => f.dataId)).toEqual(['data01']);

      subscription.unsubscribe();
    }));

    it('should not include files from other projects', fakeAsync(() => {
      let emittedFiles: TrainingData[] | undefined;
      const subscription = trainingDataService.getTrainingData('project02', noopDestroyRef).subscribe(files => {
        emittedFiles = files;
      });
      tick();

      expect(emittedFiles).toBeDefined();
      expect(emittedFiles!.map(f => f.dataId)).toEqual(['data02']);

      subscription.unsubscribe();
    }));

    it('should include deleted files when includeDeleted is true', fakeAsync(() => {
      let emittedFiles: TrainingData[] | undefined;
      const subscription = trainingDataService
        .getTrainingData('project01', noopDestroyRef, { includeDeleted: true })
        .subscribe(files => {
          emittedFiles = files;
        });
      tick();

      expect(emittedFiles).toBeDefined();
      expect(emittedFiles!.map(f => f.dataId)).toEqual(['data01', 'deletedData']);
      expect(emittedFiles!.length).toEqual(2);

      subscription.unsubscribe();
    }));
  });
});
