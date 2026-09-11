import { appendFile, mkdir, writeFile } from 'fs/promises';
import { jsonSizeOf } from 'json-sizeof';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import ShareDB, { Agent, PubSub } from 'sharedb';
import { Connection } from 'sharedb/lib/client';
import { Duplex } from 'stream';
import v8 from 'v8';
import vm from 'vm';
import { ActivityLogger } from './activity-logger';
import { resolveLogPath } from './utils/utils';

export function sizeof(obj: unknown): number {
  if (obj == null) return 0;
  return jsonSizeOf(obj);
}

/**
 * Defines some fields on the ShareDB Connection type in connection.js, to be used for measuring purposes.
 */
export interface ConnectionInternal {
  id: string;
  collections: Record<string, Record<string, { data: any }>>;
  queries: Record<string, { results: any }>;
  _presences: Record<string, unknown>;
  _snapshotRequests: Record<string, unknown>;
  agent: Agent | null;
}

/**
 * Information about a connection for monitoring purposes
 */
export interface ConnectionInfo {
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  /**
   * The ShareDB Connection's id, which is the same value as the agent's clientId, and so the same value that the
   * activity log reports as connectionEstablished.clientId and on the op entries. ShareDB sets Connection.id from the
   * init message the server sends back, and that message carries agent.clientId, so the two always agree. This is
   * therefore the key for joining these reports to the activity log. See rts-diagnostics.md.
   */
  id: string;
  kind: ConnectionKind;
  owner: string | undefined;
  createdAt: string;
  collectionsDocsCount: number;
  collectionsDocsBytes: number;
  queriesCount: number;
  queriesBytes: number;
  presencesCount: number;
  snapshotRequestsCount: number;
}

export interface ConnectionCollectionInfo {
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  connectionId: string;
  connectionKind: ConnectionKind;
  collection: string;
  docsCount: number;
  docsBytes: number;
  largestDocId: string | undefined;
  largestDocBytes: number;
}

/**
 * Fields of a ShareDB Agent that only the measuring here reads.
 */
export interface AgentInternal extends ShareDB.Agent {
  /**
   * The id the client asked to keep, from its handshake, and the source recorded on its ops. Null until a handshake
   * supplies one, so a client connecting for the first time has none and its ops fall back to clientId.
   */
  src: string | null;
  connectTime: number;
  /**
   * The stream the agent sends over. For a frontend client this is a WebSocketJSONStream, which has a `ws` beneath it;
   * but for this server's own connections and for the dotnet process it is a plain in-process stream.
   */
  stream: Duplex & { ws?: { bufferedAmount?: number } };
}

/**
 * Information about a ShareDB Agent for monitoring purposes
 */
export interface AgentInfo {
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  src: string | null;
  clientId: string;
  connectTime: number;
  connectSessionUserId: string | undefined;
  subscribedDocsCount: number;
  /**
   * Bytes of operations sitting unread in this agent's document subscription streams. An agent holds no document
   * content, only a stream per subscribed document, and ShareDB pushes operations into those streams as they happen
   * (OpStream in op-stream.js relies on the stream's own buffer). So this is memory held for a client that is not
   * reading its subscriptions fast enough.
   *
   * outboundBufferedBytes below is the same concern one layer down, at the socket.
   */
  subscribedDocsOpsBytes: number;
  subscribedPresencesCount: number;
  subscribedPresencesBytes: number;
  subscribedQueriesCount: number;
  subscribedQueriesBytes: number;
  /**
   * Bytes written towards this agent's client that the operating system has not yet taken, so memory the server is
   * still holding on the client's behalf. Only web socket clients have this; it is undefined for the in-process
   * streams.
   */
  outboundBufferedBytes: number | undefined;
  /**
   * For in-process, this is messages queued in the agent's stream itself.
   * For a web socket client, this stays at zero.
   */
  outboundQueuedCount: number;
}

/**
 * Defines some fields on the ShareDB PubSub type in pubsub/index.js, used for measuring purposes.
 */
export interface PubSubInternal {
  nextStreamId: number;
  streamsCount: number;
  streams: Record<string, Record<string, unknown>>;
  subscribed: Record<string, true>;
}

/**
 * Information about ShareDB PubSub for monitoring purposes
 */
