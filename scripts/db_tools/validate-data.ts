#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci
//
// Validate Data
//
// Validates the data in MongoDB based on the validation schemas installed
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./validate-data.ts --help
// Examples:
//   Validate the local database: ./validate-data.ts
//   Validate the live database: ./validate-data.ts --server live
//   Show only the ids of documents that are invalid: ./validate-data.ts --no-errors

import Ajv from 'ajv';
import ajvBsonType from 'ajv-bsontype';
import { CollectionInfo, Db, Document, MongoClient } from 'mongodb';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { colored, colors, ConnectionSettings, databaseConfigs, useColor } from './utils';

type ProgArgs = {
  color: boolean;
  server: string;
  errors: boolean;
};

class ValidateData {
  server: string | undefined;
  connectionConfig: ConnectionSettings | undefined;
  showValidationErrors: boolean = false;

  constructor() {
    this.processArguments();
  }

  processArguments(): void {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .option('color', {
        type: 'boolean',
        default: true,
        description: 'Colourize output (turn off with --no-color)'
      })
      .option('server', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'dev',
        requiresArg: true,
        description: 'The server to connect to'
      })
      .option('errors', {
        type: 'boolean',
        default: true,
        description: 'Display validation errors (turn off with --no-errors)'
      })
      .version('0.1.0')
      .strict()
      .parseSync();

    const shouldUseColor: boolean = args.color;
    useColor(shouldUseColor);
    this.server = args.server;
    this.connectionConfig = databaseConfigs.get(this.server);
    this.showValidationErrors = args.errors;
  }

  async main() {
    if (this.connectionConfig == null) {
      throw new Error('null connection config');
    }
    process.stdout.write(`Connecting to ${this.server}...`);
    const client: MongoClient = await MongoClient.connect(this.connectionConfig.dbLocation);
    console.log(colored(colors.lightGreen, 'connected!'));
    try {
      // Setup Ajv
      const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
      ajvBsonType(ajv);

      // Connect to the database
      const db: Db = client.db();
      const collections = (await db.listCollections().toArray()) as CollectionInfo[];

      // Validate each collection we can validate
      for (const collection of collections) {
        if (collection?.options?.validator !== undefined) {
          process.stdout.write(`Validating Collection: ${collection.name}...`);

          // Retrieve all invalid documents from the collection
          const documents = (await db
            .collection(collection.name)
            .find({ $nor: [collection.options.validator] })
            .toArray()) as Document[];

          if (documents.length === 0) {
            console.log(colored(colors.lightGreen, 'passed!'));
            continue;
          } else {
            console.log(`${colored(colors.red, 'failed:')} ${documents.length} invalid documents`);
          }

          // Compile the schema
          const validate = ajv.compile(collection.options.validator.$jsonSchema);

          // Show failed document
          for (const document of documents) {
            console.log(`${colored(colors.red, `${collection.name} document failed validation:`)} ${document._id}`);
            if (this.showValidationErrors) {
              const isValid: boolean = validate(document);
              if (isValid) {
                console.log(colored(colors.red, 'Could not generate validation errors - please validate manually.'));
              } else {
                console.log(validate.errors);
              }
            }
          }
        }
      }
    } finally {
      await client.close();
    }
  }
}

const program = new ValidateData();
program.main();
