import { Db } from 'mongodb';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { Doc, Op } from 'sharedb/lib/client';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivityLogger } from './activity-logger';
import { ConnectSession } from './connect-session';
import { MetadataDB } from './metadata-db';
import { Migration } from './migration';
import { Project } from './models/project';
import { User, USERS_COLLECTION } from './models/user';
import { createTestUser } from './models/user-test-data';
import { identifiersInClientRequest, RealtimeServer, submitMigrationOp } from './realtime-server';
import { ConnectionInternal, ResourceMonitor, sizeof } from './resource-monitor';
import { SchemaVersionRepository } from './schema-version-repository';
import { ProjectService } from './services/project-service';
import { UserService } from './services/user-service';
import { Json0OpBuilder } from './utils/json0-op-builder';
import { createFetchQuery, docFetch, docSubmitOp } from './utils/sharedb-utils';
import {
  allowAll,
  clientConnect,
  createDoc,
  fetchDoc,
  flushPromises,
  submitJson0Op,
  submitOp
} from './utils/test-utils';

const PROJECTS_COLLECTION = 'projects';

/** An ActivityLogger.log call captured by TestEnvironment.captureActivityLog. */
interface LoggedActivity {
  event: string;
  details: Record<string, unknown>;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RealtimeServer', () => {
  it('migrates docs when schema version does not exist', async () => {
    const env = new TestEnvironment(false, true);
    await env.createData();
    when(env.mockedUserService.schemaVersion).thenReturn(1);
    const mockedMigration = mock<Migration>();
    when(env.mockedUserService.getMigration(1)).thenReturn(instance(mockedMigration));
    when(mockedMigration.migrateDoc(anything())).thenCall((doc: Doc) =>
      submitMigrationOp(1, doc, [{ p: ['test'], oi: 'test_op' }])
    );

    await env.server.migrateIfNecessary();

    verify(mockedMigration.migrateDoc(anything())).once();
    verify(env.mockedSchemaVersionRepository.set(USERS_COLLECTION, 1)).once();
    const ops = env.db.ops[USERS_COLLECTION]['user01'];
    expect(ops[1].m.migration).toEqual(1);
  });

  it('migrates docs when schema version exists', async () => {
    const env = new TestEnvironment(false, true);
    await env.createData();
    when(env.mockedProjectService.schemaVersion).thenReturn(2);
    const mockedMigration = mock<Migration>();
    when(env.mockedProjectService.getMigration(2)).thenReturn(instance(mockedMigration));
    when(mockedMigration.migrateDoc(anything())).thenCall((doc: Doc) =>
      submitMigrationOp(2, doc, [{ p: ['test'], oi: 'test_op' }])
    );

    await env.server.migrateIfNecessary();

    verify(mockedMigration.migrateDoc(anything())).once();
    verify(env.mockedSchemaVersionRepository.set(PROJECTS_COLLECTION, 2)).once();
    const ops = env.db.ops[PROJECTS_COLLECTION]['project01'];
    expect(ops[1].m.migration).toEqual(2);
  });

  it('does not migrate docs when migrations are disabled', async () => {
    const env = new TestEnvironment(true);
    await env.createData();
    when(env.mockedProjectService.schemaVersion).thenReturn(2);
    const mockedMigration = mock<Migration>();
    when(env.mockedProjectService.getMigration(2)).thenReturn(instance(mockedMigration));
    when(mockedMigration.migrateDoc(anything())).thenCall((doc: Doc) => submitMigrationOp(2, doc, []));

    await env.server.migrateIfNecessary();

    verify(mockedMigration.migrateDoc(anything())).never();
    verify(env.mockedSchemaVersionRepository.set(PROJECTS_COLLECTION, 2)).never();
    const ops = env.db.ops[PROJECTS_COLLECTION]['project01'];
    expect(ops[1]).toBeUndefined();
  });

