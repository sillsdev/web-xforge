import * as fs from 'fs';
import { mkdir } from 'fs/promises';
import { jsonSizeOf } from 'json-sizeof';
import * as path from 'path';
import ShareDB, { Agent, PubSub } from 'sharedb';
import { Connection } from 'sharedb/lib/client';
import { Duplex } from 'stream';
import v8 from 'v8';
import vm from 'vm';
import { ConnectSession } from './connect-session';

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
  timestamp: string;
  id: string;
  collectionsDocsCount: number;
  collectionsDocsBytes: number;
  queriesCount: number;
  queriesBytes: number;
  presencesCount: number;
  snapshotRequestsCount: number;
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
  private pubSub: PubSub | undefined;
  private readonly heapInfoPath: string;
  private readonly connectionInfoPath: string;
  private readonly agentInfoPath: string;
  private readonly pubSubInfoPath: string;
  private readonly baseOutputPath: string;

  /** Singleton. */
  public static get instance(): ResourceMonitor {
    return (ResourceMonitor._instance ??= new ResourceMonitor());
  }

  private constructor() {
    const homePath: string = process.env['HOME'] ?? process.cwd();
    const xdgDataHomeEnv: string | undefined = process.env['XDG_DATA_HOME'];
    const xdgDataHomePath: string =
      xdgDataHomeEnv != null && xdgDataHomeEnv !== '' ? xdgDataHomeEnv : path.join(homePath, '.local', 'share');
    this.baseOutputPath = process.env['SF_RESOURCE_REPORTS_PATH'] ?? path.join(xdgDataHomePath, 'sf-resource-reports');

    this.heapInfoPath = path.join(this.baseOutputPath, 'heap-info.csv');
    this.connectionInfoPath = path.join(this.baseOutputPath, 'connection-info.csv');
    this.agentInfoPath = path.join(this.baseOutputPath, 'agent-info.csv');
    this.pubSubInfoPath = path.join(this.baseOutputPath, 'pubsub-info.csv');
    const minutes: number = 30;
    this.intervalMs = minutes * 60 * 1000;
  }

  /** Begin periodic recording. */
  public start(): void {
    setInterval(() => void this.record(), this.intervalMs);
    void this.record();
  }

  public startMonitoringConnection(connection: Connection): void {
    if (this.connections.has(connection)) return;
    this.connections.add(connection);
  }

  public stopMonitoringConnection(connection: Connection): void {
    this.stopMonitoringAgentOnConnection(connection);
    this.connections.delete(connection);
  }

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

  /** Record current resource usage. */
  public async record(): Promise<void> {
    await this.prepareOutputDirectory();
    await this.recordHeapUsage();
    await this.recordConnectionDiagnostics();
    await this.recordAgentDiagnostics();
    await this.recordPubSubDiagnostics();
  }

  private async recordConnectionDiagnostics(): Promise<void> {
    const connections = Array.from(this.connections.values());
    const report: ConnectionInfo[] = connections.map((connection: Connection) => this.reportOnConnection(connection));
    await this.saveToCsv(this.connectionInfoPath, report);
  }

  private async recordAgentDiagnostics(): Promise<void> {
    const report: AgentInfo[] = Array.from(this.agents.values()).map(agent => this.reportOnAgent(agent));
    await this.saveToCsv(this.agentInfoPath, report);
  }

  private async recordPubSubDiagnostics(): Promise<void> {
    if (this.pubSub === undefined) return;
    const report = this.reportOnPubSub(this.pubSub);
    await this.saveToCsv(this.pubSubInfoPath, [report]);
  }

  private reportOnConnection(connection: Connection): ConnectionInfo {
    const conn: ConnectionInternal = connection as unknown as ConnectionInternal;
    const report: ConnectionInfo = {
      timestamp: new Date().toISOString(),
      id: conn.id,
      collectionsDocsCount: Object.values(conn.collections).reduce(
        (count, docs) => count + Object.keys(docs).length,
        0
      ),
      // Just measure data items to avoid circular reference.
      collectionsDocsBytes: Object.values(conn.collections).reduce(
        (collectionsBytes, coll) =>
          collectionsBytes + Object.values(coll).reduce((docsBytes, doc) => docsBytes + sizeof(doc.data), 0),
        0
      ),
      queriesCount: Object.keys(conn.queries).length,
      // Avoid circular reference.
      queriesBytes: Object.values(conn.queries).reduce((totalBytes, query) => totalBytes + sizeof(query.results), 0),
      presencesCount: Object.keys(conn._presences).length,
      snapshotRequestsCount: Object.keys(conn._snapshotRequests).length
    };
    return report;
  }

  private reportOnAgent(agent: ShareDB.Agent): AgentInfo {
    const ag: AgentInternal = agent as unknown as AgentInternal;
    // QueryEmitter has a circular reference and so we can not use sizeof. Substitute in a sum of the interesting
    // field sizes.
    const subscribedQueriesBytes: number = Object.values(ag.subscribedQueries).reduce(
      (sum, queryEmitter) => sum + sizeof(queryEmitter.query) + sizeof(queryEmitter.streams),
      0
    );
    const agentInfo: AgentInfo = {
      timestamp: new Date().toISOString(),
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

  private reportOnPubSub(pubsub: PubSub): PubSubInfo {
    const ps: PubSubInternal = pubsub as unknown as PubSubInternal;
    const pubsubInfo: PubSubInfo = {
      timestamp: new Date().toISOString(),
      nextStreamId: ps.nextStreamId,
      streamsCount: ps.streamsCount,
      streamsBytes: sizeof(ps.streams),
      subscribedCount: Object.keys(ps.subscribed).length,
      subscribedBytes: sizeof(ps.subscribed)
    };
    return pubsubInfo;
  }

  private async recordHeapUsage(): Promise<void> {
    // Measuring memory is more meaningful if garbage collection runs first. The NodeJS process must be started with
    // --expose-gc for this to work. Or we can temporarily switch it on and run gc, but with a context
    // [workaround](https://github.com/nodejs/node/issues/16595).
    v8.setFlagsFromString('--expose-gc');
    vm.runInNewContext('gc')();
    v8.setFlagsFromString('--noexpose-gc');

    const memoryUsage: NodeJS.MemoryUsage = process.memoryUsage();

    const data: ResourceUsageData = {
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

  /** Write data to a CSV file. If needed, create header row from the data's objects' keys. */
  private async saveToCsv<T extends object>(filePath: string, data: T[]): Promise<void> {
    if (data.length === 0) return;
    try {
      const fieldNames: (keyof T)[] = Object.keys(data[0]) as (keyof T)[];
      const columnHeadings: string = fieldNames.join(',');
      const dataRows: string[] = data.map(item => {
        return fieldNames.map(field => item[field]).join(',');
      });

      // Create the file with headers.
      try {
        await fs.promises.writeFile(filePath, columnHeadings + '\n', { flag: 'wx' });
      } catch (_error) {
        // The file already exists, so we did not write headers. Or there was another problem.
      }

      // Append to an existing file.
      await fs.promises.appendFile(filePath, dataRows.join('\n') + '\n', { flag: 'a' });
    } catch (error) {
      console.error(`Ignoring error writing to ${filePath}:`, error);
    }
  }

  private async prepareOutputDirectory(): Promise<void> {
    await mkdir(this.baseOutputPath, { recursive: true });
  }
}
