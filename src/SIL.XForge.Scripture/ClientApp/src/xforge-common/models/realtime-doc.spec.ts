import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { QuestionDoc } from '../../app/core/models/question-doc';
import { MemoryOfflineStore } from '../memory-offline-store';
import { MemoryRealtimeDocAdapter } from '../memory-realtime-remote-store';
import { provideTestRealtime } from '../test-realtime-providers';
import { TestRealtimeService } from '../test-realtime.service';
import { configureTestingModule } from '../test-utils';
import { TypeRegistry } from '../type-registry';
import { FileType } from './file-offline-data';
import { RealtimeOfflineData } from './realtime-offline-data';

describe('RealtimeDoc', () => {
  configureTestingModule(() => ({
    providers: [provideTestRealtime(new TypeRegistry([QuestionDoc], [FileType.Audio], []))]
  }));

  describe('reconcileOfflineData', () => {
    it('should update the offline copy from the server', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addRemoteQuestion(true, 2);
      env.addOfflineQuestion(false, 1); // stale: archived on the server while this client was away
      const doc: QuestionDoc = env.getQuestionDoc();

      void doc.reconcileOfflineData();
      tick();

      const offlineData: RealtimeOfflineData | undefined = env.getOfflineData();
      expect(offlineData?.data.isArchived).toBe(true);
      expect(offlineData?.v).toBe(2);
    }));

    it('should remove the offline copy when the doc was deleted on the server', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addRemoteQuestion(false, 1);
      env.addOfflineQuestion(false, 1);
      const doc: QuestionDoc = env.getQuestionDoc();
      let deleted: boolean = false;
      doc.delete$.subscribe(() => (deleted = true));
      env.simulateDeletedOnServer(doc);

      void doc.reconcileOfflineData();
      tick();

      expect(env.getOfflineData()).toBeUndefined();
      expect(deleted).toBe(true);
    }));

    it('should leave the offline copy as-is when the fetch fails', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addRemoteQuestion(true, 2);
      env.addOfflineQuestion(false, 1);
      const doc: QuestionDoc = env.getQuestionDoc();
      spyOn(doc.adapter, 'fetch').and.returnValue(Promise.reject(new Error('offline')));

      void doc.reconcileOfflineData();
      tick();

      const offlineData: RealtimeOfflineData | undefined = env.getOfflineData();
      expect(offlineData?.data.isArchived).toBe(false);
      expect(offlineData?.v).toBe(1);
    }));

    it('should share a single fetch between concurrent calls', fakeAsync(() => {
      const env = new TestEnvironment();
      env.addRemoteQuestion(true, 2);
      env.addOfflineQuestion(false, 1);
      const doc: QuestionDoc = env.getQuestionDoc();
      const fetchSpy: jasmine.Spy = spyOn(doc.adapter, 'fetch').and.callThrough();

      void doc.reconcileOfflineData();
      void doc.reconcileOfflineData();
      tick();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }));
  });
});

class TestEnvironment {
  static readonly projectId: string = 'project1';
  static readonly questionId: string = getQuestionDocId(TestEnvironment.projectId, 'q1');

  readonly realtimeService: TestRealtimeService = TestBed.inject(TestRealtimeService);

  addRemoteQuestion(isArchived: boolean, v: number): void {
    this.realtimeService.addSnapshot<Question>(QuestionDoc.COLLECTION, {
      id: TestEnvironment.questionId,
      data: this.questionData(isArchived),
      v: v
    });
  }

  addOfflineQuestion(isArchived: boolean, v: number): void {
    const offlineStore = this.realtimeService.offlineStore as MemoryOfflineStore;
    offlineStore.addData(QuestionDoc.COLLECTION, {
      id: TestEnvironment.questionId,
      v: v,
      data: this.questionData(isArchived),
      pendingOps: []
    } as any);
  }

  getQuestionDoc(): QuestionDoc {
    return this.realtimeService.get<QuestionDoc>(QuestionDoc.COLLECTION, TestEnvironment.questionId);
  }

  getOfflineData(): RealtimeOfflineData | undefined {
    const offlineStore = this.realtimeService.offlineStore as MemoryOfflineStore;
    return offlineStore.getData<RealtimeOfflineData>(QuestionDoc.COLLECTION, TestEnvironment.questionId);
  }

  simulateDeletedOnServer(doc: QuestionDoc): void {
    const adapter = doc.adapter as MemoryRealtimeDocAdapter;
    spyOn(adapter, 'fetch').and.callFake(() => {
      adapter.data = undefined;
      adapter.type = undefined;
      return Promise.resolve();
    });
  }

  private questionData(isArchived: boolean): Question {
    const date = new Date(2026, 0, 1).toISOString();
    return {
      dataId: 'q1',
      projectRef: TestEnvironment.projectId,
      ownerRef: 'user1',
      verseRef: { bookNum: 1, chapterNum: 1, verseNum: 1 },
      text: 'Question 1',
      isArchived: isArchived,
      dateCreated: date,
      dateModified: date,
      answers: []
    };
  }
}
