# RealtimeServer diagnostics: activity log and resource reports

_Maintenance note: This document is primarily to instruct AI when it performs log analysis. It does not need kept up to date with changes in RealtimeServer. It can easily be updated by AI when doing an analysis._

RealtimeServer is able to produce resource usage reports as well as activity logs. This document describes how to correlate the information in these reports.

The two outputs answer different halves of one question. The activity log says **what the server was doing**; the
resource reports say **what it was holding while doing it**.

## Where the files are

| Output           | Written by                                       | Default location                                                        | Override                               |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| Activity log     | `activity-logger.ts`                             | `$XDG_DATA_HOME/sf-rts-activity-log/realtimeserver-log.jsonl`           | `SF_RTS_LOG_PATH` (full file path)     |
| Resource reports | `resource-monitor.ts`                            | `$XDG_DATA_HOME/sf-resource-reports/`                                   | `SF_RESOURCE_REPORTS_PATH` (directory) |
| Event export     | `mongodb/EventMetrics/EventsInPeriod.mongodb.js` | `events_<start>_<end>.jsonl` in whatever directory mongosh was run from | `DATE_START`, `DATE_END`               |

The first two are written by the RealtimeServer as it runs. The third is not: it is exported from MongoDB afterwards.

Content in `resource-usage.jsonl` includes:

| `type`         | One line per                                    | Carries                                                                                  |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `snapshotRead` | report batch, connection, collection            | What that connection read since the previous report, with bytes.                         |
| `opsLoaded`    | report batch, connection, collection, **doc**   | `opsCount`, `opsBytes` and `largestOpBytes` for that one document.                       |
| `queryRun`     | report batch, connection, collection            | `runsCount` - how often a connection fetched or subscribed to a query. Not the re-polls. |
| `queryPolled`  | report batch, connection, collection, poll type | `pollsCount` and `totalMs` for the re-polls a subscription caused.                       |

Resource reports are written one row per subject to
each batch-scoped file, sharing a `reportBatchId`.

## Activity log

Events, grouped by what they describe:

- **Server**: `serverStarted`, `serverStopped`.
- **Connections**: `webSocketConnected`, `webSocketRejected`, `connectionEstablished`, `connectionRejected`,
  `agentDisconnected`.
- **Client requests**: `clientRequest`, one per message a client sends over the ShareDB protocol. This is how a
  frontend client's asking is recorded, the interop entries covering only the dotnet process. Its `action` is
  ShareDB's own two-letter code, from `sharedb/lib/message-actions.js`:

  | Code               | Meaning                            | Code                     | Meaning                                   |
  | ------------------ | ---------------------------------- | ------------------------ | ----------------------------------------- |
  | `hs`               | handshake                          | `op`                     | submit an operation                       |
  | `f` / `s` / `u`    | fetch / subscribe / unsubscribe    | `nf`                     | fetch a snapshot by version               |
  | `bf` / `bs` / `bu` | the same three, in bulk            | `nt`                     | fetch a snapshot by time                  |
  | `qf` / `qs` / `qu` | query fetch / subscribe / unsub    | `pp`                     | ping                                      |
  | `q`                | query update sent back to a client | `p` / `ps` / `pu` / `pr` | presence, subscribe, unsubscribe, request |

  Both `nf` and `nt` lead to the expensive rebuild that `snapshotRebuiltFromOps` reports on, but they come from
  different places, and which one appears says who asked:
  - `nt` is only ever the dotnet process. The interop connection is itself a ShareDB client sending messages over a
    stream, so asking for a snapshot by timestamp produces an `nt` as a side effect.
  - `nf` is the browser, from `previousSnapshot()` in `sharedb-realtime-remote-store.ts`, which asks for the version
    before the current one. Nothing else records it, so here the `clientRequest` line is the only evidence.

  Expect more `nt` entries than `interopFetchSnapshotByTimestamp` entries. The dotnet process can ask for several
  documents at once, and that method, `fetchSnapshotsByTimestamp`, logs only an `interopCall`; its documents produce
  an `nt` each and no detail entry. So a `snapshotRebuiltFromOps` with no `interopFetchSnapshotByTimestamp` beside it
  is either the browser or one of those bulk requests, and the `clientRequest` at the same moment says which: `nf` for
  the browser, `nt` for dotnet.

- **Ops**: `opSubmitted`, `opCommitted`, `opValidationFailed`.
- **History**: `snapshotRebuiltFromOps`, when a document is asked for at a past version or timestamp and has to be
  replayed from operations.