  it('does not migrate empty ops', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const userConn = clientConnect(env.server, 'user01');
    const userDoc = await fetchDoc(userConn, USERS_COLLECTION, 'user01');
    await env.migrateDoc(USERS_COLLECTION, 'user01', 1, []);
    const mockedMigration = mock<Migration>();
    when(env.mockedUserService.getMigration(1)).thenReturn(instance(mockedMigration));

    await docSubmitOp(userDoc, []);

    verify(mockedMigration.migrateOp(anything())).never();
    const ops = env.db.ops[USERS_COLLECTION]['user01'];
    expect(ops.length).toEqual(2);
  });

  it('migrates op', async () => {
    const env = new TestEnvironment(false, true);
    await env.createData();
    const userConn = clientConnect(env.server, 'user01');
    const userDoc = await fetchDoc(userConn, USERS_COLLECTION, 'user01');
    await env.migrateDoc(USERS_COLLECTION, 'user01', 1, [{ p: ['test'], oi: 'test_op' }]);
    const mockedMigration = mock<Migration>();
    when(env.mockedUserService.getMigration(1)).thenReturn(instance(mockedMigration));

    await docSubmitOp(userDoc, []);

    verify(mockedMigration.migrateOp(anything())).once();
    const ops = env.db.ops[USERS_COLLECTION]['user01'];
    expect(ops.length).toEqual(3);
  });

  it('gets correct project', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent?.connectSession as ConnectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', []);
    expect(session!.userId).toEqual('user01');
    const project = await env.server.getProject('project01');
    expect(project?.name).toEqual('Project 01');
  });

  it('gets correct project when new project added', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession | undefined;
    env.server.use('submit', (context, callback) => {
      session = context.agent?.connectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user01');
    await env.createDoc<Project>(PROJECTS_COLLECTION, 'project02', {
      name: 'Project 02',
      userRoles: {
        user01: 'user'
      },
      rolePermissions: {},
      userPermissions: {}
    });
    await submitOp(userConn, PROJECTS_COLLECTION, 'project02', []);
    expect(session!.userId).toEqual('user01');
    const project = await env.server.getProject('project02');
    expect(project?.name).toEqual('Project 02');
  });

  it('data validation allows key value pairs', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['userPermissions', 'abc123'],
        oi: 'admin'
      }
    ]);
  });

  it('data validation stops invalid key value pairs', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['userPermissions', 'USER01'],
          oi: 'admin'
        }
      ])
    ).rejects.toThrow('Invalid path for operation');
  });

  it('data validation stops invalid ops', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: ['this_property_does_not_exist'],
          oi: 'invalid data'
        }
      ])
    ).rejects.toThrow('Invalid path for operation');
  });

  it('data validation stops ops that have invalid paths', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: [0],
          oi: 'invalid data'
        }
      ])
    ).rejects.toThrow('Invalid path for operation');
  });

  it('reports the path of an op it rejects, and not what the op was writing', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const userConn = clientConnect(env.server, 'user01');
    const payload = 'a value from the user document';
    // SUT
    const submitting: Promise<void> = submitOp(userConn, USERS_COLLECTION, 'user01', [{ p: [0], oi: payload }]);
    await expect(submitting).rejects.toThrow('Invalid path for operation');
    await expect(submitting).rejects.not.toThrow(payload);
  });

  it('data validation allows valid boolean values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['isDisplayNameConfirmed'],
        oi: true
      }
    ]);
  });

  it('data validation blocks invalid boolean values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: ['isDisplayNameConfirmed'],
          oi: 'true'
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows valid null values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['_type'],
        oi: null
      }
    ]);
  });

  it('data validation allows valid number values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['_v'],
        oi: 1
      }
    ]);
  });

  it('data validation blocks invalid number values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: ['_v'],
          oi: '1'
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows string values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['displayName'],
        oi: 'string value'
      }
    ]);
  });

  it('data validation blocks invalid string values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: ['displayName'],
          oi: 1
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows string values matching a pattern', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['_id'],
        oi: 'abc123'
      }
    ]);
  });

  it('data validation blocks string values not matching a pattern', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: ['_id'],
          oi: 'INVALID_ID'
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows string values matching an enum', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['enumExample'],
        oi: 'first'
      }
    ]);
  });

  it('data validation blocks string values not matching an enum', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['enumExample'],
          oi: 'third'
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows adding of items to arrays', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['sites', 'sf', 'projects', 0],
        li: 'project02'
      }
    ]);
  });

  it('data validation blocks adding of items with invalid values to arrays', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, USERS_COLLECTION, 'user01', [
        {
          p: ['sites', 'sf', 'projects', 0],
          li: 1
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows replacing arrays', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['sites', 'sf', 'projects'],
        oi: ['project02', 'project02']
      }
    ]);
  });

  it('data validation allows adding of objects', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['objectExample'],
        oi: {
          aNumber: 1,
          aBool: true
        }
      }
    ]);
  });

  it('data validation blocks adding of objects with invalid values', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['objectExample'],
          oi: {
            aNumber: 1,
            aBool: 'invalid_value'
          }
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation blocks adding of objects with invalid properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await expect(
      submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['objectExample'],
          oi: {
            aNumber: 1,
            invalidProperty: 'invalid_value'
          }
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation blocks adding of objects with invalid properties to key value pairs', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['kvpExample'],
        oi: { test01: { aNumber: 1 } }
      }
    ]);

    // SUT
    await expect(
      submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['kvpExample', 'test01'],
          oi: {
            aNumber: 1,
            invalidProperty: 'invalid_value'
          }
        }
      ])
    ).rejects.toThrow('Invalid operation data');
  });

  it('data validation allows number operations', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['numberExample'],
        oi: 1
      }
    ]);

    // SUT
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['numberExample'],
        na: 1
      }
    ]);
  });

  it('data validation allows operations on property with no data validation configured', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
      {
        p: ['noDataValidationExample'],
        oi: 'test data'
      }
    ]);
  });

  it('disabling data validation does not stop invalid ops', async () => {
    const env = new TestEnvironment(false, true);
    await env.createData();

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['this_property_does_not_exist'],
        oi: 'invalid data'
      }
    ]);
  });

  it('connection from the backend server does not validate data', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = env.server.connectAsServer('user01');
    await submitOp(userConn, USERS_COLLECTION, 'user01', [
      {
        p: ['this_property_does_not_exist'],
        oi: 'invalid data'
      }
    ]);
  });

  it('validation schemas are loaded for every doc service', async () => {
    const env = new TestEnvironment();
    await env.server.addValidationSchema(env.mongo);
    verify(env.mockedProjectService.addValidationSchema(env.mongo)).once();
    verify(env.mockedUserService.addValidationSchema(env.mongo)).once();
  });

  it('indexes are created for every doc service', async () => {
    const env = new TestEnvironment();
    await env.server.createIndexes(env.mongo);
    verify(env.mockedSchemaVersionRepository.createIndex()).once();
    verify(env.mockedProjectService.createIndexes(env.mongo)).once();
    verify(env.mockedUserService.createIndexes(env.mongo)).once();
  });

  describe('activity logging', () => {
    it('reports the interop handle that a connection was made for', () => {
      const env = new TestEnvironment();
      const logged: LoggedActivity[] = env.captureActivityLog();
      // SUT
      env.server.connectAsServer('user01', 7);
      const entry: LoggedActivity | undefined = logged.find(item => item.event === 'connectionEstablished');
      expect(entry!.details['interopHandle']).toBe(7);
    });

    it('identifies an op the same way when it is submitted and when it is committed', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['userPermissions', 'abc123'],
          oi: 'admin'
        }
      ]);
      const connectionId: string = (userConn as unknown as ConnectionInternal).id;
      const submitted: LoggedActivity | undefined = logged.find(item => item.event === 'opSubmitted');
      const committed: LoggedActivity | undefined = logged.find(item => item.event === 'opCommitted');
      expect(submitted!.details['srcClientId']).toBe(connectionId);
      expect(typeof submitted!.details['opSeq']).toBe('number');
      expect(committed!.details['srcClientId']).toBe(submitted!.details['srcClientId']);
      expect(committed!.details['opSeq']).toBe(submitted!.details['opSeq']);
    });

    it('reports which connection submitted an op, so that ops join to connectionEstablished', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['userPermissions', 'abc123'],
          oi: 'admin'
        }
      ]);
      // srcClientId cannot be relied on for this: it is the op's source, which for a client that reconnected is the
      // id from its previous session rather than the id this connection was logged as.
      const established: LoggedActivity | undefined = logged.find(item => item.event === 'connectionEstablished');
      const submitted: LoggedActivity | undefined = logged.find(item => item.event === 'opSubmitted');
      expect(submitted!.details['clientId']).toBe(established!.details['clientId']);
    });

    it('reports the version an op was submitted against, and the version it committed as', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['userPermissions', 'abc123'],
          oi: 'admin'
        }
      ]);
      const submitted: LoggedActivity | undefined = logged.find(item => item.event === 'opSubmitted');
      const committed: LoggedActivity | undefined = logged.find(item => item.event === 'opCommitted');
      expect(committed!.details['version']).toBe((submitted!.details['version'] as number) + 1);
    });

    it('identifies an op that fails validation', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await expect(
        submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
          {
            p: ['this_property_does_not_exist'],
            oi: 'invalid data'
          }
        ])
      ).rejects.toThrow();
      const connectionId: string = (userConn as unknown as ConnectionInternal).id;
      const failed: LoggedActivity | undefined = logged.find(item => item.event === 'opValidationFailed');
      expect(failed!.details['srcClientId']).toBe(connectionId);
      expect(typeof failed!.details['opSeq']).toBe('number');
    });

    it('reports the op source for a collection that does not record it on the op', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // Only text collections keep the source in op metadata, but the source describes where any op came from. A
      // Paratext sync attributes its note thread and biblical term ops this way, and those are worth attributing
      // because a sync creates them in bulk.
      await submitOp(
        userConn,
        PROJECTS_COLLECTION,
        'project01',
        [
          {
            p: ['userPermissions', 'abc123'],
            oi: 'admin'
          }
        ],
        'someSource'
      );
      const committed: LoggedActivity | undefined = logged.find(item => item.event === 'opCommitted');
      expect(committed!.details['source']).toBe('someSource');
    });

    it('does not report an op source when none was submitted', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [
        {
          p: ['userPermissions', 'abc123'],
          oi: 'admin'
        }
      ]);
      const committed: LoggedActivity | undefined = logged.find(item => item.event === 'opCommitted');
      expect(committed!.details['source']).toBeUndefined();
    });

    it('does not report an interop handle for a connection made without one', () => {
      const env = new TestEnvironment();
      const logged: LoggedActivity[] = env.captureActivityLog();
      // SUT
      env.server.connectAsServer('user01');
      const entry: LoggedActivity | undefined = logged.find(item => item.event === 'connectionEstablished');
      expect(entry!.details['interopHandle']).toBeUndefined();
    });

    it('reports a doc request a client makes, naming the connection it came in on', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await fetchDoc(userConn, USERS_COLLECTION, 'user01');
      const request: LoggedActivity | undefined = logged.find(
        item => item.event === 'clientRequest' && item.details['action'] === 'f'
      );
      const established: LoggedActivity | undefined = logged.find(item => item.event === 'connectionEstablished');
      expect(request!.details['collection']).toBe(USERS_COLLECTION);
      expect(request!.details['docId']).toBe('user01');
      expect(request!.details['clientId']).toBe(established!.details['clientId']);
    });

    it('reports a query a client makes', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await createFetchQuery(userConn, PROJECTS_COLLECTION, {});
      const request: LoggedActivity | undefined = logged.find(
        item => item.event === 'clientRequest' && item.details['action'] === 'qf'
      );
      expect(request!.details['collection']).toBe(PROJECTS_COLLECTION);
      // The query itself is not reported, only that one was made, since a query can name arbitrary values.
      expect(request!.details['query']).toBeUndefined();
    });

    it('names a request identifier according to what the request is', () => {
      // SUT
      expect(identifiersInClientRequest({ a: 'op', seq: 7 })).toEqual({ opSeq: 7 });
      expect(identifiersInClientRequest({ a: 'qf', id: 'query1' })).toEqual({ queryId: 'query1' });
      expect(identifiersInClientRequest({ a: 'hs', id: 'earlierId' })).toEqual({ srcClientId: 'earlierId' });
      expect(identifiersInClientRequest({ a: 'hs', id: null })).toEqual({ srcClientId: undefined });
      // A presence update has an id and a sequence number of its own, which mean neither of the above. Don't
      // incorrectly report them as an op sequence or a query id.
      expect(identifiersInClientRequest({ a: 'p', id: 'presence1', ch: 'texts:abc' })).toEqual({});
      expect(identifiersInClientRequest({ a: 'ps', seq: 1, ch: 'texts:abc' })).toEqual({});
      expect(identifiersInClientRequest({ a: 'pu', seq: 2, ch: 'texts:abc' })).toEqual({});
    });

    it('reports what a connection was holding when it goes away', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      const doc: Doc = userConn.get(USERS_COLLECTION, 'user01');
      await new Promise<void>((resolve, reject) => doc.subscribe(err => (err == null ? resolve() : reject(err))));
      // SUT
      userConn.close();
      await flushPromises();
      const entry: LoggedActivity | undefined = logged.find(item => item.event === 'agentDisconnected');
      expect(entry!.details['subscribedDocsCount']).toBe(1);
      expect(entry!.details['subscribedCollectionsCount']).toBe(1);
      expect(entry!.details['subscribedQueriesCount']).toBe(0);
      expect(entry!.details['subscribedPresencesCount']).toBe(0);
    });

    it('measures what a read returned, for reads the interop fetch tracking does not cover', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const reads: { collection: string; docsCount: number; docsBytes: number }[] = [];
      jest
        .spyOn(ResourceMonitor.instance, 'recordSnapshotRead')
        .mockImplementation((_clientId, collection, _snapshotType, snapshots) => {
          reads.push({
            collection: collection,
            docsCount: snapshots.length,
            docsBytes: snapshots.reduce((sum: number, snapshot: { data?: unknown }) => sum + sizeof(snapshot.data), 0)
          });
        });
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await fetchDoc(userConn, USERS_COLLECTION, 'user01');
      const read = reads.find(entry => entry.collection === USERS_COLLECTION);
      expect(read!.docsCount).toBe(1);
      expect(read!.docsBytes).toBeGreaterThan(0);
    });

    it('measures the ops loaded from the database and sent to a client', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const loaded: { collection: string; docId: string; op: unknown }[] = [];
      jest.spyOn(ResourceMonitor.instance, 'recordOpLoaded').mockImplementation((_clientId, collection, docId, op) => {
        loaded.push({ collection: collection, docId: docId, op: op });
      });
      const watcher = clientConnect(env.server, 'user01');
      const watched: Doc = watcher.get(PROJECTS_COLLECTION, 'project01');
      await new Promise<void>((resolve, reject) => watched.subscribe(err => (err == null ? resolve() : reject(err))));
      const editor = clientConnect(env.server, 'user01');
      // SUT. The op is loaded and sent on to the connection watching the doc.
      await submitOp(editor, PROJECTS_COLLECTION, 'project01', [{ p: ['userPermissions', 'abc123'], oi: 'admin' }]);
      await flushPromises();
      expect(loaded.length).toBeGreaterThan(0);
      expect(loaded[0].collection).toBe(PROJECTS_COLLECTION);
      // Which document the ops came from, so that a connection loading a great deal from one document can be told
      // from one loading a little from many.
      expect(loaded[0].docId).toBe('project01');
      expect(loaded[0].op).toBeDefined();
    });

    it('reports the ops consumed to rebuild a document at an earlier version', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const userConn = clientConnect(env.server, 'user01');
      await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [{ p: ['userPermissions', 'abc123'], oi: 'admin' }]);
      const logged: LoggedActivity[] = env.captureActivityLog();
      // SUT
      await new Promise<void>((resolve, reject) =>
        userConn.fetchSnapshot(PROJECTS_COLLECTION, 'project01', 1, err => (err == null ? resolve() : reject(err)))
      );
      const rebuilds: LoggedActivity[] = logged.filter(item => item.event === 'snapshotRebuiltFromOps');
      expect(rebuilds.length).toBe(1);
      expect(rebuilds[0].details['docId']).toBe('project01');
      expect(rebuilds[0].details['opsCount']).toBe(1);
      expect(rebuilds[0].details['opsBytes']).toBeGreaterThan(0);
    });

    it('reports a subscribed query being re-polled, which the query middleware never sees', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const polled: { collection: string; pollType: string }[] = [];
      jest
        .spyOn(ResourceMonitor.instance, 'recordQueryPolled')
        .mockImplementation((_clientId, collection, pollType) => {
          polled.push({ collection: collection, pollType: pollType });
        });
      const watcher = clientConnect(env.server, 'user01');
      await new Promise<void>((resolve, reject) =>
        watcher.createSubscribeQuery(PROJECTS_COLLECTION, {}, {}, err => (err == null ? resolve() : reject(err)))
      );
      const editor = clientConnect(env.server, 'user01');
      // SUT. Changing a document the query might match makes ShareDB poll the subscription again.
      await submitOp(editor, PROJECTS_COLLECTION, 'project01', [{ p: ['userPermissions', 'abc123'], oi: 'admin' }]);
      await flushPromises();
      expect(polled.length).toBeGreaterThan(0);
      expect(polled[0].collection).toBe(PROJECTS_COLLECTION);
    });

    it('measures a query being run against the database', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const queries: string[] = [];
      jest.spyOn(ResourceMonitor.instance, 'recordQueryRun').mockImplementation((_clientId, collection) => {
        queries.push(collection);
      });
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await createFetchQuery(userConn, PROJECTS_COLLECTION, {});
      expect(queries).toContain(PROJECTS_COLLECTION);
    });

    it('reports a handshake', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      // SUT
      clientConnect(env.server, 'user01');
      // The handshake is sent over the stream rather than as part of connecting, so it has not arrived yet.
      await flushPromises();
      const handshakes: LoggedActivity[] = logged.filter(
        item => item.event === 'clientRequest' && item.details['action'] === 'hs'
      );
      // A connection sends this more than once, so the count is not asserted, only that it is reported.
      expect(handshakes.length).toBeGreaterThan(0);
      // Absent because this connection is new and so has no earlier id it is asking to keep.
      expect(handshakes[0].details['srcClientId']).toBeUndefined();
    });

    it('reports an op as received, as well as when it is submitted and committed', async () => {
      const env = new TestEnvironment();
      await env.createData();
      const logged: LoggedActivity[] = env.captureActivityLog();
      const userConn = clientConnect(env.server, 'user01');
      // SUT
      await submitOp(userConn, PROJECTS_COLLECTION, 'project01', [{ p: ['userPermissions', 'abc123'], oi: 'admin' }]);
      const received: LoggedActivity | undefined = logged.find(
        item => item.event === 'clientRequest' && item.details['action'] === 'op'
      );
      const submitted: LoggedActivity | undefined = logged.find(item => item.event === 'opSubmitted');
      const committed: LoggedActivity | undefined = logged.find(item => item.event === 'opCommitted');
      expect(received!.details['collection']).toBe(PROJECTS_COLLECTION);
      expect(received!.details['docId']).toBe('project01');
      // The three entries for one op are lined up by the connection and the op's sequence number.
      expect(received!.details['clientId']).toBe(submitted!.details['clientId']);
      expect(received!.details['opSeq']).toBe(submitted!.details['opSeq']);
      expect(received!.details['clientId']).toBe(committed!.details['clientId']);
      expect(received!.details['opSeq']).toBe(committed!.details['opSeq']);
    });
  });
});

