#!./node_modules/.bin/ts-node
//
// Import SF project from one mongodb into another
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./import-project.ts --help
// Example: ./import-project.ts --originMachine qa --destinationMachine dev --originProjectSFId 54321
//            --destinationUserSFId 12345 --newDestinationProjectPTId abc123
// This script was made to make it easier to copy data to a workstation for debugging.
// You will need to be able to connect to the origin mongodb, destination mongodb, and destination realtime server (but
// not the origin realtime server).

import { Collection, Db, MongoClient } from 'mongodb';
import { Connection, Doc } from 'sharedb/lib/client';
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConnectionSettings, fetchDoc, submitDocOp, createWS, databaseConfigs, useColor } from './utils';
import { SFProject } from '../../src/RealtimeServer/scriptureforge/models/sf-project';
import { SFProjectRole } from '../../src/RealtimeServer/scriptureforge/models/sf-project-role';
import { TextInfoPermission } from '../../src/RealtimeServer/scriptureforge/models/text-info-permission';
import { User } from '../../src/RealtimeServer/common/models/user';
import { Chapter, TextInfo } from '../../src/RealtimeServer/scriptureforge/models/text-info';

/** Specifies a specific collection in the SF MongoDB (eg 'texts') and the name of a field that can be used to lookup
 * unique records (eg '_id' or 'd') */
type DBCollection = {
  name: string;
  docIdentifyingFieldName: string;
};

type ProgArgs = {
  originMachine: string;
  destinationMachine: string;
  color: boolean;
  originProjectSFId: string;
  destinationUserSFId: string | undefined;
  newDestinationProjectPTId: string | undefined;
};

class Program {
  originMachine: string | undefined;
  destinationMachine: string | undefined;
  originConnectionConfig: ConnectionSettings | undefined;
  destinationConnectionConfig: ConnectionSettings | undefined;
  originProjectSFId: string;
  destinationUserSFId: string | undefined;
  newDestinationProjectPTId: string | undefined;

  constructor() {
    this.originProjectSFId = this.processArguments();
  }

