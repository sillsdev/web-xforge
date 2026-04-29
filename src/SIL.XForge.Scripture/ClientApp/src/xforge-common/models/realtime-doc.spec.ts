import { anything, instance, mock, verify, when } from 'ts-mockito';
import { MemoryOfflineStore } from '../memory-offline-store';
import { MemoryRealtimeDocAdapter } from '../memory-realtime-remote-store';
import { RealtimeService } from '../realtime.service';
import { RealtimeDoc } from './realtime-doc';

const mockedRealtimeService = mock(RealtimeService);
const mockedOfflineStore = mock(MemoryOfflineStore);

describe('RealtimeDoc', () => {
  it('deletes offline data during dispose even after onDocDisposeStarted removes the doc from realtime.service docs', async () => {
    const env = new TestEnvironment();
    when(mockedRealtimeService.offlineStore).thenReturn(instance(mockedOfflineStore));
    when(mockedRealtimeService.onDocDisposeStarted(anything())).thenCall(() => {
      docStillInCache = false;
    });
    when(mockedRealtimeService.onDocDisposeFinished(anything())).thenReturn();
    when(mockedOfflineStore.delete(anything(), anything())).thenCall(async () => {
      expect(docStillInCache).toBeFalse();
    });
    let docStillInCache: boolean = true;

    await env.doc.dispose();

    verify(mockedRealtimeService.onDocDisposeStarted(env.doc)).once();
    verify(mockedOfflineStore.delete('projects', 'doc1')).once();
    verify(mockedRealtimeService.onDocDisposeStarted(env.doc)).calledBefore(
      mockedOfflineStore.delete('projects', 'doc1')
    );
    verify(mockedRealtimeService.onDocDisposeFinished(env.doc)).once();
    expect(env.adapterDestroySpy).toHaveBeenCalledTimes(1);
  });
});

/** Concrete test-only realtime doc for exercising base class behavior. */
class TestRealtimeDoc extends RealtimeDoc {}

/** Test environment for RealtimeDoc disposal tests. */
class TestEnvironment {
  readonly realtimeService: RealtimeService;
  readonly doc: TestRealtimeDoc;
  readonly adapterDestroySpy: jasmine.Spy;

  constructor() {
    this.realtimeService = instance(mockedRealtimeService);

    const adapter = new MemoryRealtimeDocAdapter('projects', 'doc1');
    this.adapterDestroySpy = spyOn(adapter, 'destroy').and.callThrough();
    this.doc = new TestRealtimeDoc(this.realtimeService, adapter);
  }
}