class TestEnvironment {
  readonly mockedUserService = mock(UserService);
  readonly mockedProjectService = mock(ProjectService);
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly mongo = mock(Db);
  readonly server: RealtimeServer;

  constructor(migrationsDisabled = false, dataValidationDisabled = false) {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: PROJECTS_COLLECTION, collection: PROJECTS_COLLECTION, version: 1 }
    ]);
    when(this.mockedUserService.collection).thenReturn(USERS_COLLECTION);
    const userService = new UserService();
    when(this.mockedUserService.validationSchema).thenReturn(userService.validationSchema);

    // Add some extra values to the project schema for testing uncommon validation cases
    when(this.mockedProjectService.validationSchema).thenReturn({
      bsonType: ProjectService.validationSchema.bsonType,
      required: ProjectService.validationSchema.required,
      properties: {
        ...ProjectService.validationSchema.properties,
        enumExample: {
          bsonType: 'string',
          enum: ['first', 'second']
        },
        noDataValidationExample: {},
        numberExample: {
          bsonType: 'number'
        },
        objectExample: {
          bsonType: 'object',
          properties: {
            aNumber: {
              bsonType: 'int'
            },
            aBool: {
              bsonType: 'bool'
            },
            childArray: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  aNumber: {
                    bsonType: 'int'
                  },
                  aString: {
                    bsonType: 'string'
                  }
                }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        },
        kvpExample: {
          bsonType: 'object',
          patternProperties: {
            '^[0-9a-z]+$': {
              bsonType: 'object',
              properties: {
                aNumber: {
                  bsonType: 'int'
                }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      }
    });
    when(this.mockedProjectService.collection).thenReturn(PROJECTS_COLLECTION);
    this.server = new RealtimeServer(
      'TEST',
      migrationsDisabled,
      dataValidationDisabled,
      [instance(this.mockedUserService), instance(this.mockedProjectService)],
      PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, PROJECTS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(
      conn,
      USERS_COLLECTION,
      'user01',
      createTestUser({
        sites: {
          sf: {
            projects: []
          }
        }
      })
    );

    await createDoc<Project>(conn, PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      userRoles: {
        user01: 'admin'
      },
      rolePermissions: {},
      userPermissions: {}
    });
  }

  /** Collect what is passed to ActivityLogger, rather than writing it to a log file. */
  captureActivityLog(): LoggedActivity[] {
    const logged: LoggedActivity[] = [];
    jest.spyOn(ActivityLogger.instance, 'enabled', 'get').mockReturnValue(true);
    jest
      .spyOn(ActivityLogger.instance, 'log')
      .mockImplementation((event: string, details: Record<string, unknown> = {}) => {
        logged.push({ event: event, details: details });
      });
    return logged;
  }

  async migrateDoc(collection: string, id: string, version: number, ops: Op[]): Promise<void> {
    const conn = this.server.connect();
    const doc = conn.get(collection, id);
    await docFetch(doc);
    await submitMigrationOp(version, doc, ops);
  }

  createDoc<T>(collection: string, id: string, data: T): Promise<void> {
    const conn = this.server.connect();
    return createDoc(conn, collection, id, data);
  }

  async submitJson0Op<T>(collection: string, id: string, build: (op: Json0OpBuilder<T>) => void): Promise<boolean> {
    const conn = this.server.connect();
    return submitJson0Op(conn, collection, id, build);
  }
}