export interface PubSubInfo {
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  nextStreamId: number;
  streamsCount: number;
  streamsBytes: number;
  subscribedCount: number;
  subscribedBytes: number;
}

/**
 * Snapshot of measured memory usage information.
 */
interface ResourceUsageData {
  reportBatchId: string;
  triggerType: ReportTriggerType;
  /**  When measured */
  timestamp: string;
  /** NodeJS process ID */
  pid: number;
  /** How long the process has been running, in seconds. */
  runtimeS: number;
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  /** Note: This is also included in the externalBytes value. */
  arrayBuffersBytes: number;
  /** Free memory Bytes "still available to the process". This may match `free --bytes` "available". */
  availableMemoryBytes: number;
}

export interface HeapSpaceInfo {
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  pid: number;
  spaceName: string;
  spaceSizeBytes: number;
  spaceUsedSizeBytes: number;
  spaceAvailableSizeBytes: number;
  physicalSpaceSizeBytes: number;
}

export type ReportTriggerType = 'periodic' | 'signal' | 'manual';

export type ConnectionKind = 'default' | 'interop' | 'server' | 'migration' | 'unknown';

export interface ConnectionMonitorMetadata {
  kind?: ConnectionKind;
  owner?: string;
  createdAt?: string;
}

interface ConnectionMonitorState {
  kind: ConnectionKind;
  owner: string | undefined;
  createdAt: string;
}

interface FetchOperationState {
  operationId: string;
  connectionId: string | undefined;
  connectionKind: ConnectionKind;
  owner: string | undefined;
  collection: string;
  requestedIdsCount: number;
  startedAt: number;
  inFlightAtStart: number;
}

/**
 * What one read of documents returned.
 *
 * FetchInfo covers only the bulk fetches that the dotnet process makes, since those are the only ones wrapped by
 * beginFetchOperation. This covers every read of documents, whoever asked for it: a frontend client fetching or
 * subscribing to a document, a query's results, and the reads made by this server's own connections. It is recorded
 * from the 'readSnapshots' middleware, which every such read passes through.
 */
export interface SnapshotReadInfo {
  type: 'snapshotRead';
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  /** The connection that read. */
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  /** Whether the reads were of the current documents, or of an earlier version or time. */
  snapshotType: string;
  /** How many reads were made since the previous report. */
  readsCount: number;
  docsCount: number;
  docsBytes: number;
}

/**
 * What one connection caused to be loaded from one document as operations, since the last report.
 */
export interface OpsLoadedInfo {
  type: 'opsLoaded';
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  docId: string;
  opsCount: number;
  opsBytes: number;
  largestOpBytes: number;
}

/**
 * How often a connection asked for a query, by fetching one or subscribing to one, since the last report. The re-polls
 * that a subscription then causes are not included; queryPolled counts those.
 */
export interface QueryRunInfo {
  type: 'queryRun';
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  runsCount: number;
}

/**
 * How often a subscribed query was polled again, for one connection, since the last report.
 *
 * A subscription is re-polled whenever a document that might match it changes, so one subscription on a busy
 * collection can put an unbounded number of queries on the database. Those polls reach the database directly, without
 * passing through any middleware, so queryRun does not see them and this is the only count of them.
 */
export interface QueryPolledInfo {
  type: 'queryPolled';
  reportBatchId: string;
  triggerType: ReportTriggerType;
  timestamp: string;
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  /**
   * 'queryEmitter.poll' for the whole query being run again, 'queryEmitter.pollDoc' for a single document being
   * checked against it. The first is the expensive one.
   */
  pollType: string;
  pollsCount: number;
  /** How long those polls took in total, as measured by ShareDB. */
  totalMs: number;
}

/** Running totals of the polls of one connection's subscribed queries on one collection since the last report. */
interface QueryPolledTotals {
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  pollType: string;
  pollsCount: number;
  totalMs: number;
}

/** Running totals of the operations one connection has loaded from one document since the last report. */
interface OpsLoadedTotals {
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  docId: string;
  opsCount: number;
  opsBytes: number;
  largestOpBytes: number;
}

/** Running totals of the queries run for one connection on one collection since the last report. */
interface QueryRunTotals {
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  runsCount: number;
}

/** Running totals of what one connection has read in an area since the last report. */
interface SnapshotReadTotals {
  clientId: string;
  userId: string | undefined;
  isServer: boolean | undefined;
  collection: string;
  snapshotType: string;
  readsCount: number;
  docsCount: number;
  docsBytes: number;
}

