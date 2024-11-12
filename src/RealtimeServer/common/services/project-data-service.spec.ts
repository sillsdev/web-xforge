import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { OwnedData } from '../models/owned-data';
import { Project } from '../models/project';
import { ProjectData } from '../models/project-data';
import { Operation, ProjectRights } from '../models/project-rights';
import { User, USERS_COLLECTION } from '../models/user';
import { createTestUser } from '../models/user-test-data';
import { ValidationSchema } from '../models/validation-schema';
import { RealtimeServer } from '../realtime-server';
import { SchemaVersionRepository } from '../schema-version-repository';
import { ANY_INDEX, ObjPathTemplate } from '../utils/obj-path';
import { allowAll, clientConnect, createDoc, deleteDoc, fetchDoc, submitJson0Op } from '../utils/test-utils';
import { ProjectDataService, ProjectDomainConfig } from './project-data-service';
import { ProjectService } from './project-service';
import { UserService } from './user-service';

const PROJECTS_COLLECTION = 'projects';
const TEST_DATA_COLLECTION = 'test_data';

describe('ProjectDataService', () => {
  it('controls access to view root entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(fetchDoc(nonmemberConn, TEST_DATA_COLLECTION, 'test01')).rejects.toThrow();

    const userOwnConn = clientConnect(env.server, 'userOwn');
    await expect(fetchDoc(userOwnConn, TEST_DATA_COLLECTION, 'test01')).rejects.toThrow();
    await expect(fetchDoc(userOwnConn, TEST_DATA_COLLECTION, 'test03')).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(fetchDoc(adminConn, TEST_DATA_COLLECTION, 'test01')).resolves.not.toThrow();
  });

  it('controls access to create root entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(
      createDoc<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test04', {
        projectRef: 'project01',
        ownerRef: 'nonmember',
        children: []
      })
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      createDoc<TestData>(observerConn, TEST_DATA_COLLECTION, 'test04', {
        projectRef: 'project01',
        ownerRef: 'observer',
        children: []
      })
    ).rejects.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      createDoc<TestData>(adminConn, TEST_DATA_COLLECTION, 'test04', {
        projectRef: 'project01',
        ownerRef: 'admin',
        children: []
      })
    ).resolves.not.toThrow();
  });

  it('controls access to create child entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(
      submitJson0Op<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.add(d => d.children, { id: 'sub04', ownerRef: 'nonmember', children: [] })
      )
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TestData>(observerConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.add(d => d.children, { id: 'sub04', ownerRef: 'observer', children: [] })
      )
    ).rejects.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.add(d => d.children, { id: 'sub04', ownerRef: 'admin', children: [] })
      )
    ).resolves.not.toThrow();
  });

  it('controls access to edit root entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(
      submitJson0Op<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test01', ops => ops.set<number>(d => d.num!, 1))
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TestData>(observerConn, TEST_DATA_COLLECTION, 'test01', ops => ops.set<number>(d => d.num!, 1))
    ).rejects.toThrow();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test01', ops => ops.set<number>(d => d.num!, 1))
    ).rejects.toThrow();
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops => ops.set<number>(d => d.num!, 1))
    ).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops => ops.set<number>(d => d.num!, 1))
    ).resolves.not.toThrow();
  });

  it('controls access to edit child entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(
      submitJson0Op<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.set<number>(d => d.children[0].num!, 1)
      )
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TestData>(observerConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.set<number>(d => d.children[0].num!, 1)
      )
    ).rejects.toThrow();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.set<number>(d => d.children[0].num!, 1)
      )
    ).rejects.toThrow();
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops =>
        ops.set<number>(d => d.children[0].num!, 1)
      )
    ).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.set<number>(d => d.children[0].num!, 1)
      )
    ).resolves.not.toThrow();
  });

  it('controls access to delete root entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(deleteDoc(nonmemberConn, TEST_DATA_COLLECTION, 'test01')).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(deleteDoc(observerConn, TEST_DATA_COLLECTION, 'test01')).rejects.toThrow();

    const userConn = clientConnect(env.server, 'user');
    await expect(deleteDoc(userConn, TEST_DATA_COLLECTION, 'test01')).rejects.toThrow();
    await expect(deleteDoc(userConn, TEST_DATA_COLLECTION, 'test02')).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(deleteDoc(adminConn, TEST_DATA_COLLECTION, 'test01')).resolves.not.toThrow();
  });

  it('controls access to delete child entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(
      submitJson0Op<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.children, 0))
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TestData>(observerConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.children, 0))
    ).rejects.toThrow();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.children, 0))
    ).rejects.toThrow();
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops => ops.remove(d => d.children, 0))
    ).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.children, 0))
    ).resolves.not.toThrow();
  });

  it('controls access to immutable properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.set<string>(d => d.immutable!, 'test')
      )
    ).rejects.toThrow();
  });

  it('controls access to create and edit child entity in one submit', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops =>
        ops
          .add(d => d.children, { id: 'sub04', ownerRef: 'user', children: [] })
          .set<number>(d => d.children[1].num!, 1)
      )
    ).resolves.not.toThrow();
  });

  it('controls access to create, edit, and delete child entity in one submit', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops =>
        ops
          .add(d => d.children, { id: 'sub04', ownerRef: 'user', children: [] })
          .insert(d => d.children[1].children, 0, { id: 'sub05', ownerRef: 'user' })
          .set<number>(d => d.children[1].children[0].num!, 1)
          .remove(d => d.children[1].children, 0, { id: 'sub05', ownerRef: 'user', num: 1 })
      )
    ).resolves.not.toThrow();
  });

  it('handles updates to the deleted property as delete operations', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops =>
        ops.insert(d => d.children[0].children, 0, { id: 'sub05', ownerRef: 'user' })
      )
    ).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test02', ops =>
        ops.set<number>(d => d.children[0].children[0].num!, 1)
      )
    ).rejects.toThrow();
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test02', ops =>
        ops.set<boolean>(d => d.children[0].children[0].deleted!, true)
      )
    ).resolves.not.toThrow();
  });

  it('denies updates to the deleted property if delete operations are not permitted', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const userOwnConn = clientConnect(env.server, 'userOwn');
    await expect(
      submitJson0Op<TestData>(userOwnConn, TEST_DATA_COLLECTION, 'test03', ops =>
        ops.insert(d => d.children[0].children, 0, { id: 'sub05', ownerRef: 'userOwn' })
      )
    ).resolves.not.toThrow();
    await expect(
      submitJson0Op<TestData>(userOwnConn, TEST_DATA_COLLECTION, 'test03', ops =>
        ops.set<number>(d => d.children[0].children[0].num!, 1)
      )
    ).resolves.not.toThrow();
    await expect(
      submitJson0Op<TestData>(userOwnConn, TEST_DATA_COLLECTION, 'test03', ops =>
        ops.set<boolean>(d => d.children[0].children[0].deleted!, true)
      )
    ).rejects.toThrow();
  });
});

