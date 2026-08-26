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
import { ConnectSession } from './connect-session';
import { resolveLogPath } from './utils/utils';

function sizeof(obj: unknown): number {
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
 * Defines some fields on the ShareDB Agent type in agent.js, used for measuring purposes.
 */
export interface AgentInternal {
  src: string | null;
  clientId: string;
  connectTime: number;
  subscribedDocs: Record<string, Record<string, unknown>>;
  subscribedQueries: Record<string, { query: unknown | undefined; streams: unknown }>;
  subscribedPresences: Record<string, unknown>;
  connectSession: ConnectSession | undefined;
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
  subscribedDocsBytes: number;
  subscribedPresencesCount: number;
  subscribedPresencesBytes: number;
  subscribedQueriesCount: number;
  subscribedQueriesBytes: number;
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

export interface FetchInfo {
  timestamp: string;
  operationId: string;
  connectionId: string | undefined;
  connectionKind: ConnectionKind;
  owner: string | undefined;
  collection: string;
  requestedIdsCount: number;
  returnedDocsCount: number;
  returnedDocsBytes: number;
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
  private inFlightFetchCount = 0;
  private pubSub: PubSub | undefined;
  private readonly heapInfoPath: string;
  private readonly heapSpaceInfoPath: string;
  private readonly connectionInfoPath: string;
  private readonly connectionCollectionInfoPath: string;
  private readonly agentInfoPath: string;
  private readonly pubSubInfoPath: string;
  private readonly fetchInfoPath: string;

  /** Singleton. */
  public static get instance(): ResourceMonitor {
    return (ResourceMonitor._instance ??= new ResourceMonitor());
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
    const minutes: number = 30;
    this.intervalMs = minutes * 60 * 1000;
  }

  /** Begin periodic recording. */
  public start(): void {
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
   *
   * agent-info.csv does cover every connection, because monitorAgent below is called from RealtimeServer.listen, which
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
    // When the agent's stream closes, stop monitoring the agent.
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
    const returnedDocsBytes = results?.reduce((sum, result) => sum + sizeof(result.data), 0) ?? 0;
    const data: FetchInfo = {
      timestamp: new Date().toISOString(),
      operationId,
      connectionId: state.connectionId,
      connectionKind: state.connectionKind,
      owner: state.owner,
      collection: state.collection,
      requestedIdsCount: state.requestedIdsCount,
      returnedDocsCount,
      returnedDocsBytes,
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
      subscribedDocsCount: Object.keys(ag.subscribedDocs).length,
      subscribedDocsBytes: sizeof(ag.subscribedDocs),
      subscribedPresencesCount: Object.keys(ag.subscribedPresences).length,
      subscribedPresencesBytes: sizeof(ag.subscribedPresences),
      subscribedQueriesCount: Object.keys(ag.subscribedQueries).length,
      subscribedQueriesBytes
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