- **Dotnet interop**: `interopConnect`, `interopDisconnect`, `interopCall`, and one per method -
  `interopCreateDoc`, `interopFetchDoc`, `interopFetchDocs`, `interopFetchSnapshotByTimestamp`, `interopGetOps`,
  `interopSubmitOp`, `interopDeleteDoc`, `interopReplaceDoc`.
- **Migrations**: `migrationCollectionStarted`, `migrationCollectionCompleted`.
- **Diagnostics**: `resourceReportGenerated`, `resourceUsageRequested`, `heapSnapshotStarted`, `heapSnapshotCompleted`,
  `cpuProfileStarted`, `cpuProfileCompleted`.
- **The log itself**: `logEntriesDropped`, when entries had to be discarded rather than written. See below.

## Resource reports

| File                             | One row per                                    | Notes                                                                           |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `heap-info.csv`                  | report batch                                   | Process-wide rss, heapTotal, heapUsed, external, arrayBuffers.                  |
| `heap-space-info.csv`            | report batch, V8 space                         |                                                                                 |
| `connection-info.csv`            | report batch, **monitored** connection         | Not every connection - see below.                                               |
| `connection-collection-info.csv` | report batch, monitored connection, collection | Has `docsBytes` and `largestDocId`.                                             |
| `agent-info.csv`                 | report batch, agent                            | **Every** connection. Has `subscribedDocsOpsBytes` and `outboundBufferedBytes`. |
| `pubsub-info.csv`                | report batch                                   | Stream and subscription counts and bytes.                                       |
| `fetch-info.csv`                 | **fetch operation**                            | Not batch-scoped, and has no `reportBatchId`. Timing, not bytes.                |
| `resource-usage.jsonl`           | varies by record `type`                        | See above.                                                                      |

## The event export (`events_*.jsonl`)

Exported from MongoDB by `mongodb/EventMetrics/EventsInPeriod.mongodb.js`.

The lines are in time order, so the file reads as one sequence. They come from three different collections and
each line names its `source`. What follows is what a reader has to know to join them.

| `source`            | One line per              | Time         | User      | Project      |
| ------------------- | ------------------------- | ------------ | --------- | ------------ |
| `event_metrics`     | backend API call          | `timeStamp`  | `userId`  | `projectId`  |
| `translate_metrics` | editing session's metrics | `timestamp`  | `userRef` | `projectRef` |
| `sync_metrics`      | one **attempt** at a sync | `dateQueued` | `userRef` | `projectRef` |

**The field names differ by source, including the capital S in `timeStamp`.** Normalise time, user and project into
one shape before joining anything, or a query will silently match only one of the three sources.

`event_metrics` lines also carry `eventType` (such as `SyncAsync`, `UpdateSettingsAsync`, `DeleteProjectAsync`),
`scope` (`Sync`, `Settings`, `Drafting`) and `failed`. `sync_metrics` lines also carry `dateStarted`, `dateFinished`,
`status` and `changeCount`.

### Joining the events to the RealtimeServer

There is no connection id or `clientId` in the export, so the joins are on user, on project, and on time.

```
  event userId / userRef  -> activity log userId
                          -> docId of a `users` or `user_profiles` doc
                          -> the part after the colon in an `sf_project_user_configs` docId

  event projectId / projectRef -> docId of an `sf_projects` or `sf_projects_profile` doc
                               -> the part BEFORE THE FIRST COLON of a docId in
                                  `texts`, `text_documents`, `questions`, `note_threads`,
                                  `biblical_terms`, `sf_project_user_configs`
```

That prefix rule is how most RealtimeServer activity gets attributed to a project, since only a minority of documents
are the project document itself. It holds for perhaps every composite docId in the logs, so `docId.split(':')[0]` is a sound way to ask which project an entry concerned.

Since `opsLoaded` in `resource-usage.jsonl` now carries `docId`, this same prefix connects a heap reading to the
project whose documents were being loaded, which is the join that answers "which project was the server busy with when
it grew".

## The join keys

