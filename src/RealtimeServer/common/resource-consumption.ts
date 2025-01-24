import { Collection, Db, Document, MongoClient, MongoClientOptions, ServerApiVersion } from 'mongodb';
import ShareDB from 'sharedb';

const reportInterval = 10_000;

function average(array: number[]): number | null {
  return array.length === 0 ? null : array.reduce((sum, t) => sum + t, 0) / array.length;
}

/** Gets percentiles. The array will be mutated because it will be sorted in place */
function calculatePercentiles(
  array: number[],
  percentiles: number[]
): {
  [index: number]: number | null;
} {
  if (array.length === 0) {
    return percentiles.map(() => null);
  }
  array.sort();
  const output: { [index: number]: number } = {};
  for (const p of percentiles) {
    output[p] = array[Math.floor(array.length * p)];
  }
  return output;
}

class ResourceConsumptionMonitor {
  private agents: ShareDB.Agent[] = [];
  private dbConnectionString: string | undefined;
  private mongoResourceConsumptionReporter: MongoResourceConsumptionReporter | undefined;

  constructor() {
    setInterval(() => this.report(), reportInterval);
  }

  setDbConnectionString(dbConnectionString: string): void {
    if (this.dbConnectionString != dbConnectionString) {
      this.dbConnectionString = dbConnectionString;
      this.mongoResourceConsumptionReporter = new MongoResourceConsumptionReporter(dbConnectionString);
    }
  }

  registerAgent(agent: ShareDB.Agent): void {
    this.agents.push(agent);
  }

  private removeClosedAgents(): void {
    this.agents = this.agents.filter(agent => !agent.closed);
  }

  getReport(): object {
    const agentsCount = this.agents.length;
    let subscribedDocsCount = 0;
    let subscribedQueriesCount = 0;
    for (const agent of this.agents) {
      for (const [_collection, docsMap] of Object.entries(agent.subscribedDocs)) {
        subscribedDocsCount += Object.keys(docsMap).length;
      }
      subscribedQueriesCount += Object.keys(agent.subscribedQueries).length;
    }

    const averageConnectionDuration =
      agentsCount === 0 ? null : Date.now() - average(this.agents.map(a => a.connectTime))!;
    const now = Date.now();
    const connectionTimePercentiles = calculatePercentiles(
      this.agents.map(a => now - a.connectTime),
      [0.1, 0.5, 0.75, 0.9, 0.95, 0.99]
    );

    return {
      agentsCount,
      averageConnectionDuration,
      connectionTimePercentiles,
      subscribedDocsCount,
      subscribedQueriesCount,
      memoryUsage: process.memoryUsage()
    };
  }

  private report(): void {
    this.removeClosedAgents();
    const report = this.getReport();
    if (this.mongoResourceConsumptionReporter == null) {
      console.log('Not reporting since not connected to database');
      return;
    }

    this.mongoResourceConsumptionReporter.submitReport(report);
  }
}

class MongoResourceConsumptionReporter {
  mongoService = new MongoService(this.dbConnectionString);

  constructor(private readonly dbConnectionString: string) {
    this.mongoService.connect();
  }

  async submitReport(report: object): Promise<void> {
    const collection = this.mongoService.getCollection('resource_consumption');
    await collection.insertOne(report);
  }
}

class MongoService {
  private client: MongoClient;
  private db?: Db;
  private dbName = 'resource_consumption';

  constructor(connectionString: string) {
    const options = {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    } as MongoClientOptions;
    this.client = new MongoClient(connectionString, options);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    console.log(`Connected to database: ${this.dbName}`);
  }

  getCollection<T extends Document>(collectionName: string): Collection<T> {
    if (this.db == null) throw new Error('Database not connected');
    return this.db.collection<T>(collectionName);
  }

  async disconnect(): Promise<void> {
    if (this.db != null) {
      await this.client.close();
      this.db = undefined;
      console.log(`Disconnected from database: ${this.dbName}`);
    } else {
      console.log('Not disconnecting since not connected to database.');
    }
  }
}

export const GlobalResourceConsumptionMonitor = new ResourceConsumptionMonitor();