/**
 * One bulk fetch made by the dotnet process: who asked for it, how long it took, and how much else was in flight.
 */
export interface FetchInfo {
  timestamp: string;
  operationId: string;
  connectionId: string | undefined;
  connectionKind: ConnectionKind;
  owner: string | undefined;
  collection: string;
  requestedIdsCount: number;
  returnedDocsCount: number;
  durationMs: number;
  inFlightAtStart: number;
  inFlightAtEnd: number;
  status: 'ok' | 'error';
}

/**
 * Monitors and reports on various memory usages. Reports on request, or optionally periodically.
 */
export class ResourceMonitor {
  private static _instance: ResourceMonitor | undefined;
  /** How often to record resource usage. */
  private intervalMs: number;
  /** Agent objects being monitored. */
  private readonly agents: Set<ShareDB.Agent> = new Set<ShareDB.Agent>();
  private readonly connections: Set<Connection> = new Set<Connection>();
  private readonly connectionStates = new Map<Connection, ConnectionMonitorState>();
  private readonly activeFetches = new Map<string, FetchOperationState>();
  /** What each connection has read since the last report, keyed by connection, collection and snapshot type. */
  private readonly snapshotReads = new Map<string, SnapshotReadTotals>();
  /** Ops loaded for each connection since the last report, keyed by connection, collection and document. */
  private readonly opsLoaded = new Map<string, OpsLoadedTotals>();
  /** Queries run for each connection since the last report, keyed by connection and collection. */
  private readonly queriesRun = new Map<string, QueryRunTotals>();
  /** Polls of subscribed queries since the last report, keyed by connection, collection and poll type. */
  private readonly queriesPolled = new Map<string, QueryPolledTotals>();
  private inFlightFetchCount = 0;
  private pubSub: PubSub | undefined;
  private readonly heapInfoPath: string;
  private readonly heapSpaceInfoPath: string;
  private readonly connectionInfoPath: string;
  private readonly connectionCollectionInfoPath: string;
  private readonly agentInfoPath: string;
  private readonly pubSubInfoPath: string;
  private readonly fetchInfoPath: string;
  private readonly resourceUsagePath: string;
  private periodicRecordingStarted = false;
  /**
   * Whether the application is listening for resource usage report requests via signaling.
   */
  private readonly reportsCanBeSignalledFor: boolean;

  /** Singleton. */
  public static get instance(): ResourceMonitor {
    return (ResourceMonitor._instance ??= new ResourceMonitor());
  }

  /**
   * Whether to accumulate what connections are causing, between reports.
   *
   * True when a report can actually be asked for: either periodic recording has been started, or SIGUSR2 has been set
   * up to produce one. Accumulating otherwise costs a walk of every operation and every document read, on every
   * connection, to fill maps that nothing will ever empty or read.
   *
   * This does not gate the reports themselves. The rest of a report is sampled when it is taken, so it costs nothing
   * in between and is always available.
   */
  public get enabled(): boolean {
    return this.periodicRecordingStarted || this.reportsCanBeSignalledFor;
  }

  private constructor() {
    const baseOutputPath: string = this.getOutputDir();
    this.heapInfoPath = path.join(baseOutputPath, 'heap-info.csv');
    this.heapSpaceInfoPath = path.join(baseOutputPath, 'heap-space-info.csv');
    this.connectionInfoPath = path.join(baseOutputPath, 'connection-info.csv');
    this.connectionCollectionInfoPath = path.join(baseOutputPath, 'connection-collection-info.csv');
    this.agentInfoPath = path.join(baseOutputPath, 'agent-info.csv');
    this.pubSubInfoPath = path.join(baseOutputPath, 'pubsub-info.csv');
    this.fetchInfoPath = path.join(baseOutputPath, 'fetch-info.csv');
    this.resourceUsagePath = path.join(baseOutputPath, 'resource-usage.jsonl');
    const minutes: number = 30;
    this.intervalMs = minutes * 60 * 1000;
    this.reportsCanBeSignalledFor = process.env['SF_SIGUSR2_ACTION'] === 'resourceUsage';
  }

  /** Begin periodic recording. */
  public start(): void {
    this.periodicRecordingStarted = true;
    setInterval(() => void this.record('periodic'), this.intervalMs);
    void this.record('periodic');
  }