enum TestProjectDomain {
  TestData = 'test_data',
  SubData = 'sub_data',
  SubSubData = 'sub_sub_data'
}

interface TestSubSubData extends OwnedData {
  id: string;
  num?: number;
  deleted?: boolean;
}

interface TestSubData extends OwnedData {
  id: string;
  num?: number;
  children: TestSubSubData[];
}

interface TestData extends ProjectData {
  num?: number;
  immutable?: string;
  children: TestSubData[];
}

class TestDataService extends ProjectDataService<TestData> {
  readonly collection = 'test_data';

  protected readonly indexPaths = [];
  protected readonly immutableProps: ObjPathTemplate[] = [this.pathTemplate(d => d.immutable!)];
  readonly validationSchema: ValidationSchema = {
    bsonType: ProjectDataService.validationSchema.bsonType,
    required: ProjectDataService.validationSchema.required,
    properties: {
      ...ProjectDataService.validationSchema.properties,
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+:[0-9A-Z]+:[0-9]+:target$'
      },
      num: {
        bsonType: 'int'
      },
      immutable: {
        bsonType: 'string'
      },
      children: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['id', 'children', 'ownerRef'],
          properties: {
            id: {
              bsonType: 'string'
            },
            num: {
              bsonType: 'int'
            },
            children: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['id', 'ownerRef'],
                properties: {
                  id: {
                    bsonType: 'string'
                  },
                  num: {
                    bsonType: 'int'
                  },
                  deleted: {
                    bsonType: 'bool'
                  },
                  ownerRef: {
                    bsonType: 'string'
                  }
                },
                additionalProperties: false
              }
            },
            ownerRef: {
              bsonType: 'string'
            }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: false
  };

  protected readonly projectRights = new ProjectRights({
    admin: [
      [TestProjectDomain.TestData, Operation.View],
      [TestProjectDomain.TestData, Operation.Create],
      [TestProjectDomain.TestData, Operation.Edit],
      [TestProjectDomain.TestData, Operation.Delete],

      [TestProjectDomain.SubData, Operation.View],
      [TestProjectDomain.SubData, Operation.Create],
      [TestProjectDomain.SubData, Operation.Edit],
      [TestProjectDomain.SubData, Operation.Delete],

      [TestProjectDomain.SubSubData, Operation.View],
      [TestProjectDomain.SubSubData, Operation.Create],
      [TestProjectDomain.SubSubData, Operation.EditOwn],
      [TestProjectDomain.SubSubData, Operation.Delete]
    ],
    user: [
      [TestProjectDomain.TestData, Operation.View],
      [TestProjectDomain.TestData, Operation.Create],
      [TestProjectDomain.TestData, Operation.EditOwn],
      [TestProjectDomain.TestData, Operation.DeleteOwn],

      [TestProjectDomain.SubData, Operation.View],
      [TestProjectDomain.SubData, Operation.Create],
      [TestProjectDomain.SubData, Operation.EditOwn],
      [TestProjectDomain.SubData, Operation.DeleteOwn],

      [TestProjectDomain.SubSubData, Operation.View],
      [TestProjectDomain.SubSubData, Operation.Create],
      [TestProjectDomain.SubSubData, Operation.EditOwn],
      [TestProjectDomain.SubSubData, Operation.DeleteOwn]
    ],
    userOwn: [
      [TestProjectDomain.TestData, Operation.ViewOwn],
      [TestProjectDomain.TestData, Operation.Create],
      [TestProjectDomain.TestData, Operation.EditOwn],
      [TestProjectDomain.TestData, Operation.DeleteOwn],

      [TestProjectDomain.SubData, Operation.ViewOwn],
      [TestProjectDomain.SubData, Operation.Create],
      [TestProjectDomain.SubData, Operation.EditOwn],
      [TestProjectDomain.SubData, Operation.DeleteOwn],

      [TestProjectDomain.SubSubData, Operation.ViewOwn],
      [TestProjectDomain.SubSubData, Operation.Create],
      [TestProjectDomain.SubSubData, Operation.EditOwn]
    ],
    observer: [
      [TestProjectDomain.TestData, Operation.View],

      [TestProjectDomain.SubData, Operation.View],

      [TestProjectDomain.SubSubData, Operation.View]
    ]
  });

  constructor() {
    super([]);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      { projectDomain: TestProjectDomain.TestData, pathTemplate: this.pathTemplate() },
      { projectDomain: TestProjectDomain.SubData, pathTemplate: this.pathTemplate(d => d.children[ANY_INDEX]) },
      {
        projectDomain: TestProjectDomain.SubSubData,
        pathTemplate: this.pathTemplate(d => d.children[ANY_INDEX].children[ANY_INDEX])
      }
    ];
  }
}

