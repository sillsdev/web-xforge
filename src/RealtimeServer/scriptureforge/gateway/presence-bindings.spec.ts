import { PresenceBindingOwner, PresenceIdBindings } from './presence-bindings';

describe('PresenceIdBindings', () => {
  it('never drops a binding while its connection is open, and refuses new ones when the table is full of them', () => {
    const env = new TestEnvironment({ maxBindings: 2 });
    const alice = new PresenceBindingOwner('alice');
    const bob = new PresenceBindingOwner('bob');
    expect(env.bindings.bind('p1', 'srcA', alice)).toEqual('bound');
    expect(env.bindings.bind('p2', 'srcA', alice)).toEqual('bound');

    // SUT
    const third = env.bindings.bind('p3', 'srcB', bob);
    // Using a binding over and over does not change that.
    const again = env.bindings.bind('p1', 'srcA', alice);

    expect(third).toEqual('full');
    expect(again).toEqual('already-bound');
    expect(env.bindings.bind('p1', 'srcB', bob)).toEqual('taken');
    expect(env.bindings.isBoundTo('p1', 'srcA')).toBe(true);
    expect(env.bindings.isBoundTo('p2', 'srcA')).toBe(true);
  });

  it('releases the bindings of a closed connection, keeps them from other srcs for a while, then lets them go', () => {
    const env = new TestEnvironment({ maxBindings: 2, releasedGraceMs: 1000 });
    const first = new PresenceBindingOwner('alice');
    env.bindings.bind('p1', 'srcA', first);

    // SUT
    env.bindings.release(first);

    expect(first.ids.size).toEqual(0);
    expect(env.bindings.bind('p1', 'srcB', new PresenceBindingOwner('bob'))).toEqual('taken');
    // The client reconnects with the same src, and its new connection takes the binding over.
    const reconnected = new PresenceBindingOwner('alice');
    expect(env.bindings.bind('p1', 'srcA', reconnected)).toEqual('already-bound');
    expect(reconnected.ids).toEqual(new Set(['p1']));
    env.bindings.release(reconnected);
    env.time += 1000;
    expect(env.bindings.bind('p1', 'srcB', new PresenceBindingOwner('bob'))).toEqual('bound');
  });

  it('drops released bindings, oldest first, to make room', () => {
    const env = new TestEnvironment({ maxBindings: 2 });
    const closed = new PresenceBindingOwner('alice');
    env.bindings.bind('p1', 'srcA', closed);
    env.bindings.bind('p2', 'srcA', closed);
    env.bindings.release(closed);

    // SUT
    const bound = env.bindings.bind('p3', 'srcB', new PresenceBindingOwner('bob'));

    expect(bound).toEqual('bound');
    expect(env.bindings.size).toEqual(2);
    expect(env.bindings.isBoundTo('p1', 'srcA')).toBe(false);
    expect(env.bindings.isBoundTo('p2', 'srcA')).toBe(true);
  });

  it("limits how many bindings one user's open connections hold together", () => {
    const env = new TestEnvironment({ maxBindingsPerUser: 2 });
    const tab1 = new PresenceBindingOwner('alice');
    const tab2 = new PresenceBindingOwner('alice');
    env.bindings.bind('p1', 'srcA', tab1);
    env.bindings.bind('p2', 'srcB', tab2);

    // SUT
    const third = env.bindings.bind('p3', 'srcB', tab2);
    const otherUser = env.bindings.bind('p3', 'srcC', new PresenceBindingOwner('bob'));

    expect(third).toEqual('full');
    expect(otherUser).toEqual('bound');
    env.bindings.release(tab1);
    expect(env.bindings.bind('p4', 'srcB', tab2)).toEqual('bound');
  });
});

class TestEnvironment {
  time: number = 1_000_000;
  readonly bindings: PresenceIdBindings;

  constructor(options: { maxBindings?: number; maxBindingsPerUser?: number; releasedGraceMs?: number }) {
    this.bindings = new PresenceIdBindings({ ...options, now: () => this.time });
  }
}