  /**
   * Begins monitoring a connection, so that it is reported in connection-info.csv and connection-collection-info.csv.
   *
   * Note that this is not called for every connection, so those two files are not a
   * complete list. Only index.ts for connections made for dotnet ('interop'), and
   * RealtimeServer's constructor for defaultConnection ('default'), make connections that are included here. Connections made elsewhere, such as those
   * QuestionService and NoteThreadService make while cleaning up references, are absent from those files entirely.
   * The defaultConnection is registered only when data validation is enabled, so it is absent during a migration run.
   *
   * agent-info.csv does cover every connection (at the moment in time), because monitorAgent below is called from RealtimeServer.listen, which
   * every connection goes through. So agent-info.csv is the file to use when asking "what connections existed"; the
   * connection files answer "what were the interop and default connections holding". See rts-diagnostics.md.
   */
  public startMonitoringConnection(connection: Connection, metadata?: ConnectionMonitorMetadata): void {
    if (this.connections.has(connection)) return;
    this.connections.add(connection);
    this.connectionStates.set(connection, {
      kind: metadata?.kind ?? 'unknown',
      owner: metadata?.owner,
      createdAt: metadata?.createdAt ?? new Date().toISOString()
    });
  }

  public stopMonitoringConnection(connection: Connection): void {
    this.stopMonitoringAgentOnConnection(connection);
    this.connections.delete(connection);
    this.connectionStates.delete(connection);
  }

  /**
   * Begins monitoring an agent, so that it is reported in agent-info.csv.
   *
   * Unlike startMonitoringConnection above, this is called from RealtimeServer.listen, which every connection goes
   * through, so agent-info.csv covers them all - frontend clients, dotnet, defaultConnection and the doc services
   * alike. The exception is that listen only calls this when data validation is enabled, so agents are not monitored
   * during a migration run.
   */
  public monitorAgent(agent: ShareDB.Agent, stream: Duplex): void {
    if (this.agents.has(agent)) return;
    this.agents.add(agent);
    stream.once('end', () => this.agents.delete(agent));
    stream.once('close', () => this.agents.delete(agent));
  }

  public stopMonitoringAgentOnConnection(connection: Connection): void {
    const conn: ConnectionInternal = connection as unknown as ConnectionInternal;
    const agent: ShareDB.Agent | null = conn.agent;
    if (agent == null) return;
    this.agents.delete(agent);
  }

  public setPubSub(pubSub: PubSub): void {
    this.pubSub = pubSub;
  }

  public beginFetchOperation(
    connection: Connection | undefined,
    collection: string,
    requestedIdsCount: number
  ): string {
    const operationId = randomUUID();
    const state = connection == null ? undefined : this.connectionStates.get(connection);
    const conn = connection as unknown as ConnectionInternal | undefined;
    this.inFlightFetchCount += 1;
    this.activeFetches.set(operationId, {
      operationId,
      connectionId: conn?.id,
      connectionKind: state?.kind ?? 'unknown',
      owner: state?.owner,
      collection,
      requestedIdsCount,
      startedAt: Date.now(),
      inFlightAtStart: this.inFlightFetchCount
    });
    return operationId;
  }

  /**
   * Records what a read of documents returned. Called from the 'readSnapshots' middleware, which every read passes
   * through, so this covers the reads that beginFetchOperation does not: those made by frontend clients, those made by
   * this server's own connections, and the results of queries.
   *
   * The totals are kept in memory and written out with the next report, rather than a row being written per read.
   */
  public recordSnapshotRead(
    clientId: string,
    collection: string,
    snapshotType: string,
    snapshots: { data?: unknown }[],
    userId?: string,
    isServer?: boolean
  ): void {
    if (!this.enabled) return;
    const key = `${clientId}|${collection}|${snapshotType}`;
    let totals: SnapshotReadTotals | undefined = this.snapshotReads.get(key);
    if (totals == null) {
      totals = { clientId, userId, isServer, collection, snapshotType, readsCount: 0, docsCount: 0, docsBytes: 0 };
      this.snapshotReads.set(key, totals);
    }
    totals.readsCount += 1;
    totals.docsCount += snapshots.length;
    totals.docsBytes += snapshots.reduce((sum: number, snapshot: { data?: unknown }) => sum + sizeof(snapshot.data), 0);
  }

