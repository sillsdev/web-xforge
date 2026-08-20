import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { QuestionDoc } from '../../app/core/models/question-doc';
import { MemoryOfflineStore } from '../memory-offline-store';
import { MemoryRealtimeDocAdapter } from '../memory-realtime-remote-store';
import { noopDestroyRef } from '../realtime.service';
import { provideTestRealtime } from '../test-realtime-providers';
import { TestRealtimeService } from '../test-realtime.service';
import { configureTestingModule } from '../test-utils';
import { TypeRegistry } from '../type-registry';
import { FileType } from './file-offline-data';
import { RealtimeQuery } from './realtime-query';

// These tests cover the reconciliation of offline (IndexedDB) query results with the server's
// query results, which guards against stale offline snapshots corrupting live query membership
// (SF-3893). See doc/offline-query-membership.md.
describe('RealtimeQuery', () => {
  configureTestingModule(() => ({
    providers: [provideTestRealtime(new TypeRegistry([QuestionDoc], [FileType.Audio], []))]
  }));

  // SF-3893: a question archived while the client was away must not reappear in a subscribed
  // activeOnly query when an unrelated local write (e.g. answering another question) causes the
  // query to re-run against the offline store, which still holds the stale pre-archive snapshot.
  it('should not resurrect remotely-excluded docs on unrelated local writes', fakeAsync(() => {
    const env = new TestEnvironment();
    env.addRemoteQuestion(1, false);
    env.addRemoteQuestion(2, true, 2); // archived on the server while this client was away
    env.addRemoteQuestion(3, false);
    env.addOfflineQuestion(1, false);
    env.addOfflineQuestion(2, false); // stale offline snapshot from before the archive
    env.addOfflineQuestion(3, false);
    env.subscribeQuery();
    tick();

    // The server's query results are authoritative: the archived question is excluded
    expect(env.queryDocIds()).toEqual([env.docId(1), env.docId(3)]);

    // SUT
    env.submitUnrelatedOp(1);
    tick();

    expect(env.queryDocIds()).toEqual([env.docId(1), env.docId(3)]);
  }));

  it('should keep docs the server includes when the offline snapshot wrongly excludes them', fakeAsync(() => {
    const env = new TestEnvironment();
    env.addRemoteQuestion(1, false);
    env.addRemoteQuestion(2, false, 2); // unarchived on the server while this client was away
    env.addRemoteQuestion(3, false);
    env.addOfflineQuestion(1, false);
    env.addOfflineQuestion(2, true); // stale offline snapshot from before the unarchive
    env.addOfflineQuestion(3, false);
    env.subscribeQuery();
    tick();

    expect(env.queryDocIds()).toEqual([env.docId(1), env.docId(2), env.docId(3)]);

    // SUT
    env.submitUnrelatedOp(1);
    tick();

    // Order is not guaranteed until the offline snapshot is reconciled, but membership is
    expect(env.queryDocIds().sort()).toEqual([env.docId(1), env.docId(2), env.docId(3)]);
  }));

  it('should keep locally-changed docs the server has not acknowledged yet', fakeAsync(() => {
    const env = new TestEnvironment();
    env.addRemoteQuestion(1, false);
    env.addRemoteQuestion(2, true); // the server still sees the question as archived
    env.addOfflineQuestion(1, false);
    env.addOfflineQuestion(2, false, 2); // this client has unarchived it...
    env.subscribeQuery();
    tick();
    env.simulatePendingOps(2); // ...and the op has not been acknowledged yet

    // SUT
    env.submitUnrelatedOp(1);
    tick();

    expect(env.queryDocIds()).toContain(env.docId(2));
  }));

  it('should not re-add locally-removed docs the server has not acknowledged yet', fakeAsync(() => {
    const env = new TestEnvironment();
    env.addRemoteQuestion(1, false);
    env.addRemoteQuestion(2, false); // the server still sees the question as active
    env.addOfflineQuestion(1, false);
    env.addOfflineQuestion(2, true, 2); // this client has archived it...
    env.subscribeQuery();
    tick();
    env.simulatePendingOps(2); // ...and the op has not been acknowledged yet

    // SUT
    env.submitUnrelatedOp(1);
    tick();

    expect(env.queryDocIds()).toEqual([env.docId(1)]);
  }));

  it('should reconcile the offline copy of a doc the server removed while its local data still matches', fakeAsync(() => {
    const env = new TestEnvironment();
    env.addRemoteQuestion(1, false);
    env.addRemoteQuestion(2, false);
    env.subscribeQuery();
    tick();
    expect(env.queryDocIds()).toEqual([env.docId(1), env.docId(2)]);
    const questionDoc: QuestionDoc = env.getQuestionDoc(2);
    const reconcileSpy: jasmine.Spy = spyOn(questionDoc, 'reconcileOfflineData').and.callThrough();

    // SUT
    // Archive the question on the server without the client seeing the op, then notify the query
    env.addRemoteQuestion(2, true, 2);
    env.realtimeService.updateQueryAdaptersRemote();
    tick();

    expect(env.queryDocIds()).toEqual([env.docId(1)]);
    expect(reconcileSpy).toHaveBeenCalled();
  }));
});

class TestEnvironment {
  static readonly projectId: string = 'project1';

  readonly realtimeService: TestRealtimeService = TestBed.inject(TestRealtimeService);
  query?: RealtimeQuery<QuestionDoc>;

  docId(num: number): string {
    return getQuestionDocId(TestEnvironment.projectId, `q${num}`);
  }

  addRemoteQuestion(num: number, isArchived: boolean, v: number = 1): void {
    this.realtimeService.addSnapshot<Question>(QuestionDoc.COLLECTION, {
      id: this.docId(num),
      data: this.questionData(num, isArchived),
      v: v
    });
  }

  addOfflineQuestion(num: number, isArchived: boolean, v: number = 1): void {
    const offlineStore = this.realtimeService.offlineStore as MemoryOfflineStore;
    offlineStore.addData(QuestionDoc.COLLECTION, {
      id: this.docId(num),
      v: v,
      data: this.questionData(num, isArchived),
      pendingOps: []
    } as any);
  }

  subscribeQuery(): void {
    void this.realtimeService
      .subscribeQuery<QuestionDoc>(
        QuestionDoc.COLLECTION,
        { projectRef: TestEnvironment.projectId, isArchived: false },
        noopDestroyRef
      )
      .then(query => (this.query = query));
  }

  queryDocIds(): string[] {
    return this.query!.docs.map(d => d.id);
  }

  getQuestionDoc(num: number): QuestionDoc {
    return this.realtimeService.get<QuestionDoc>(QuestionDoc.COLLECTION, this.docId(num));
  }

  simulatePendingOps(num: number): void {
    const adapter = this.getQuestionDoc(num).adapter as MemoryRealtimeDocAdapter;
    adapter.pendingOps.push({ op: [] });
  }

  submitUnrelatedOp(num: number): void {
    void this.getQuestionDoc(num).submitJson0Op(op => op.set(q => q.dateModified, new Date(2026, 0, 2).toISOString()));
  }

  private questionData(num: number, isArchived: boolean): Question {
    const date = new Date(2026, 0, 1, num).toISOString();
    return {
      dataId: `q${num}`,
      projectRef: TestEnvironment.projectId,
      ownerRef: 'user1',
      verseRef: { bookNum: 1, chapterNum: 1, verseNum: num },
      text: `Question ${num}`,
      isArchived: isArchived,
      dateCreated: date,
      dateModified: date,
      answers: []
    };
  }
}
