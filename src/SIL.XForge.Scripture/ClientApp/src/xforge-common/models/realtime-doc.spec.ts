import { async } from '@angular/core/testing';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeDoc } from './realtime-doc';

describe('RealtimeDoc', () => {
  it('reports create events', async(() => {
    const adapter = new MemoryRealtimeDocAdapter(null, null, null);
    const realtimeDoc = new ConcreteRealtimeDoc('type', adapter, null);
    let callbackCount = 0;
    const callback = () => {
      callbackCount++;
    };
    realtimeDoc.onCreate().subscribe(callback);
    adapter.fireCreate();
    adapter.fireCreate();

    expect(callbackCount).toEqual(2);
  }));
});

class ConcreteRealtimeDoc extends RealtimeDoc {}