  /**
   * Records one operation that passed through a connection, whether it was read from the database, broadcast from
   * pubsub, or written by that connection itself. Called from the 'op' middleware, which ShareDB runs once per
   * operation, so this only counts and measures and leaves writing to the next report.
   *
   * Totals are kept per document rather than per collection, so that a connection loading a great deal from one
   * document can be told from one loading a little from many.
   *
   * Possible improvement: when an op is broadcast, ShareDB calls this once per subscribed connection, handing over a
   * shallow copy of the op each time (Agent.prototype._onOp in agent.js), so the payload is the same object on every
   * such call. sizeof walks it once per subscriber to arrive at the same number each time. A WeakMap keyed on the
   * payload would make that one walk and N-1 lookups. Check first whether a projection ever rewrites the payload in
   * place, which would leave such a memo stale.
   */
  public recordOpLoaded(
    clientId: string,
    collection: string,
    docId: string,
    op: unknown,
    userId?: string,
    isServer?: boolean
  ): void {
    if (!this.enabled) return;
    const key = `${clientId}|${collection}|${docId}`;
    let totals: OpsLoadedTotals | undefined = this.opsLoaded.get(key);
    if (totals == null) {
      totals = { clientId, userId, isServer, collection, docId, opsCount: 0, opsBytes: 0, largestOpBytes: 0 };
      this.opsLoaded.set(key, totals);
    }
    const opBytes: number = sizeof(op);
    totals.opsCount += 1;
    totals.opsBytes += opBytes;
    totals.largestOpBytes = Math.max(totals.largestOpBytes, opBytes);
  }

  /**
   * Records one query being asked for by a connection. Called from the 'query' middleware, which ShareDB triggers when
   * a query is fetched or subscribed to.
   *
   * This is not a count of database work. A subscribed query is re-polled whenever a document that might match it
   * changes, and those re-polls go straight to the database without passing through any middleware, so none of them
   * are counted here. Subscribing on a reconnect goes the other way: the middleware runs even though no query is put
   * to the database. See queryPolled for the re-polls.
   */
  public recordQueryRun(clientId: string, collection: string, userId?: string, isServer?: boolean): void {
    if (!this.enabled) return;
    const key = `${clientId}|${collection}`;
    let totals: QueryRunTotals | undefined = this.queriesRun.get(key);
    if (totals == null) {
      totals = { clientId, userId, isServer, collection, runsCount: 0 };
      this.queriesRun.set(key, totals);
    }
    totals.runsCount += 1;
  }

  /**
   * Records one poll of a subscribed query. Driven by ShareDB's 'timing' event, which is the only notice given of
   * these, since they reach the database without any middleware running.
   *
   * The connection is the one that subscribed, not whoever made the change that caused the poll.
   */
  public recordQueryPolled(
    clientId: string,
    collection: string,
    pollType: string,
    durationMs: number,
    userId?: string,
    isServer?: boolean
  ): void {
    if (!this.enabled) return;
    const key = `${clientId}|${collection}|${pollType}`;
    let totals: QueryPolledTotals | undefined = this.queriesPolled.get(key);
    if (totals == null) {
      totals = { clientId, userId, isServer, collection, pollType, pollsCount: 0, totalMs: 0 };
      this.queriesPolled.set(key, totals);
    }
    totals.pollsCount += 1;
    totals.totalMs += durationMs;
  }

  public async endFetchOperation(
    operationId: string,
    results: Array<{ data: unknown }> | undefined,
    err?: unknown
  ): Promise<void> {
    const state = this.activeFetches.get(operationId);
    if (state == null) return;
    this.activeFetches.delete(operationId);
    this.inFlightFetchCount = Math.max(0, this.inFlightFetchCount - 1);

    const returnedDocsCount = results?.length ?? 0;
    const data: FetchInfo = {
      timestamp: new Date().toISOString(),
      operationId,
      connectionId: state.connectionId,
      connectionKind: state.connectionKind,
      owner: state.owner,
      collection: state.collection,
      requestedIdsCount: state.requestedIdsCount,
      returnedDocsCount,
      durationMs: Date.now() - state.startedAt,
      inFlightAtStart: state.inFlightAtStart,
      inFlightAtEnd: this.inFlightFetchCount,
      status: err == null ? 'ok' : 'error'
    };
    await this.saveToCsv(this.fetchInfoPath, [data]);
  }