```
                    connectionEstablished.clientId
                        |         |          |
     (same id) ---------+         |          +--------- (same id)
        |                         |                          |
  ConnectionInfo.id         opSubmitted.clientId        AgentInfo.clientId
  connection-info.csv       opCommitted.clientId        agent-info.csv
                            opValidationFailed.clientId

  interopFetchDocs.operationId -> fetch-info.csv operationId
  interopFetchDocs.handle      -> connectionEstablished.interopHandle  (then clientId, as above)
  interopCall.callId           -> the same callId on the method's own interop* entry
  resourceReportGenerated.reportBatchId -> reportBatchId column in every batch-scoped CSV
  fetch-info.csv connectionId  -> connectionEstablished.clientId
  opSubmitted (srcClientId, opSeq) -> opCommitted / opValidationFailed (srcClientId, opSeq)
  snapshotRebuiltFromOps (pid, docId) -> interopFetchSnapshotByTimestamp (pid, docId)

  events_*.jsonl userId / userRef       -> activity log userId
  events_*.jsonl projectId / projectRef -> docId, or docId up to the first colon
```

`handle` and `callId` are only unique within a process. They are counters that restart at 0 when the
RealtimeServer restarts; so join on `(pid, handle)` and `(pid, callId)` rather than on the handle or callId alone. Every activity
log entry carries `pid` for this reason. The other keys - `clientId`, `operationId`, `reportBatchId` - are random ids
and need no such qualification.

To determine who asked for a fetch and what it cost:

1. Start at an `interopFetchDocs` entry. Take its `operationId`, `handle` and `pid`.
2. Look up that `operationId` in `fetch-info.csv` for `durationMs` and how many other fetches overlapped it
   (`inFlightAtStart`, `inFlightAtEnd`).
3. Find the `connectionEstablished` from the same `pid` whose `interopHandle` matches, for the `clientId` and `userId`
   behind the request.
4. Look that `clientId` up in the `snapshotRead` lines of `resource-usage.jsonl` for `docsBytes` and `docsCount`. Those are totals for everything
   the connection read between two reports rather than for the single fetch, so narrow by `collection` and pick the
   report batch covering the moment the fetch happened.
5. Compare against the heap around that moment, as described next.

### Relating activity to memory readings

This step, unlike the joins above, is temporal. A heap reading is a sample of the whole
process at one moment.

A heap reading is taken after a forced garbage collection, so `heapUsedBytes` is memory the process was actually
still holding, not garbage that had yet to be collected. A large fall is memory genuinely released, and a level that stays high is memory genuinely retained. Neither
is an artefact of when a collection happened to run.

What `reportBatchId` does is make the _sample_ unambiguous once you have chosen which one to look at. Each time a
report is taken, one random `reportBatchId` is generated and stamped on every row written across all the batch-scoped
CSVs. So the heap figures, the per-agent figures, and the per-connection figures belonging to a single moment can be
gathered exactly, instead of by matching timestamps across several CSV files. `resourceReportGenerated` carries that same id
into the activity log, which is what puts each sample onto the same timeline as the activity.

So, use timestamps to decide _which_ samples bracket the activity you care about, then use their `reportBatchId` to
pull every row belonging to those samples definitively. `fetch-info.csv` has no `reportBatchId` because a fetch is not
part of a sample - it is an event with its own start and end, which is what `operationId` identifies.

## Additional notes

- **A `logEntriesDropped` entry means the log has a hole in it.** Entries are queued and written in batches, and once
  the queue holds 10,000 new ones are discarded rather than made to wait, so a burst of activity or a slow disk loses
  entries instead of holding the server up. An entry that cannot be serialized to JSON is discarded the same way. The
  notice says how many went missing, in `droppedCount`, but not which ones or what they were about. So for the
  surrounding period, counts taken from the log are lower bounds, and an entry missing from a pair - an `opSubmitted`
  with no `opCommitted` beside it - may be a dropped entry rather than a failed op.
- **`srcClientId` is not always `clientId`.** ShareDB gives each agent a `clientId` at creation, but `agent.src` stays
  null until the client's handshake supplies an id - after the `connect` middleware has run, which is why
  `connectionEstablished` cannot report it. A first-time client supplies no id, so its ops fall back to `clientId` and
  the two agree. A browser that reconnects supplies the id from its previous session, so from then on its ops carry a
  `srcClientId` that no `connectionEstablished` entry ever reported. Join ops to connections on `clientId`, and use
  `srcClientId` only for pairing an op's submit with its commit.
- **`connection-info.csv` is not every connection.** Only connections registered by `startMonitoringConnection` appear,
  and only two callers do that: dotnet connections (`interop`) and `defaultConnection` (`default`). Connections made by
  `QuestionService` and `NoteThreadService` are absent. `agent-info.csv` covers every kind of connection, so use it
  when asking what connections existed.
