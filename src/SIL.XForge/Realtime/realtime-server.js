const express = require('express');
const http = require('http');
const richText = require('rich-text');
const otJson0 = require('ot-json0');
const ShareDB = require('sharedb');
const ShareDBMongo = require('sharedb-mongo');
const WebSocketJSONStream = require('websocket-json-stream');
const WebSocket = require('ws');
const MongoClient = require('mongodb').MongoClient;
const jwt = require('jsonwebtoken');
const jwks = require('jwks-rsa');
const shareDBAccess = require('sharedb-access');

ShareDB.types.register(richText.type);
ShareDB.types.register(otJson0.type);

const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
const XF_ROLE_CLAIM = 'http://xforge.org/role';

const SYSTEM_ADMIN_ROLE = 'system_admin';

const USER_PROFILE_FIELDS = { name: true, avatarUrl: true };

// This should stay in sync with the corresponding enum in "Models/Operation.cs".
const Operation = {
  Create: 1,
  Edit: 2,
  Delete: 3,
  View: 4,

  EditOwn: 5,
  DeleteOwn: 6,
  ViewOwn: 7
};

function isLocalRequest(request) {
  const addr = request.connection.remoteAddress;
  return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1';
}

function deepGet(path, obj) {
  let curValue = obj;
  for (let i = 0; i < path.length; i++) {
    curValue = curValue[path[i]];
  }
  return curValue;
}

function getProjectId(docId) {
  const parts = docId.split(':');
  return parts[0];
}

class RealtimeServer {
  constructor(options) {
    this.connectionString = options.connectionString;
    this.port = options.port;
    this.projectsCollectionName = options.projectsCollection.name;
    this.audience = options.audience;
    this.scope = options.scope;
    this.projectAdminRole = options.projectAdminRole;
    this.projectRoles = new Map();
    for (const role of options.projectRoles) {
      this.projectRoles.set(role.name, new Set(role.rights));
    }
    this.connections = new Map();
    this.connectionIndex = 0;

    // Create web servers to serve files and listen to WebSocket connections
    const app = express();
    app.use(express.static('static'));
    this.httpServer = http.createServer(app);

    this.jwksClient = jwks({
      cache: true,
      jwksUri: `${options.authority}.well-known/jwks.json`
    });

    this.backend = new ShareDB({
      db: ShareDBMongo(this.connectionString),
      disableDocAction: true,
      disableSpaceDelimitedActions: true
    });
    this.backend.addProjection(options.userProfilesCollectionName, options.usersCollection.name, USER_PROFILE_FIELDS);
    this.backend.use('connect', (request, done) => {
      this.setConnectSession(request)
        .then(() => done())
        .catch(err => done(err));
    });

    shareDBAccess(this.backend);
    // users access control
    this.addUsersAccessRules(options.usersCollection);

    this.addProjectsAccessRules(options.projectsCollection);

    // project data access control
    for (const collectionConfig of options.projectDataCollections) {
      this.addProjectDataAccessRules(collectionConfig);
    }

    // Connect any incoming WebSocket connection to ShareDB
    const wss = new WebSocket.Server({
      server: this.httpServer,
      verifyClient: (info, done) => this.verifyToken(info, done)
    });
    wss.on('connection', (ws, req) => {
      const stream = new WebSocketJSONStream(ws);
      this.backend.listen(stream, req);
    });
  }

  async init() {
    this.database = await MongoClient.connect(this.connectionString);
  }

  start() {
    return new Promise((resolve, reject) => {
      this.httpServer.once('error', err => {
        console.log('Error in Realtime Server:' + err);
        reject(err);
      });
      this.httpServer.once('listening', () => {
        console.log('Realtime Server is listening on http://localhost:' + this.port);
        resolve();
      });
      this.httpServer.listen(this.port);
    });
  }

  stop() {
    if (!this.httpServer.listening) {
      return;
    }

    this.database.close();
    this.backend.close();
    this.httpServer.close();
    console.log('Realtime Server stopped.');
  }

  connect() {
    const connection = this.backend.connect();
    const index = this.connectionIndex++;
    this.connections.set(index, connection);
    return index;
  }

  disconnect(handle) {
    this.connections.delete(handle);
  }

  getDoc(handle, collection, id) {
    const conn = this.connections.get(handle);
    return conn.get(collection, id);
  }

