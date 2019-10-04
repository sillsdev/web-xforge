import ShareDB = require('sharedb');
import ShareDBMingo = require('sharedb-mingo-memory');
import { instance, mock, when } from 'ts-mockito';
import { OwnedData } from '../models/owned-data';
import { Project } from '../models/project';
import { ProjectData } from '../models/project-data';
import { Operation, ProjectRights } from '../models/project-rights';
import { SystemRole } from '../models/system-role';
import { User, USERS_COLLECTION } from '../models/user';
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
        subData: []
      })
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      createDoc<TestData>(observerConn, TEST_DATA_COLLECTION, 'test04', {
        projectRef: 'project01',
        ownerRef: 'observer',
        subData: []
      })
    ).rejects.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      createDoc<TestData>(adminConn, TEST_DATA_COLLECTION, 'test04', {
        projectRef: 'project01',
        ownerRef: 'admin',
        subData: []
      })
    ).resolves.not.toThrow();
  });

  it('controls access to create child entity', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const nonmemberConn = clientConnect(env.server, 'nonmember');
    await expect(
      submitJson0Op<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.add(d => d.subData, { id: 'sub04', ownerRef: 'nonmember' })
      )
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TestData>(observerConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.add(d => d.subData, { id: 'sub04', ownerRef: 'observer' })
      )
    ).rejects.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops =>
        ops.add(d => d.subData, { id: 'sub04', ownerRef: 'admin' })
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
      submitJson0Op<TestData>(nonmemberConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.subData, 0))
    ).rejects.toThrow();

    const observerConn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TestData>(observerConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.subData, 0))
    ).rejects.toThrow();

    const userConn = clientConnect(env.server, 'user');
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.subData, 0))
    ).rejects.toThrow();
    await expect(
      submitJson0Op<TestData>(userConn, TEST_DATA_COLLECTION, 'test02', ops => ops.remove(d => d.subData, 0))
    ).resolves.not.toThrow();

    const adminConn = clientConnect(env.server, 'admin');
    await expect(
      submitJson0Op<TestData>(adminConn, TEST_DATA_COLLECTION, 'test01', ops => ops.remove(d => d.subData, 0))
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
});

enum TestProjectDomain {
  TestData = 1000,
  SubData = 2000
}

interface TestSubData extends OwnedData {
  id: string;
  num?: number;
}

interface TestData extends ProjectData {
  num?: number;
  immutable?: string;
  subData: TestSubData[];
}

class TestDataService extends ProjectDataService<TestData> {
  readonly collection = 'test_data';

  protected readonly immutableProps: ObjPathTemplate[] = [this.pathTemplate(d => d.immutable!)];

  protected readonly projectRights = new ProjectRights({
    admin: [
      { projectDomain: TestProjectDomain.TestData, operation: Operation.View },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.Create },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.Edit },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.Delete },

      { projectDomain: TestProjectDomain.SubData, operation: Operation.View },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.Create },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.Edit },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.Delete }
    ],
    user: [
      { projectDomain: TestProjectDomain.TestData, operation: Operation.View },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.Create },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.EditOwn },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.DeleteOwn },

      { projectDomain: TestProjectDomain.SubData, operation: Operation.View },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.Create },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.EditOwn },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.DeleteOwn }
    ],
    userOwn: [
      { projectDomain: TestProjectDomain.TestData, operation: Operation.ViewOwn },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.Create },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.EditOwn },
      { projectDomain: TestProjectDomain.TestData, operation: Operation.DeleteOwn },

      { projectDomain: TestProjectDomain.SubData, operation: Operation.ViewOwn },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.Create },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.EditOwn },
      { projectDomain: TestProjectDomain.SubData, operation: Operation.DeleteOwn }
    ],
    observer: [
      { projectDomain: TestProjectDomain.TestData, operation: Operation.View },

      { projectDomain: TestProjectDomain.SubData, operation: Operation.View }
    ]
  });

  constructor() {
    super([]);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      { projectDomain: TestProjectDomain.TestData, pathTemplate: this.pathTemplate() },
      { projectDomain: TestProjectDomain.SubData, pathTemplate: this.pathTemplate(d => d.subData[ANY_INDEX]) }
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
    await createDoc<User>(conn, USERS_COLLECTION, 'admin', {
      name: 'User 01',
      email: 'user01@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth01',
      displayName: 'User 01',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'user', {
      name: 'User 02',
      email: 'user02@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth02',
      displayName: 'User 02',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'userOwn', {
      name: 'User 03',
      email: 'user03@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth03',
      displayName: 'User 03',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'observer', {
      name: 'User 04',
      email: 'user04@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth04',
      displayName: 'User 04',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'nonmember', {
      name: 'User 05',
      email: 'user05@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth05',
      displayName: 'User 05',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<Project>(conn, PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      userRoles: {
        admin: 'admin',
        user: 'user',
        userOwn: 'userOwn',
        observer: 'observer'
      }
    });

    await createDoc<TestData>(conn, TEST_DATA_COLLECTION, 'test01', {
      projectRef: 'project01',
      ownerRef: 'admin',
      subData: [{ id: 'sub01', ownerRef: 'admin' }]
    });

    await createDoc<TestData>(conn, TEST_DATA_COLLECTION, 'test02', {
      projectRef: 'project01',
      ownerRef: 'user',
      subData: [{ id: 'sub02', ownerRef: 'user' }]
    });

    await createDoc<TestData>(conn, TEST_DATA_COLLECTION, 'test03', {
      projectRef: 'project01',
      ownerRef: 'userOwn',
      subData: [{ id: 'sub03', ownerRef: 'userOwn' }]
    });
  }
}