  /** Record current resource usage. */
  public async record(triggerType: ReportTriggerType = 'manual'): Promise<void> {
    const reportBatchId = randomUUID();
    await this.recordHeapUsage(reportBatchId, triggerType);
    await this.recordHeapSpaceUsage(reportBatchId, triggerType);
    await this.recordConnectionDiagnostics(reportBatchId, triggerType);
    await this.recordAgentDiagnostics(reportBatchId, triggerType);
    await this.recordPubSubDiagnostics(reportBatchId, triggerType);
    await this.recordUsageDiagnostics(reportBatchId, triggerType);
    ActivityLogger.instance.log('resourceReportGenerated', {
      reportBatchId: reportBatchId,
      triggerType: triggerType
    });
  }

  private async recordConnectionDiagnostics(reportBatchId: string, triggerType: ReportTriggerType): Promise<void> {
    const connections = Array.from(this.connections.values());
    const timestamp = new Date().toISOString();
    const report: ConnectionInfo[] = [];
    const collectionReport: ConnectionCollectionInfo[] = [];
    for (const connection of connections) {
      const state = this.connectionStates.get(connection);
      const connReport = this.reportOnConnection(connection, timestamp, reportBatchId, triggerType, state);
      report.push(connReport.info);
      collectionReport.push(...connReport.collections);
    }
    await this.saveToCsv(this.connectionInfoPath, report);
    await this.saveToCsv(this.connectionCollectionInfoPath, collectionReport);
  }

  private async recordAgentDiagnostics(reportBatchId: string, triggerType: ReportTriggerType): Promise<void> {
    const timestamp = new Date().toISOString();
    const report: AgentInfo[] = Array.from(this.agents.values()).map(agent =>
      this.reportOnAgent(agent, timestamp, reportBatchId, triggerType)
    );
    await this.saveToCsv(this.agentInfoPath, report);
  }

  private async recordPubSubDiagnostics(reportBatchId: string, triggerType: ReportTriggerType): Promise<void> {
    if (this.pubSub === undefined) return;
    const report = this.reportOnPubSub(this.pubSub, new Date().toISOString(), reportBatchId, triggerType);
    await this.saveToCsv(this.pubSubInfoPath, [report]);
  }

  /**
   * Writes out what each connection caused since the previous report - documents read, operations loaded, queries run
   * - and starts the totals again. A connection that did none of a thing contributes no line for it.
   */
  private async recordUsageDiagnostics(reportBatchId: string, triggerType: ReportTriggerType): Promise<void> {
    const timestamp: string = new Date().toISOString();
    const report: SnapshotReadInfo[] = [...this.snapshotReads.values()].map(
      (totals: SnapshotReadTotals): SnapshotReadInfo => ({
        type: 'snapshotRead',
        reportBatchId: reportBatchId,
        triggerType: triggerType,
        timestamp: timestamp,
        clientId: totals.clientId,
        userId: totals.userId,
        isServer: totals.isServer,
        collection: totals.collection,
        snapshotType: totals.snapshotType,
        readsCount: totals.readsCount,
        docsCount: totals.docsCount,
        docsBytes: totals.docsBytes
      })
    );
    this.snapshotReads.clear();

    const opsLoaded: OpsLoadedInfo[] = [...this.opsLoaded.values()].map((totals: OpsLoadedTotals): OpsLoadedInfo => ({
      type: 'opsLoaded',
      reportBatchId: reportBatchId,
      triggerType: triggerType,
      timestamp: timestamp,
      clientId: totals.clientId,
      userId: totals.userId,
      isServer: totals.isServer,
      collection: totals.collection,
      docId: totals.docId,
      opsCount: totals.opsCount,
      opsBytes: totals.opsBytes,
      largestOpBytes: totals.largestOpBytes
    }));
    this.opsLoaded.clear();

    const queriesRun: QueryRunInfo[] = [...this.queriesRun.values()].map((totals: QueryRunTotals): QueryRunInfo => ({
      type: 'queryRun',
      reportBatchId: reportBatchId,
      triggerType: triggerType,
      timestamp: timestamp,
      clientId: totals.clientId,
      userId: totals.userId,
      isServer: totals.isServer,
      collection: totals.collection,
      runsCount: totals.runsCount
    }));
    this.queriesRun.clear();

    const queriesPolled: QueryPolledInfo[] = [...this.queriesPolled.values()].map(
      (totals: QueryPolledTotals): QueryPolledInfo => ({
        type: 'queryPolled',
        reportBatchId: reportBatchId,
        triggerType: triggerType,
        timestamp: timestamp,
        clientId: totals.clientId,
        userId: totals.userId,
        isServer: totals.isServer,
        collection: totals.collection,
        pollType: totals.pollType,
        pollsCount: totals.pollsCount,
        totalMs: totals.totalMs
      })
    );
    this.queriesPolled.clear();

    await this.saveToJsonl(this.resourceUsagePath, [...report, ...opsLoaded, ...queriesRun, ...queriesPolled]);
  }

