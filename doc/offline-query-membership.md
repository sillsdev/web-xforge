# Offline query membership and stale snapshot reconciliation

This document explains a subtle class of bugs in the frontend realtime layer (`xforge-common`),
and how `RealtimeQuery`/`RealtimeDoc` guard against it. It exists because the complexity is easy
to lose in scattered comments; see SF-3893 for the bug that motivated it.

## Background: three copies of every doc

For each realtime doc the client can hold up to three copies:

1. **Server** (ShareDB/Mongo) — authoritative.
2. **In-memory doc** (`RealtimeDoc`/ShareDB client doc) — kept up to date by ops _only while the
   client is subscribed to the doc, or the doc is in the results of a subscribed query_.
3. **Offline store** (IndexedDB) — written by `RealtimeDoc.updateOfflineData()`, used to render
   before the server responds and to work offline.

A subscribed `RealtimeQuery` gets its membership (which docs are in the results) from two
sources:

- **Remote**: the ShareDB query subscription pushes diffs when the server's result set changes.
- **Local**: `RealtimeQuery.localQuery()` re-runs the query's Mongo-style filter against the
  offline store (via mingo). This happens on initial subscribe (offline-first render) and — via
  `RealtimeService.onLocalDocUpdate()` — on **every local submit to any doc in the collection**,
  so that local edits are reflected in query results immediately and while offline.

## The problem: snapshots nobody will ever correct