  getKey(header, done) {
    this.jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) {
        done(err);
      } else {
        const signingKey = key.publicKey || key.rsaPublicKey;
        done(null, signingKey);
      }
    });
  }

  verifyToken(info, done) {
    const url = info.req.url;
    if (url.includes('?access_token=')) {
      const token = url.split('?access_token=')[1];
      jwt.verify(token, (header, done) => this.getKey(header, done), { audience: this.audience }, (err, decoded) => {
        if (err) {
          done(false, 401, 'Unauthorized');
        } else {
          const scopeClaim = decoded['scope'];
          if (scopeClaim != null && scopeClaim.split(' ').includes(this.scope)) {
            info.req.user = decoded;
            done(true);
          } else {
            done(false, 401, 'A required scope has not been granted.');
          }
        }
      });
    } else if (isLocalRequest(info.req)) {
      done(true);
    } else {
      done(false, 401, 'Unauthorized');
    }
  }

  async updateUserProjectRoles(session) {
    const coll = this.database.collection(this.projectsCollectionName);
    const projects = await coll.find({ ['userRoles.' + session.userId]: { $exists: true } }).toArray();
    const projectRoles = new Map();
    for (const project of projects) {
      const role = project.userRoles[session.userId];
      projectRoles.set(project._id, role);
    }
    session.projectRoles = projectRoles;
  }

  async setConnectSession(request) {
    if (request.stream.isServer || request.req.user == null) {
      request.agent.connectSession = { isServer: true };
    } else {
      const userId = request.req.user[XF_USER_ID_CLAIM];
      const role = request.req.user[XF_ROLE_CLAIM];
      const session = { userId, role, isServer: false };
      await this.updateUserProjectRoles(session);
      request.agent.connectSession = session;
    }
  }

  async getUserProjectRole(session, projectId) {
    let projectRole = session.projectRoles.get(projectId);
    if (projectRole == null) {
      await this.updateUserProjectRoles(session);
      projectRole = session.projectRoles.get(projectId);
    }
    return projectRole;
  }

  addUsersAccessRules(collectionConfig) {
    this.backend.allowCreate(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowDelete(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowRead(collectionConfig.name, (docId, doc, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE) {
        return true;
      }
      if (docId === session.userId) {
        return true;
      }

      for (const key of Object.keys(doc)) {
        if (!USER_PROFILE_FIELDS.hasOwnProperty(key)) {
          return false;
        }
      }

      return true;
    });
    this.backend.allowUpdate(collectionConfig.name, (docId, _oldDoc, _newDoc, ops, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE) {
        return true;
      }
      if (docId !== session.userId) {
        return false;
      }

      for (const op of ops) {
        if (this.getMatchingPathTemplate(collectionConfig.immutableProps, op.p) !== -1) {
          return false;
        }
      }
      return true;
    });
  }

  addProjectsAccessRules(collectionConfig) {
    this.backend.allowCreate(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowDelete(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowRead(collectionConfig.name, (_docId, doc, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE || Object.keys(doc).length === 0) {
        return true;
      }

      return session.userId in doc.userRoles;
    });
    this.backend.allowUpdate(collectionConfig.name, (_docId, _oldDoc, newDoc, ops, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE) {
        return true;
      }

      const projectRole = newDoc.userRoles[session.userId];
      if (projectRole !== this.projectAdminRole) {
        return false;
      }

      for (const op of ops) {
        if (this.getMatchingPathTemplate(collectionConfig.immutableProps, op.p) !== -1) {
          return false;
        }
      }
      return true;
    });
  }

  addProjectDataAccessRules(collectionConfig) {
    this.backend.allowCreate(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowDelete(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowRead(collectionConfig.name, async (docId, doc, session) => {
      if (session.isServer || Object.keys(doc).length === 0) {
        return true;
      }

      const projectId = getProjectId(docId);
      if (projectId === '') {
        return false;
      }
      const role = await this.getUserProjectRole(session, projectId);
      if (role == null) {
        return false;
      }

      for (const domainConfig of collectionConfig.domains) {
        if (
          !this.hasRight(role, domainConfig.domain, Operation.View) &&
          (doc.ownerRef !== session.userId || !this.hasRight(role, domainConfig.domain, Operation.ViewOwn))
        ) {
          return false;
        }
      }
      return true;
    });
    this.backend.allowUpdate(collectionConfig.name, async (docId, oldDoc, newDoc, ops, session) => {
      if (session.isServer) {
        return true;
      }

      const projectId = getProjectId(docId);
      const role = await this.getUserProjectRole(session, projectId);
      if (role == null) {
        return false;
      }

      switch (collectionConfig.otTypeName) {
        case richText.type.name:
          if (!this.hasRight(role, collectionConfig.domains[0].domain, Operation.Edit)) {
            return false;
          }
          break;

        case otJson0.type.name:
          for (const op of ops) {
            const index = this.getMatchingPathTemplate(collectionConfig.domains.map(dc => dc.pathTemplate), op.p);
            if (index === -1) {
              return false;
            }
            const domainConfig = collectionConfig.domains[index];

            if (domainConfig.pathTemplate.template.length < op.p.length) {
              // property update
              const entityPath = op.p.slice(0, domainConfig.pathTemplate.template.length);
              const oldEntity = deepGet(entityPath, oldDoc);
              const newEntity = deepGet(entityPath, newDoc);
              if (!this.checkJsonEditRight(session.userId, role, domainConfig, oldEntity, newEntity)) {
                return false;
              }
            } else if (op.li != null && op.ld != null) {
              // replace
              if (!this.checkJsonEditRight(session.userId, role, domainConfig, op.ld, op.li)) {
                return false;
              }
            } else if (op.li != null) {
              // create
              if (!this.checkJsonCreateRight(session.userId, role, domainConfig, op.li)) {
                return false;
              }
            } else if (op.ld != null) {
              // delete
              if (!this.checkJsonDeleteRight(session.userId, role, domainConfig, op.ld)) {
                return false;
              }
            }

            // check if trying to update an immutable property
            if (this.getMatchingPathTemplate(collectionConfig.immutableProps, op.p) !== -1) {
              return false;
            }
          }
          break;
      }
      return true;
    });
  }

  hasRight(role, domain, operation) {
    const rights = this.projectRoles.get(role);
    return rights.has(domain + operation);
  }

  checkJsonEditRight(userId, role, type, oldEntity, newEntity) {
    if (oldEntity.ownerRef !== newEntity.ownerRef) {
      return false;
    }

    if (this.hasRight(role, type.domain, Operation.Edit)) {
      return true;
    }

    return this.hasRight(role, type.domain, Operation.EditOwn) && oldEntity.ownerRef === userId;
  }

  checkJsonCreateRight(userId, role, type, newEntity) {
    return this.hasRight(role, type.domain, Operation.Create) && newEntity.ownerRef === userId;
  }

  checkJsonDeleteRight(userId, role, type, oldEntity) {
    if (this.hasRight(role, type.domain, Operation.Delete)) {
      return true;
    }

    return this.hasRight(role, type.domain, Operation.DeleteOwn) && oldEntity.ownerRef === userId;
  }

  getMatchingPathTemplate(pathTemplateConfigs, path) {
    for (let i = 0; i < pathTemplateConfigs.length; i++) {
      const template = pathTemplateConfigs[i].template;
      const inherit = pathTemplateConfigs[i].inherit;
      if ((inherit && path.length < template.length) || (!inherit && path.length !== template.length)) {
        continue;
      }

      let match = true;
      for (let i = 0; i < template.length; i++) {
        if (template[i] === -1) {
          if (typeof path[i] != 'number') {
            match = false;
            break;
          }
        } else if (template[i] !== '*' && template[i] !== path[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i;
      }
    }
    return -1;
  }
}

function createSnapshot(doc) {
  return { version: doc.version, data: doc.data };
}

module.exports = {
  start: (callback, options) => {
    server = new RealtimeServer(options);
    server
      .init()
      .then(() => server.start())
      .then(() => callback())
      .catch(err => callback(err));
  },

  stop: callback => {
    if (server) {
      server.stop();
    }
    callback();
  },

  connect: callback => {
    const handle = server.connect();
    callback(null, handle);
  },

  disconnect: (callback, handle) => {
    server.disconnect(handle);
    callback(null);
  },

  createDoc: (callback, handle, collection, id, data, typeName) => {
    const doc = server.getDoc(handle, collection, id);
    doc.create(data, typeName, err => callback(err, createSnapshot(doc)));
  },

  fetchDoc: (callback, handle, collection, id) => {
    const doc = server.getDoc(handle, collection, id);
    doc.fetch(err => callback(err, createSnapshot(doc)));
  },

  submitOp: (callback, handle, collection, id, op) => {
    const doc = server.getDoc(handle, collection, id);
    doc.submitOp(op, err => callback(err, createSnapshot(doc)));
  },

  deleteDoc: (callback, handle, collection, id) => {
    const doc = server.getDoc(handle, collection, id);
    doc.del(err => callback(err));
  },

  applyOp: (callback, typeName, data, op) => {
    const type = ShareDB.types.map[typeName];
    if (op != null && type.normalize != null) {
      op = type.normalize(op);
    }
    data = type.apply(data, op);
    callback(null, data);
  }
};