  private reportOnConnection(
    connection: Connection,
    timestamp: string,
    reportBatchId: string,
    triggerType: ReportTriggerType,
    state: ConnectionMonitorState | undefined
  ): { info: ConnectionInfo; collections: ConnectionCollectionInfo[] } {
    const conn: ConnectionInternal = connection as unknown as ConnectionInternal;
    const collectionEntries = Object.entries(conn.collections);
    const collectionDiagnostics: ConnectionCollectionInfo[] = collectionEntries.map(([collection, docs]) => {
      let largestDocId: string | undefined;
      let largestDocBytes = 0;
      const docEntries = Object.entries(docs);
      let docsBytes = 0;
      for (const [docId, doc] of docEntries) {
        // Just measure data items to avoid circular reference.
        const bytes = sizeof(doc.data);
        docsBytes += bytes;
        if (bytes > largestDocBytes) {
          largestDocBytes = bytes;
          largestDocId = docId;
        }
      }
      return {
        reportBatchId,
        triggerType,
        timestamp,
        connectionId: conn.id,
        connectionKind: state?.kind ?? 'unknown',
        collection,
        docsCount: docEntries.length,
        docsBytes,
        largestDocId,
        largestDocBytes
      };
    });

    const report: ConnectionInfo = {
      reportBatchId,
      triggerType,
      timestamp,
      id: conn.id,
      kind: state?.kind ?? 'unknown',
      owner: state?.owner,
      createdAt: state?.createdAt ?? timestamp,
      collectionsDocsCount: collectionDiagnostics.reduce((count, connCollInfo) => count + connCollInfo.docsCount, 0),
      collectionsDocsBytes: collectionDiagnostics.reduce((sum, connCollInfo) => sum + connCollInfo.docsBytes, 0),
      queriesCount: Object.keys(conn.queries).length,
      // Avoid circular reference.
      queriesBytes: Object.values(conn.queries).reduce((totalBytes, query) => totalBytes + sizeof(query.results), 0),
      presencesCount: Object.keys(conn._presences).length,
      snapshotRequestsCount: Object.keys(conn._snapshotRequests).length
    };
    return { info: report, collections: collectionDiagnostics };
  }

  private reportOnAgent(
    agent: ShareDB.Agent,
    timestamp: string,
    reportBatchId: string,
    triggerType: ReportTriggerType
  ): AgentInfo {
    const ag: AgentInternal = agent as unknown as AgentInternal;
    // QueryEmitter has a circular reference and so we can not use sizeof. Substitute in a sum of the interesting
    // field sizes.
    const subscribedQueriesBytes: number = Object.values(ag.subscribedQueries).reduce(
      (sum, queryEmitter) => sum + sizeof(queryEmitter.query) + sizeof(queryEmitter.streams),
      0
    );
    const agentInfo: AgentInfo = {
      reportBatchId,
      triggerType,
      timestamp,
      src: ag.src,
      clientId: ag.clientId,
      connectTime: ag.connectTime,
      connectSessionUserId: ag.connectSession?.userId,
      subscribedDocsCount: Object.values(ag.subscribedDocs).reduce(
        (total: number, docs: Record<string, unknown>) => total + Object.keys(docs).length,
        0
      ),
      subscribedDocsOpsBytes: sizeof(ag.subscribedDocs),
      subscribedPresencesCount: Object.keys(ag.subscribedPresences).length,
      subscribedPresencesBytes: sizeof(ag.subscribedPresences),
      subscribedQueriesCount: Object.keys(ag.subscribedQueries).length,
      subscribedQueriesBytes,
      outboundBufferedBytes: ag.stream?.ws?.bufferedAmount,
      outboundQueuedCount: ag.stream?.writableLength ?? 0
    };
    return agentInfo;
  }