class TestEnvironment {
  readonly service: TestDataService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly mockedUserService = mock(UserService);
  readonly mockedProjectService = mock(ProjectService);

  constructor() {
    when(this.mockedProjectService.collection).thenReturn(PROJECTS_COLLECTION);
    when(this.mockedUserService.collection).thenReturn(USERS_COLLECTION);

    this.service = new TestDataService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      false,
      false,
      [this.service, instance(this.mockedProjectService), instance(this.mockedUserService)],
      PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, PROJECTS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'admin', createTestUser({}, 1));
    await createDoc<User>(conn, USERS_COLLECTION, 'user', createTestUser({}, 2));
    await createDoc<User>(conn, USERS_COLLECTION, 'userOwn', createTestUser({}, 3));
    await createDoc<User>(conn, USERS_COLLECTION, 'observer', createTestUser({}, 4));
    await createDoc<User>(conn, USERS_COLLECTION, 'nonmember', createTestUser({}, 5));

    await createDoc<Project>(conn, PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      userRoles: {
        admin: 'admin',
        user: 'user',
        userOwn: 'userOwn',
        observer: 'observer'
      },
      rolePermissions: {},
      userPermissions: {}
    });

    await createDoc<TestData>(conn, TEST_DATA_COLLECTION, 'test01', {
      projectRef: 'project01',
      ownerRef: 'admin',
      children: [{ id: 'sub01', ownerRef: 'admin', children: [] }]
    });

    await createDoc<TestData>(conn, TEST_DATA_COLLECTION, 'test02', {
      projectRef: 'project01',
      ownerRef: 'user',
      children: [{ id: 'sub02', ownerRef: 'user', children: [] }]
    });

    await createDoc<TestData>(conn, TEST_DATA_COLLECTION, 'test03', {
      projectRef: 'project01',
      ownerRef: 'userOwn',
      children: [{ id: 'sub03', ownerRef: 'userOwn', children: [] }]
    });
  }
}