  processArguments() {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .option('color', {
        type: 'boolean',
        default: true,
        description: 'colourize output (turn off with --no-color)'
      })
      .option('originMachine', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'live',
        requiresArg: true,
        description: 'machine to fetch mongodb data from'
      })
      .option('destinationMachine', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'dev',
        requiresArg: true,
        description: 'machine to write mongodb data to'
      })
      .option('originProjectSFId', {
        type: 'string',
        demandOption: true,
        requiresArg: true,
        description: 'project SF id in origin DB to import'
      })
      .option('destinationUserSFId', {
        type: 'string',
        requiresArg: true,
        description: 'Replace destination project userRoles with this user SF id as a project administrator'
      })
      .option('newDestinationProjectPTId', {
        type: 'string',
        requiresArg: true,
        description:
          'Set the imported destination project paratextId to this value. This will have an important impact on Synchronization and PT Registry lookups'
      })
      .strict()
      .parseSync();

    const shouldUseColor: boolean = args.color;
    useColor(shouldUseColor);
    this.originMachine = args.originMachine;
    this.destinationMachine = args.destinationMachine;
    this.originConnectionConfig = databaseConfigs.get(this.originMachine);
    this.destinationConnectionConfig = databaseConfigs.get(this.destinationMachine);
    this.destinationUserSFId = args.destinationUserSFId;
    this.newDestinationProjectPTId = args.newDestinationProjectPTId;
    return args.originProjectSFId;
  }

  async withDB(
    activity: (originConn: Connection, originDB: Db, destinationConn: Connection, destinationDB: Db) => Promise<void>
  ): Promise<void> {
    if (this.destinationConnectionConfig == null) {
      throw new Error('null destination connection config');
    }
    if (this.originConnectionConfig == null) {
      throw new Error('null origin connection config');
    }
    console.log(`Connecting to origin '${this.originMachine}'.`);
    const originWS: WebSocket = createWS(this.originConnectionConfig);
    const originConn: Connection = new Connection(originWS);
    const originClient: MongoClient = await MongoClient.connect(this.originConnectionConfig.dbLocation);
    console.log(`Connecting to destination '${this.destinationMachine}'.`);
    const destinationWS: WebSocket = createWS(this.destinationConnectionConfig);
    const destinationConn: Connection = new Connection(destinationWS);
    const destinationClient: MongoClient = await MongoClient.connect(this.destinationConnectionConfig.dbLocation);
    try {
      const originDB: Db = originClient.db();
      const destinationDB: Db = destinationClient.db();
      console.log(`Origin realtime server connection: ${originConn.state}`);
      console.log(`Destination realtime server connection: ${destinationConn.state}`);
      await activity(originConn, originDB, destinationConn, destinationDB);
    } finally {
      await originClient.close();
      originWS.close();
      await destinationClient.close();
      destinationWS.close();
    }
  }

  async main() {
    await this.withDB(async (originConn: Connection, originDB: Db, destinationConn: Connection, destinationDB: Db) => {
      const originProjectSFId: string = this.originProjectSFId;
      const originProjectsCollection: Collection<any> = originDB.collection('sf_projects');
      const destinationProjectsCollection: Collection<any> = destinationDB.collection('sf_projects');
      const originProject: any = await originProjectsCollection.findOne({ _id: originProjectSFId });
      console.log(`Fetching origin project '${originProject.name}' with SF id ${originProjectSFId}`);
      const destinationProjectSFId: string = originProject._id;

      // Write project into destination.

      await destinationProjectsCollection.replaceOne({ _id: destinationProjectSFId }, originProject, {
        upsert: true
      });

      // Write lots of collection records into destination.

      const collections: DBCollection[] = [
        { name: 'o_sf_projects', docIdentifyingFieldName: 'd' },
        { name: 'sf_project_secrets', docIdentifyingFieldName: '_id' },
        { name: 'texts', docIdentifyingFieldName: '_id' },
        { name: 'o_texts', docIdentifyingFieldName: 'd' },
        { name: 'note_threads', docIdentifyingFieldName: '_id' },
        { name: 'o_note_threads', docIdentifyingFieldName: 'd' },
        { name: 'questions', docIdentifyingFieldName: '_id' },
        { name: 'o_questions', docIdentifyingFieldName: 'd' }
      ];

      for (let collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        const originCollection: Collection<any> = originDB.collection(collectionName);
        const destinationCollection: Collection<any> = destinationDB.collection(collectionName);
        let originQuery: any = {};
        originQuery[collectionInfo.docIdentifyingFieldName] = new RegExp(`^${originProjectSFId}`);
        const originRecords: any[] = await originCollection.find(originQuery).toArray();
        if (originRecords.length < 1) {
          console.log(`There are no matching records in origin collection '${collectionName}'. Skipping.`);
          continue;
        }
        console.log(`Importing ${originRecords.length} records from origin collection '${collectionName}'.`);
        for (const item of originRecords) {
          await destinationCollection.replaceOne({ _id: item._id }, item, {
            upsert: true
          });
        }
      }

      const destinationProjectDoc: Doc = destinationConn.get('sf_projects', destinationProjectSFId);
      await fetchDoc(destinationProjectDoc);
      const destinationProject: SFProject = destinationProjectDoc.data;

      // Adjust the name of the imported project.

      const originalProjectName: string = destinationProject.name;
      const newProjectName: string = `${originalProjectName} (imported from ${this.originMachine})`;
      await submitDocOp(destinationProjectDoc, {
        p: ['name'],
        od: originalProjectName,
        oi: newProjectName
      });

      // Enable user to write to project.

      if (this.destinationUserSFId != null) {
        console.log(
          `Replacing destination project userRoles with user ${this.destinationUserSFId}. The user may need to log out to be able to see the project in their list, or rolled-back data.`
        );
        const oldUserRoles: any = destinationProject.userRoles;
        const newUserRoles: any = {};
        newUserRoles[this.destinationUserSFId] = SFProjectRole.ParatextAdministrator;
        await submitDocOp(destinationProjectDoc, {
          p: ['userRoles'],
          od: oldUserRoles,
          oi: newUserRoles
        });

        const destinationUserDoc: Doc = destinationConn.get('users', this.destinationUserSFId);
        await fetchDoc(destinationUserDoc);
        const destinationUser: User = destinationUserDoc.data;
        if (destinationUser.sites.sf.projects.includes(destinationProjectSFId)) {
          console.log(
            `User SF id ${this.destinationUserSFId} already has sites.sf.projects for imported project SF id ${destinationProjectSFId}. Not re-adding.`
          );
        } else {
          await submitDocOp(destinationUserDoc, {
            p: ['sites', 'sf', 'projects', 0],
            li: destinationProjectSFId
          });
        }

        const newPermissions: { [userRef: string]: string } = {};
        newPermissions[this.destinationUserSFId] = TextInfoPermission.Write;

        destinationProject.texts.forEach((textItem: TextInfo) => {
          textItem.permissions = newPermissions;
          textItem.chapters.forEach((chapterItem: Chapter) => (chapterItem.permissions = newPermissions));
        });
        submitDocOp(destinationProjectDoc, {
          p: ['texts'],
          od: null,
          oi: destinationProject.texts
        });
      }

      // Adjust associated project PT id.

      if (this.newDestinationProjectPTId != null) {
        const oldVal: string = destinationProject.paratextId;
        const newVal: string = this.newDestinationProjectPTId;
        console.log(`Changing destination project associated PTId from ${oldVal} to ${newVal}.`);
        await submitDocOp(destinationProjectDoc, {
          p: ['paratextId'],
          od: oldVal,
          oi: newVal
        });
      }

      console.log(`Done import operations.`);
    });
  }
}

const program = new Program();
program.main();
