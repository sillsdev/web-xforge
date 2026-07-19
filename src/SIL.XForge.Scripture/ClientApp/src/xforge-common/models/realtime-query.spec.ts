import { Subject } from 'rxjs';
import { anything, capture, instance, mock, when } from 'ts-mockito';
import { RealtimeQueryAdapter } from '../realtime-remote-store';
import { RealtimeService } from '../realtime.service';
import { DocSubscription, RealtimeDoc } from './realtime-doc';
import { RealtimeQuery } from './realtime-query';

describe('RealtimeQuery', () => {
  it('passes on caller context description', async () => {
    const env = new TestEnvironment({ queryName: 'my-context' });

    await env.query['onInsert'](0, ['q1']);

    const [, , docSubscription] = capture(env.realtimeServiceMock.get as any).last();
    expect((docSubscription as DocSubscription).callerContext).toBe('RealtimeQuery/my-context');
  });
});

/** Test environment for RealtimeQuery. */
class TestEnvironment {
  readonly realtimeServiceMock = mock(RealtimeService);
  readonly queryAdapterMock = mock<RealtimeQueryAdapter>();
  readonly query: RealtimeQuery;

  constructor({ queryName }: { queryName: string }) {
    when(this.queryAdapterMock.collection).thenReturn('questions');
    when(this.queryAdapterMock.ready$).thenReturn(new Subject<void>());
    when(this.queryAdapterMock.remoteChanges$).thenReturn(new Subject<void>());

    const doc = {
      id: 'q1',
      remoteChanges$: new Subject<void>(),
      onAddedToSubscribeQuery: async () => {},
      onRemovedFromSubscribeQuery: () => undefined
    } as unknown as RealtimeDoc;

    when(this.realtimeServiceMock.get(anything(), anything(), anything())).thenResolve(doc as any);

    this.query = new RealtimeQuery(instance(this.realtimeServiceMock), instance(this.queryAdapterMock), queryName);
  }
}
