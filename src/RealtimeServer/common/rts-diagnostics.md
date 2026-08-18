# RealtimeServer diagnostics: activity log and resource reports

RealtimeServer is able to produce resource usage reports as well as activity logs. This document describes how to correlate the information in these reports.

The two outputs answer different halves of one question. The activity log says **what the server was doing**; the
resource reports say **what it was holding while doing it**.

## Where the files are

| Output           | Written by            | Default location                                              | Override                               |
| ---------------- | --------------------- | ------------------------------------------------------------- | -------------------------------------- |
| Activity log     | `activity-logger.ts`  | `$XDG_DATA_HOME/sf-rts-activity-log/realtimeserver-log.jsonl` | `SF_RTS_LOG_PATH` (full file path)     |
| Resource reports | `resource-monitor.ts` | `$XDG_DATA_HOME/sf-resource-reports/*.csv`                    | `SF_RESOURCE_REPORTS_PATH` (directory) |

Resource reports are written one row per subject to
each batch-scoped file, sharing a `reportBatchId`.

## Activity log

Events, grouped by what they describe:

- **Server**: `serverStarted`, `serverStopped`.
- **Connections**: `webSocketConnected`, `webSocketRejected`, `connectionEstablished`, `connectionRejected`,
  `agentDisconnected`.
- **Ops**: `opSubmitted`, `opCommitted`, `opValidationFailed`.
- **Dotnet interop**: `interopConnect`, `interopDisconnect`, `interopCall`, and one per method -
  `interopCreateDoc`, `interopFetchDoc`, `interopFetchDocs`, `interopFetchSnapshotByTimestamp`, `interopGetOps`,
  `interopSubmitOp`, `interopDeleteDoc`, `interopReplaceDoc`.
- **Migrations**: `migrationCollectionStarted`, `migrationCollectionCompleted`.
- **Diagnostics**: `resourceReportGenerated`, `resourceUsageRequested`, `heapSnapshotStarted`, `heapSnapshotCompleted`,
  `cpuProfileStarted`, `cpuProfileCompleted`.

## Resource reports

| File                             | One row per                                    | Notes                                                                  |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `heap-info.csv`                  | report batch                                   | Process-wide rss, heapTotal, heapUsed, external, arrayBuffers.         |
| `heap-space-info.csv`            | report batch, V8 space                         |                                                                        |
| `connection-info.csv`            | report batch, **monitored** connection         | Not every connection - see below.                                      |
| `connection-collection-info.csv` | report batch, monitored connection, collection | Has `docsBytes` and `largestDocId`.                                    |
| `agent-info.csv`                 | report batch, agent                            | **Every** connection. Has `subscribedDocsBytes`.                       |
| `pubsub-info.csv`                | report batch                                   | Stream and subscription counts and bytes.                              |
| `fetch-info.csv`                 | **fetch operation**                            | Not batch-scoped, and has no `reportBatchId`. Has `returnedDocsBytes`. |

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
```

`handle` and `callId` are only unique within a process. They are counters that restart at 0 when the
RealtimeServer restarts; so join on `(pid, handle)` and `(pid, callId)` rather than on the handle or callId alone. Every activity
log entry carries `pid` for this reason. The other keys - `clientId`, `operationId`, `reportBatchId` - are random ids
and need no such qualification.

To determine who asked for a fetch and what it cost:

1. Start at an `interopFetchDocs` entry. Take its `operationId`, `handle` and `pid`.
2. Look up that `operationId` in `fetch-info.csv` for `returnedDocsBytes`, `durationMs`, and how many other fetches
   overlapped it (`inFlightAtStart`, `inFlightAtEnd`).
3. Find the `connectionEstablished` from the same `pid` whose `interopHandle` matches, for the `clientId` and `userId`
   behind the request.
4. Compare against the heap around that moment, as described next.

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
- **`interopDisconnect` and `agentDisconnected` do not mean the same thing.** `interopDisconnect` says the dotnet
  process released its handle, which stops the connection being monitored. `agentDisconnected` says the stream itself
  closed, which is when the connection's memory can actually be released. The two counts are worth comparing: far more
  `interopDisconnect` than `agentDisconnected` entries means connections are being let go of without being closed, and
  because releasing the handle also stops the monitoring, those connections then hold memory that no report will
  attribute to them.
- **Agents are not monitored during migrations.** `RealtimeServer.listen` only calls `monitorAgent` when data
  validation is enabled, which it is not during a migration run.
- **`interopCall` is roughly a third of the log.** Each one is the generic timing and status record for a call whose
  details are on a separate entry with the same `callId`. `applyOp`, `isServerRunning`, `start`, `stop` and
  `fetchSnapshotsByTimestamp` log only the `interopCall`, so a `callId` appearing once rather than twice is expected,
  not a dropped entry.
- **`isServerRunning` is the dotnet process's health check**, called once a minute by a recurring job (see
  `SetPingServiceSchedule` in `RealtimeService.cs`). A regular once-a-minute heartbeat of these in the log is normal;
  a gap in them, or a slow one, is worth attention, because the dotnet side restarts the RealtimeServer when the check
  returns false.
- **The activity log records no byte sizes.** They are on the resource reports. Measuring a
  payload is expensive. Sizes live in `fetch-info.csv`
  (`returnedDocsBytes`), `agent-info.csv` (`subscribedDocsBytes`) and `connection-collection-info.csv` (`docsBytes`).
- **A connection with no `interopHandle`** is either `defaultConnection`, a frontend client, or one of the doc
  services' connections. `isServer` and `userId` narrow it down; `agent-info.csv` `src` being set indicates a client
  that reconnected.