The server only pushes ops for docs the client is subscribed to (directly, or via the doc being
in a subscribed query's current results). Consequently, **a doc that changes on the server while
this client is not listening ends up with a stale offline snapshot, and no invalidation for it
will ever arrive.** Typical causes: the page was closed or reloaded between the change and the
next look, or a websocket reconnect window.

Nothing in the doc lifecycle repairs this on its own:

- `updateOfflineData()` early-returns when the adapter's version equals the version already
  stored offline — which is exactly the case when the doc was loaded _from_ the stale snapshot.
- `checkExists()` only answers "was it deleted?", which handles server-side deletions (the
  offline entry is purged) but not modifications.
- Docs are never disposed during normal navigation, so the stale entry survives indefinitely.

The failure mode (SF-3893): a checker's client had an archived question cached offline with
`isArchived: false`. The live query correctly showed the server's results — until the checker
answered a _different_ question. That local submit triggered `localQuery()`, the stale snapshot
matched the `isArchived: false` filter, and the archived question was spliced back into the live
results. The server never corrects this, because _its_ result set did not change. The same
mechanism works in the opposite direction (a doc whose stale snapshot wrongly fails the filter
vanishes from results on any unrelated local write).

Note that per-consumer defensive filtering (e.g. `.filter(q => !q.data.isArchived)` in a
component) does **not** fix this: the resurrected doc's in-memory data comes from the same stale
snapshot, so the filter passes it.

## The solution

Two cooperating mechanisms. The principle: **while the remote query subscription is live, the
server's membership is authoritative; local results may only diverge from it for docs with
pending (unacknowledged) local ops. Any other disagreement proves an offline snapshot is stale
and triggers its repair.**

### 1. Membership gate — `RealtimeQuery.reconcileWithRemote()`

When `localQuery()` runs while the remote query is live (`adapter.ready && adapter.subscribed`),
its results are merged with the server's current results. Per doc:

| server includes | offline matches filter | pending local ops | in results? | notes                                               |
| --------------- | ---------------------- | ----------------- | ----------- | --------------------------------------------------- |
| yes             | yes                    | —                 | yes         | agreement                                           |
| no              | no                     | —                 | no          | agreement                                           |
| no              | yes                    | yes               | yes         | optimistic add: client just created/changed it      |
| no              | yes                    | no                | no          | stale snapshot → reconcile (SF-3893)                |
| yes             | no                     | yes               | no          | optimistic removal: client just archived/changed it |
| yes             | no                     | no                | yes         | stale snapshot (inverse direction) → reconcile      |

- "Pending local ops" (`RealtimeDoc.hasPendingOps`) includes the in-flight op, so it is `true`
  at the moment `submit()` triggers the local re-query, before the server acknowledges.
- Paged queries (`$skip`/`$limit`): two differently-paged result sets cannot be meaningfully
  merged, so the server's page is used as-is while live.
- Row 6 appends docs out of sort order; the order self-corrects once reconciliation refreshes
  the offline snapshot.
- Before the remote query is ready (initial load, fully offline), local results are used
  unchanged — offline-first behavior is unaffected, and all offline mutations carry pending ops,
  so they survive the gate after reconnecting.

### 1b. Serialized change application — `RealtimeQuery.onChange()`

Implementing the gate surfaced a latent race: `onChange()` diffs the new result ids against the
current results and applies the diff with index-based splices, but it is async (inserting docs
awaits their offline data loading). Two overlapping invocations — e.g. a server-driven change
interleaving with a local re-query at an await point — each capture a `before` snapshot and can
splice against state the other has already changed, duplicating or misplacing docs. Changes are
now applied strictly one at a time via an internal lock. When no change is in flight, a change
still starts synchronously, preserving the previous timing in the common case.

(Implementation note: the lock is deliberately written with async/await only. ts-mockito
discovers mockable method names by scanning the class _source text_, so a call to a promise's
"then" method anywhere in the `RealtimeQuery` source would make every mocked `RealtimeQuery`
instance a thenable that never settles when awaited or passed to `Promise.resolve()` in tests.)

### 2. Snapshot repair — `RealtimeDoc.reconcileOfflineData()`

Fired for the two "stale snapshot" rows above, and also when the server removes a doc from a
subscribed query's results while the doc's local data still matches the query filter (which
proves staleness without waiting for the next local write — this repairs SF-3893-style staleness
at load time, before the user does anything). One server fetch resolves all cases:

- doc still exists → rewrite the offline snapshot (forced, since the doc may no longer be in any
  subscribed query);
- doc deleted → purge the offline entry and emit `delete$` (a generalization of `checkExists()`);
- fetch fails (offline, or the user may no longer read the doc) → leave the offline copy; the
  membership gate already excludes the doc, so nothing incorrect is shown.

Repair is self-limiting (once the snapshot agrees with the server the trigger disappears) and
concurrent triggers share one round trip.

## Known limitations

- **Initial flash**: with a stale offline store, a since-archived doc can appear briefly on load
  until the remote query becomes ready. Fixing this would mean not rendering offline results —
  a product tradeoff. Repair at least limits it to one stale session per doc.
- **Ack window**: after an op is acknowledged but before the server's query diff arrives, an
  unrelated local write can briefly drop a just-added doc; the diff restores it moments later.
- **Permission revocation**: `sharedb-access` rejects whole read requests with a 403 when any
  snapshot is unreadable, so a no-longer-readable doc looks like an error, not like "gone". Its
  offline data is _not_ purged (only logout's `deleteDB()` clears it), and project-level
  removal is handled at the application layer (components navigate away). A deliberate purge of
  unreadable docs' offline data is possible future work.
- **No offline sweep**: docs that never pass through a subscribed query again (e.g. a whole
  project the user lost access to) keep their offline entries until logout.

## Tests

- `xforge-common/models/realtime-query.spec.ts` — the decision table, including the SF-3893
  regression (resurrection on unrelated local write) and the proactive repair on remote removal.
- `xforge-common/models/realtime-doc.spec.ts` — `reconcileOfflineData()` semantics
  (update/purge/leave-on-error/deduplication).
- The memory test doubles (`memory-realtime-remote-store.ts`) model an _instantly consistent_
  server: local submits are written back to the remote store and query adapters re-query it on
  access. Without this, tests would exercise a state (acknowledged op, stale server result set)
  that the real ShareDB adapters only pass through transiently.
