import fs from 'fs';
import { MongoClient } from 'mongodb';
import ShareDB from 'sharedb';
import ShareDBMongo from 'sharedb-mongo';
import '../common/diagnostics';
import { ExceptionReporter } from '../common/exception-reporter';
import { MetadataDB } from '../common/metadata-db';
import { SchemaVersionRepository } from '../common/schema-version-repository';
import SFRealtimeServer from './realtime-server';

console.log(`Migrator has been invoked with ${JSON.stringify(process.argv.slice(2))}`);

if (process.argv.length !== 4) {
  console.error('Usage: node migrator.js <release stage> <version>');
  process.exit(1);
}
const stage = process.argv[2];
const version = process.argv[3];

// QA uses version numbers of the form 123, while live uses version numbers of the form 1.2.3
if (/\d+(?:\.\d+)*/.test(version) === false) {
  console.error('Version must contain one or more numbers separated by dots');
  process.exit(1);
}

const baseSettings = JSON.parse(fs.readFileSync('appsettings.json', 'utf8'));
const settingsFile = stage === 'Production' ? 'appsettings.json' : `appsettings.${stage}.json`;
const stageSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

const bugsnagApiKey = process.env.Bugsnag__ApiKey ?? stageSettings.Bugsnag.ApiKey ?? baseSettings.Bugsnag.ApiKey;
const bugsnagReleaseStage =
  process.env.Bugsnag__ReleaseStage ?? stageSettings.Bugsnag.ReleaseStage ?? baseSettings.Bugsnag.ReleaseStage;
const dataAccessConnectionString =
  process.env.DataAccess__ConnectionString ??
  stageSettings.DataAccess.ConnectionString ??
  baseSettings.DataAccess.ConnectionString;
const siteId = process.env.Site__Id ?? stageSettings.Site.Id ?? baseSettings.Site.Id;

const exceptionReporter = new ExceptionReporter(bugsnagApiKey, bugsnagReleaseStage, version);
function reportError(...args: unknown[]): void {
  console.error('Error from ShareDB server: ', ...args);
  exceptionReporter.report(args.toString());
}

// ShareDB sometimes reports errors as warnings
ShareDB.logger.setMethods({ warn: reportError, error: reportError });

async function runMigrations() {
  const DBType = MetadataDB(ShareDBMongo);
  let server: SFRealtimeServer | undefined;

  try {
    const client = await MongoClient.connect(`${dataAccessConnectionString}/xforge`);
    const db = client.db();
    server = new SFRealtimeServer(
      siteId,
      false,
      true,
      new DBType(callback => callback(null, client)),
      new SchemaVersionRepository(db)
    );
    await server.createIndexes(db);
    await server.addValidationSchema(db);
    await server.migrateIfNecessary();
  } finally {
    // The server closes the MongoDB client
    server?.close();
  }
}

void runMigrations();