- **The memory usage reports only ever see connections that were alive when a report was taken.** A report is a snapshot, so a
  connection that is made and closed between two reports appears in none of them, however much it did or held. The majority of connection will be between usage reports and not included. So
  `agent-info.csv` covering every _kind_ of connection does not mean it covers every connection. Take the list of
  connections from the activity log's `connectionEstablished` entries, and treat the reports as telling you about the
  subset that happened to be caught.
- **The `resource-usage.jsonl` totals are only accumulated when a report can be asked for.** `snapshotRead`,
  `opsLoaded`, `queryRun` and `queryPolled` are counted up between reports, and that counting is switched off unless
  `SF_SIGUSR2_ACTION` is set to `resourceUsage`, or periodic recording has been started. Accumulating otherwise would
  cost a walk of every document read and every operation on every connection, to fill maps that nothing would read.
  The rest of a report is unaffected: the heap figures and the per-agent and per-connection rows are sampled at the
  moment the report is taken, so they cost nothing in between and are always available. So a report with no
  `opsLoaded` lines is not evidence that no operations were loaded - establish whether the counting was on at all
  before reading anything into their absence.
- **`interopDisconnect` and `agentDisconnected` do not mean the same thing.** `interopDisconnect` says the dotnet
  process released its handle, which stops the connection being monitored. `agentDisconnected` says the stream itself
  closed, which is when the connection's memory can actually be released. The two counts are worth comparing: far more
  `interopDisconnect` than `agentDisconnected` entries means connections are being let go of without being closed, and
  because releasing the handle also stops the monitoring, those connections then hold memory that no report will
  attribute to them.
- **A migration run produces almost no resource reports.** Everything the monitor needs is registered only when data
  validation is enabled, which it is not during a migration. `RealtimeServer.listen` does not call `monitorAgent`, so
  `agent-info.csv` is empty; `defaultConnection` is not registered, so `connection-info.csv` has no `default` row; and
  the pubsub is never handed over, so `pubsub-info.csv` gets no row at all. The activity log still covers the
  migration, through `migrationCollectionStarted` and `migrationCollectionCompleted`.
- **`interopCall` is roughly a third of the log.** Each one is the generic timing and status record for a call whose
  details are on a separate entry with the same `callId`. `applyOp`, `isServerRunning`, `start`, `stop` and
  `fetchSnapshotsByTimestamp` log only the `interopCall`, so a `callId` appearing once rather than twice is expected,
  not a dropped entry.
- **`isServerRunning` is the dotnet process's health check**, called once a minute by a recurring job (see
  `SetPingServiceSchedule` in `RealtimeService.cs`). A regular once-a-minute heartbeat of these in the log is normal;
  a gap in them, or a slow one, is worth attention, because the dotnet side restarts the RealtimeServer when the check
  returns false.
- **The activity log records no byte sizes.** They are on the resource reports. Measuring a payload means walking it,
  which is expensive. Sizes live in the `snapshotRead` lines of `resource-usage.jsonl` (`docsBytes`, for what was
  read), `agent-info.csv`
  (`subscribedDocsOpsBytes`, for what is queued to an agent) and `connection-collection-info.csv` (`docsBytes`).
- **An agent holds no document content.** It holds a stream per subscribed document, and ShareDB pushes operations
  into those streams as they happen, so `subscribedDocsOpsBytes` is operations waiting to be read by a client that is
  not keeping up - a couple of hundred bytes when the streams are empty, and unbounded when they are not. For what
  documents cost, use `snapshotRead` (what was read) or `connection-collection-info.csv` (what a monitored connection
  holds). `outboundBufferedBytes` is the same concern one layer down, at the socket.
- **`subscribedDocsCount` counts documents, and it used to count collections.** In `agent-info.csv` and on
  `agentDisconnected` it is the number of subscribed documents, summed across collections. A report directory survives
  restarts and upgrades, so an older `agent-info.csv` can hold rows where the same column held the number of
  collections instead, which is a much smaller number for the same connection. On `agentDisconnected` the two are
  reported separately, as `subscribedDocsCount` and `subscribedCollectionsCount`.
- **Every read is measured once, in the `snapshotRead` lines of `resource-usage.jsonl`.** They are written from the
  'readSnapshots' middleware,
  which every read passes through, so it covers frontend clients, this server's own connections and the dotnet
  process alike. `fetch-info.csv` deliberately does not also report bytes, so that a fetch is not walked twice.