  private reportOnPubSub(
    pubsub: PubSub,
    timestamp: string,
    reportBatchId: string,
    triggerType: ReportTriggerType
  ): PubSubInfo {
    const ps: PubSubInternal = pubsub as unknown as PubSubInternal;
    const pubsubInfo: PubSubInfo = {
      reportBatchId,
      triggerType,
      timestamp,
      nextStreamId: ps.nextStreamId,
      streamsCount: ps.streamsCount,
      streamsBytes: sizeof(ps.streams),
      subscribedCount: Object.keys(ps.subscribed).length,
      subscribedBytes: sizeof(ps.subscribed)
    };
    return pubsubInfo;
  }

  private async recordHeapUsage(reportBatchId: string, triggerType: ReportTriggerType): Promise<void> {
    // Measuring memory is more meaningful if garbage collection runs first. The NodeJS process must be started with
    // --expose-gc for this to work. Or we can temporarily switch it on and run gc, but with a context
    // [workaround](https://github.com/nodejs/node/issues/16595).
    v8.setFlagsFromString('--expose-gc');
    vm.runInNewContext('gc')();
    v8.setFlagsFromString('--noexpose-gc');

    const memoryUsage: NodeJS.MemoryUsage = process.memoryUsage();

    const data: ResourceUsageData = {
      reportBatchId,
      triggerType,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      runtimeS: Math.floor(process.uptime()),
      rssBytes: memoryUsage.rss,
      heapTotalBytes: memoryUsage.heapTotal,
      heapUsedBytes: memoryUsage.heapUsed,
      externalBytes: memoryUsage.external,
      arrayBuffersBytes: memoryUsage.arrayBuffers,
      availableMemoryBytes: process.availableMemory()
    };
    await this.saveToCsv(this.heapInfoPath, [data]);
  }

  private async recordHeapSpaceUsage(reportBatchId: string, triggerType: ReportTriggerType): Promise<void> {
    const timestamp = new Date().toISOString();
    const data: HeapSpaceInfo[] = v8.getHeapSpaceStatistics().map(space => ({
      reportBatchId,
      triggerType,
      timestamp,
      pid: process.pid,
      spaceName: space.space_name,
      spaceSizeBytes: space.space_size,
      spaceUsedSizeBytes: space.space_used_size,
      spaceAvailableSizeBytes: space.space_available_size,
      physicalSpaceSizeBytes: space.physical_space_size
    }));
    await this.saveToCsv(this.heapSpaceInfoPath, data);
  }

  /**
   * Appends one JSON object per line.
   */
  private async saveToJsonl<T extends object>(filePath: string, data: T[]): Promise<void> {
    if (data.length === 0) return;
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      const lines: string = data.map((item: T) => JSON.stringify(item)).join('\n');
      await appendFile(filePath, lines + '\n', { flag: 'a' });
    } catch (error) {
      console.error(`Ignoring error writing to ${filePath}:`, error);
    }
  }

  /** Write data to a CSV file. If needed, create header row from the data's objects' keys. */
  private async saveToCsv<T extends object>(filePath: string, data: T[]): Promise<void> {
    if (data.length === 0) return;
    try {
      const dirPath: string = path.dirname(filePath);
      await mkdir(dirPath, { recursive: true });

      const fieldNames: (keyof T)[] = Object.keys(data[0]) as (keyof T)[];
      const columnHeadings: string = fieldNames.join(',');
      const dataRows: string[] = data.map(item => {
        return fieldNames.map(field => item[field]).join(',');
      });

      // Create the file with headers.
      try {
        await writeFile(filePath, columnHeadings + '\n', { flag: 'wx' });
      } catch {
        // The file already exists, so we did not write headers. Or there was another problem.
      }

      // Append to an existing file.
      await appendFile(filePath, dataRows.join('\n') + '\n', { flag: 'a' });
    } catch (error) {
      console.error(`Ignoring error writing to ${filePath}:`, error);
    }
  }

  private getOutputDir(): string {
    return resolveLogPath('SF_RESOURCE_REPORTS_PATH', 'sf-resource-reports');
  }
}
