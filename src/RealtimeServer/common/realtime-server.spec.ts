import { Db } from 'mongodb';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { Doc, Op } from 'sharedb/lib/client';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ConnectSession } from './connect-session';
import { MetadataDB } from './metadata-db';
import { Migration } from './migration';
import { Project } from './models/project';
import { User, USERS_COLLECTION } from './models/user';
import { createTestUser } from './models/user-test-data';
import { RealtimeServer, submitMigrationOp } from './realtime-server';
import { SchemaVersionRepository } from './schema-version-repository';
import { ProjectService } from './services/project-service';
import { UserService } from './services/user-service';
import { Json0OpBuilder } from './utils/json0-op-builder';
import { docFetch, docSubmitOp } from './utils/sharedb-utils';
import { allowAll, clientConnect, createDoc, fetchDoc, submitJson0Op, submitOp } from './utils/test-utils';

const PROJECTS_COLLECTION = 'projects';

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
    when(env.mockedProjectService.subscribeMigration(2)).thenReturn(instance(mockedMigration));
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
    when(env.mockedProjectService.subscribeMigration(2)).thenReturn(instance(mockedMigration));
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
      session = context.agent.connectSession as ConnectSession;
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
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent.connectSession;
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

    const userConn = env.server.connect('user01');
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