- **A connection with no `interopHandle`** is either `defaultConnection`, a frontend client, or one of the doc
  services' connections. `isServer` and `userId` narrow it down; `agent-info.csv` `src` being set indicates a client
  that reconnected.
- **`userId` is an empty string, not absent, when there is no user.** Server connections made without a user on whose
  behalf to act report `""`.
- **`queryRun` counts asking, not database work.** A connection fetching or subscribing to a query is counted. The
  re-polls that a subscription then causes are not: they go from ShareDB's QueryEmitter straight to the database
  without passing through middleware. Subscribing on a reconnect is counted even though no query is put to the
  database. So a low `runsCount` on a busy collection does not mean the database was left alone. `queryPolled` is
  where the re-polls are counted, from ShareDB's 'timing' event. Its `pollType` separates the whole query being run
  again (`queryEmitter.poll`) from a single document being checked against it (`queryEmitter.pollDoc`); the first is
  the expensive one, and its `clientId` is whoever subscribed, not whoever made the change that set it off.
- **A huge operation is found through `opsLoaded`, not through the activity log.** `opCommitted` says an op was
  written but not how big it was. The `opsLoaded` lines of `resource-usage.jsonl` say how much each connection was
  sent from each document, so an op rewriting a whole `sf_projects` permissions map shows there, against the connection
  that wrote it as well as against the ones it was sent to. Read `largestOpBytes` alongside `opsBytes`: the two being
  close means one enormous op, and them being far apart means a long catch-up of ordinary ones. Both cost memory, but
  they call for different explanations.
- **`opsLoaded` counts every op that passed through a connection, not just ops read from the database.** ShareDB
  sanitizes an op on three paths and the 'op' middleware runs as part of each: the catch-up sent to a client that
  subscribes at an old version (a database read), the live broadcast to everyone else subscribed (from pubsub), and a
  client's own op returning in its submit acknowledgement (no read at all). So a browser's `opsBytes` on `texts`
  includes what that browser typed. A high figure means a connection saw a lot of op traffic, which costs memory either
  way, but it is not evidence the database was read.
- **`snapshotRebuiltFromOps` is the one op loading that `opsLoaded` does not see.** Asking for a document at a past
  version or timestamp makes ShareDB replay operations onto a milestone snapshot, and it loads them straight from the
  database, deliberately skipping the 'op' middleware. The rebuilt document is measured, by `snapshotRead`, but that
  says nothing about how many operations went into it. So join `snapshotRebuiltFromOps` to the
  `interopFetchSnapshotByTimestamp` with the same `pid` and `docId` to see what a history request actually cost.
- **A `sync_metrics` line is a span, not a moment.** The file is sorted by `dateQueued`, which can be well before
  `dateStarted`, and the work happened between `dateStarted` and `dateFinished`. Use that pair as the window. An
  attempt whose `status` is `Queued` or `Cancelled` may have neither.
- **A retried sync appears as several lines sharing one `id`,** told apart by `attempt`, numbered from 1 and all
  carrying the original `dateQueued`. So `id` is not unique in this file; `(id, attempt)` is. Exporting the same
  period twice can also give different results.
- **`changeCount` does not predict how much the RealtimeServer did.** It sums the counters from every section of the
  sync, including the `paratext*` ones describing changes sent the other way, which never become ops here. Read it as
  "how big was this sync", not as "how much did this cost the RealtimeServer"; for the latter, count the activity in
  the window.
- **`event_metrics.id` and `sync_metrics.id` are different documents and do not join,** even for the same sync.
  Link a `SyncAsync` event to its sync by project, user and time instead.
- **`opCommitted` carries neither `isServer` nor `userId`, though `opSubmitted` carries both.** So a committed op does
  not say on its own whether it came from a sync or from someone typing in a browser. Join it back to its
  `opSubmitted` on `(srcClientId, opSeq)` to find that out. The same is true of `docId`: both carry it, but only
  `opSubmitted` says who was responsible.
- **`opValidationFailed.errorMessage` names the path within the document, not the value.** A rejected op is reported
  by its JSON path (`op.p`).
- **`outboundBufferedBytes` is memory held for a client that is not keeping up.** It is what has been written towards
  a web socket and not yet taken by the operating system. Nothing in ShareDB waits for a client to catch up before
  sending it more, so a slow client subscribed to a busy document makes this grow without limit. Only web socket
  clients have it; for the in-process streams it is empty and `outboundQueuedCount` is the figure to read instead.
  `pubsub-info.csv` `streamsBytes` is the same concern seen from the other end.
