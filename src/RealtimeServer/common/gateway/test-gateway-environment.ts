import http from 'http';
import { Db } from 'mongodb';
import { AddressInfo } from 'net';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { Connection, Doc } from 'sharedb/lib/client';
import { instance, mock, when } from 'ts-mockito';
import WebSocket, { WebSocketServer } from 'ws';
import SF_GATEWAY_APPLICATION from '../../scriptureforge/gateway/gateway-application';
import { Answer, AnswerStatus } from '../../scriptureforge/models/answer';
import { BIBLICAL_TERM_COLLECTION, BiblicalTerm } from '../../scriptureforge/models/biblical-term';
import { Note } from '../../scriptureforge/models/note';
import {
  NOTE_THREAD_COLLECTION,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from '../../scriptureforge/models/note-thread';
import { Question, QUESTIONS_COLLECTION } from '../../scriptureforge/models/question';
import { SF_PROJECTS_COLLECTION, SFProject } from '../../scriptureforge/models/sf-project';
import { SFProjectRole } from '../../scriptureforge/models/sf-project-role';
import { createTestProject } from '../../scriptureforge/models/sf-project-test-data';
import {
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../../scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from '../../scriptureforge/models/sf-project-user-config-test-data';
import { getTextAudioId, TEXT_AUDIO_COLLECTION, TextAudio } from '../../scriptureforge/models/text-audio';
import { createTestTextAudio } from '../../scriptureforge/models/text-audio-test-data';
import { getTextDocId, TEXTS_COLLECTION } from '../../scriptureforge/models/text-data';
import { TRAINING_DATA_COLLECTION } from '../../scriptureforge/models/training-data';
import SFRealtimeServer from '../../scriptureforge/realtime-server';
import { MetadataDB } from '../metadata-db';
import { User, USERS_COLLECTION } from '../models/user';
import { createTestUser } from '../models/user-test-data';
import { XF_ROLE_CLAIM, XF_USER_ID_CLAIM } from '../realtime-server';
import { SchemaVersionRepository } from '../schema-version-repository';
import { Json0OpBuilder } from '../utils/json0-op-builder';
import { createDoc, fetchDoc, submitJson0Op } from '../utils/test-utils';
import {
  AuthorizableOutboundMessage,
  ConnectionAuthorizers,
  EgressAuthorizer,
  EgressContext,
  EgressDecision,
  GatewayPolicies,
  GatewaySession,
  GatewayWrite,
  InboundAuthorizationSubject,
  InboundAuthorizer,
  InboundDecision,
  ListQueryRegistry,
  QueryRegistry,
  registerQuery,
  WriteDecision,
  WriteHook
} from './authorization';
import { generateSrcKey, SrcAuthority } from './connection-src';
import { MemoryGatewayEventSink } from './gateway-event-log';
import { JsonObject } from './json';
import { RealtimeGateway } from './realtime-gateway';

/**
 * The websocket test harness of the realtime gateway: the Scripture Forge realtime server on an in-memory database
 * behind a gateway, reached over a real websocket by a raw protocol client. Only spec files use it. (The file name
 * starts with `test-` so that the builds leave it out.)
 */

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

// Project and user ids are hex, as Scripture Forge's policies require.
export const PROJECT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
/** A second project, in which only the administrator is a member. */
export const OTHER_PROJECT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
export const ADMIN = 'a00000000000000000000001';
export const TRANSLATOR = 'a00000000000000000000002';
export const CONSULTANT = 'a00000000000000000000003';
export const COMMENTER = 'a00000000000000000000004';
export const NON_MEMBER = 'a00000000000000000000005';
export const PT_OBSERVER = 'a00000000000000000000006';
export const CHECKER = 'a00000000000000000000007';
export const SF_OBSERVER = 'a00000000000000000000008';

/** The role of each member of PROJECT_ID. */
export const MEMBER_ROLES: ReadonlyMap<string, SFProjectRole> = new Map([
  [ADMIN, SFProjectRole.ParatextAdministrator],
  [TRANSLATOR, SFProjectRole.ParatextTranslator],
  [CONSULTANT, SFProjectRole.ParatextConsultant],
  [COMMENTER, SFProjectRole.Commenter],
  [PT_OBSERVER, SFProjectRole.ParatextObserver],
  [CHECKER, SFProjectRole.CommunityChecker],
  [SF_OBSERVER, SFProjectRole.Viewer]
]);

/** Matthew 1, which the administrator and translator may edit. */
export const TEXT_ID: string = getTextDocId(PROJECT_ID, 40, 1);
/** Matthew 2, where the translator's Paratext permission is read only. */
export const READ_ONLY_TEXT_ID: string = getTextDocId(PROJECT_ID, 40, 2);
/** The data id of a question on Matthew 1:1, asked by the administrator. */
export const QUESTION_DATA_ID = 'c00000000000000000000001';
export const QUESTION_ID = `${PROJECT_ID}:${QUESTION_DATA_ID}`;
/** The data id of an open note thread on Matthew 1:1 that is published to Scripture Forge. */
export const PUBLISHED_THREAD_DATA_ID = 'd00000000000000000000001';
export const PUBLISHED_THREAD_ID = `${PROJECT_ID}:${PUBLISHED_THREAD_DATA_ID}`;
/** The data id of an open note thread on Matthew 1:1 that is only in Paratext. */
export const UNPUBLISHED_THREAD_DATA_ID = 'd00000000000000000000002';
export const UNPUBLISHED_THREAD_ID = `${PROJECT_ID}:${UNPUBLISHED_THREAD_DATA_ID}`;
/** A biblical term with a reference in Matthew 1:1. */
export const BIBLICAL_TERM_ID = `${PROJECT_ID}:term01`;
/** The chapter audio of Matthew 1. */
export const TEXT_AUDIO_ID: string = getTextAudioId(PROJECT_ID, 40, 1);
/** Training data uploaded by the administrator, and by the translator. */
export const ADMIN_TRAINING_DATA_ID = `${PROJECT_ID}:data01`;
export const TRANSLATOR_TRAINING_DATA_ID = `${PROJECT_ID}:data02`;

/** A fixed time, so that dates in seeded and submitted data are stable. */
const NOW: string = '2026-10-08T12:00:00.000Z';
const DEFAULT_TIMEOUT_MS = 3000;

/** A message received from the gateway, as parsed JSON. */
export type Message = Record<string, any>;

/** Allows every inbound message, except the docs it was told to refuse in bulk requests. */
class TestInboundAuthorizer implements InboundAuthorizer {
  constructor(private readonly refusedDocIds: readonly string[]) {}

  async authorize(subject: InboundAuthorizationSubject): Promise<InboundDecision> {
    const message = subject.message;
    if (message.kind === 'bulk-fetch' && message.docs.form === 'ids') {
      const refused = new Map<string, string>();
      for (const id of message.docs.ids) {
        if (this.refusedDocIds.includes(id)) {
          refused.set(id, 'test refusal');
        }
      }
      if (refused.size > 0) {
        return { kind: 'partially-authorized', refusedDocs: refused };
      }
    }
    return { kind: 'authorized' };
  }
}

/** Sends everything, except messages about docs in the collections it was told to withhold. */
class TestEgressAuthorizer implements EgressAuthorizer {
  constructor(
    private readonly withheldCollections: readonly string[],
    private readonly withheldDocIds: readonly string[]
  ) {}

  async authorize(message: AuthorizableOutboundMessage, _context: EgressContext): Promise<EgressDecision> {
    if (
      (message.kind === 'op' || message.kind === 'subscribe-reply' || message.kind === 'fetch-reply') &&
      (this.withheldCollections.includes(message.collection) || this.withheldDocIds.includes(message.docId))
    ) {
      return {
        kind: 'withhold',
        reason: 'test withholding',
        end: [{ kind: 'doc', collection: message.collection, docId: message.docId }]
      };
    }
    if (message.kind === 'bulk-fetch-reply' || message.kind === 'bulk-subscribe-reply') {
      const withheld: string[] = Array.from(message.snapshots.keys()).filter(id => this.withheldDocIds.includes(id));
      if (withheld.length > 0) {
        return {
          kind: 'withhold-docs',
          reason: 'test withholding',
          docIds: new Set(withheld),
          end: withheld.map(id => ({ kind: 'doc', collection: message.collection, docId: id }))
        };
      }
    }
    if (message.kind === 'presence' && this.withheldDocIds.some(id => message.channel.endsWith(id))) {
      return { kind: 'withhold', reason: 'test withholding', end: [{ kind: 'presence', channel: message.channel }] };
    }
    return { kind: 'send' };
  }
}

/** Records every write, and allows or refuses all of them. */
class TestWriteHook implements WriteHook {
  readonly writes: GatewayWrite[] = [];

  constructor(private readonly refuse: boolean) {}

  async authorize(write: GatewayWrite, _session: GatewaySession): Promise<WriteDecision> {
    this.writes.push(write);
    return this.refuse ? { kind: 'refused', reason: 'test refusal' } : { kind: 'allowed' };
  }
}

/**
 * Permissive policies for testing the gateway's mechanics. They exist only in tests: the gateway's own policies
 * never allow everything.
 */
class TestPolicies implements GatewayPolicies {
  readonly queryRegistry: QueryRegistry = new ListQueryRegistry([
    registerQuery<{ projectId: string }>({
      name: 'test-own-training-data-of-project',
      collection: TRAINING_DATA_COLLECTION,
      actions: ['query-fetch'],
      extraIsSafe: false,
      match: (query: JsonObject) => {
        const keys: string[] = Object.keys(query);
        const projectRef = query['projectRef'];
        return keys.length === 1 && typeof projectRef === 'string' ? { projectId: projectRef } : undefined;
      },
      authorize: async () => ({ kind: 'authorized' }),
      build: async (args: { projectId: string }, session: GatewaySession) => ({
        projectRef: args.projectId,
        ownerRef: session.userId
      })
    })
  ]);
  readonly writeHook: TestWriteHook;

  constructor(
    private readonly options: {
      refusedDocIds: readonly string[];
      withheldCollections: readonly string[];
      withheldDocIds: readonly string[];
    },
    refuseWrites: boolean
  ) {
    this.writeHook = new TestWriteHook(refuseWrites);
  }

  createConnectionAuthorizers(_session: GatewaySession): ConnectionAuthorizers {
    return {
      inbound: new TestInboundAuthorizer(this.options.refusedDocIds),
      egress: new TestEgressAuthorizer(this.options.withheldCollections, this.options.withheldDocIds)
    };
  }
}

/** A raw websocket client that speaks the ShareDB protocol as the browser's ShareDB client puts it on the wire. */
export class TestClient {
  /** The src the gateway gave this connection in its handshake reply. */
  src = '';
  private readonly received: Message[] = [];
  private readonly listeners = new Set<() => void>();
  private closeCode: number | undefined;

  constructor(private readonly socket: WebSocket) {
    socket.on('message', (data: WebSocket.RawData) => {
      this.received.push(JSON.parse(data.toString()));
      this.listeners.forEach(listener => listener());
    });
    socket.on('close', (code: number) => {
      this.closeCode = code;
      this.listeners.forEach(listener => listener());
    });
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  /** How many messages have been received so far. Pass it to `since` or `waitFor` to look only at later ones. */
  get mark(): number {
    return this.received.length;
  }

  send(message: Message): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  sendBinary(data: Buffer): void {
    this.socket.send(data, { binary: true });
  }

  /** Sends a request and resolves to the first message that answers it (by action and ids). */
  request(message: Message): Promise<Message> {
    const start: number = this.received.length;
    this.send(message);
    return this.waitFor(m => TestClient.answers(message, m), start);
  }

  /** The messages received since `mark`. */
  since(mark: number): Message[] {
    return this.received.slice(mark);
  }

  /** The op messages received since `mark` about a doc: pushes, acks and op error replies. */
  opsSince(mark: number, collection: string, docId: string): Message[] {
    return this.since(mark).filter(m => m.a === 'op' && m.c === collection && m.d === docId);
  }

  waitFor(predicate: (message: Message) => boolean, from: number = 0): Promise<Message> {
    return this.waitForCount(predicate, 1, from).then((found: Message[]) => found[0]);
  }

  /** Resolves to the first `count` messages from `from` on that match the predicate, once that many have arrived. */
  waitForCount(predicate: (message: Message) => boolean, count: number, from: number = 0): Promise<Message[]> {
    return new Promise<Message[]>((resolve, reject) => {
      const check = (): boolean => {
        const found: Message[] = this.received.slice(from).filter(predicate);
        if (found.length >= count) {
          resolve(found.slice(0, count));
          return true;
        }
        if (this.closeCode != null) {
          reject(new Error(`closed with ${this.closeCode} while waiting`));
          return true;
        }
        return false;
      };
      if (check()) {
        return;
      }
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`timed out; received ${JSON.stringify(this.received)}`));
      }, DEFAULT_TIMEOUT_MS);
      const listener = (): void => {
        if (check()) {
          clearTimeout(timer);
          this.listeners.delete(listener);
        }
      };
      this.listeners.add(listener);
    });
  }

  /** The messages that arrive within the next `ms` milliseconds. */
  async collectFor(ms: number): Promise<Message[]> {
    const start: number = this.received.length;
    await new Promise(resolve => setTimeout(resolve, ms));
    return this.received.slice(start);
  }

  closed(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      if (this.closeCode != null) {
        resolve(this.closeCode);
        return;
      }
      const timer = setTimeout(() => reject(new Error('not closed')), DEFAULT_TIMEOUT_MS);
      this.socket.once('close', (code: number) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  /**
   * Handshakes as the client does: one `hs` as soon as the socket is open, and another when ShareDB's `init`
   * arrives, both asking for the src of the client's previous connection (null on its first). The client takes its
   * src from the first reply.
   */
  async handshake(previousSrc: string | null = null): Promise<void> {
    const start: number = this.received.length;
    const handshake: Message = { a: 'hs', id: previousSrc, protocol: 1, protocolMinor: 2 };
    this.send(handshake);
    await this.waitFor(m => m.a === 'init');
    this.send(handshake);
    const replies: Message[] = await this.waitForCount(m => m.a === 'hs', 2, start);
    this.src = replies[0].id;
  }

  close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }

  /** Whether a message answers a request: the same action and ids, and for an op, its ack or error reply. */
  private static answers(request: Message, reply: Message): boolean {
    if (reply.a !== request.a) {
      return false;
    }
    for (const key of ['c', 'd', 'id', 'ch', 'seq']) {
      if (request[key] != null && reply[key] != null && request[key] !== reply[key]) {
        return false;
      }
    }
    if (request.a === 'op') {
      return reply.seq === request.seq && (reply.op == null || reply.error != null);
    }
    return true;
  }
}

/**
 * The Scripture Forge realtime server on an in-memory database, behind a gateway, reached over a real websocket. The
 * websocket server stands in for WebSocketStreamListener: it takes the user and token expiry from the URL instead
 * of verifying an access token.
 *
 * The database holds PROJECT_ID, with one member of each project role (see MEMBER_ROLES) and their user configs, two
 * chapters of Matthew, a question, a note thread that is published to Scripture Forge and one that is not, a biblical
 * term, chapter audio and training data; and OTHER_PROJECT_ID, in which only the administrator is a member.
 */
export class TestEnvironment {
  readonly eventSink = new MemoryGatewayEventSink();
  readonly srcKey: Buffer = generateSrcKey();
  readonly srcAuthority: SrcAuthority = new SrcAuthority(this.srcKey);
  readonly db: ShareDBMingo;
  readonly server: SFRealtimeServer;
  private readonly policies: GatewayPolicies;
  private readonly testPolicies: TestPolicies | undefined;
  private readonly httpServer: http.Server = http.createServer();
  private readonly clients: TestClient[] = [];
  private webSocketServer?: WebSocketServer;
  private port = 0;
  private readonly maxEndedSubscriptions: number | undefined;
  private readonly maxPendingRequests: number | undefined;

  constructor({
    policies,
    sfPolicies = false,
    refusedDocIds = [],
    withheldCollections = [],
    withheldDocIds = [],
    refuseWrites = false,
    maxEndedSubscriptions,
    maxPendingRequests
  }: {
    policies?: GatewayPolicies;
    sfPolicies?: boolean;
    refusedDocIds?: string[];
    withheldCollections?: string[];
    withheldDocIds?: string[];
    refuseWrites?: boolean;
    maxEndedSubscriptions?: number;
    maxPendingRequests?: number;
  } = {}) {
    this.maxEndedSubscriptions = maxEndedSubscriptions;
    this.maxPendingRequests = maxPendingRequests;
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    const schemaVersions = mock(SchemaVersionRepository);
    when(schemaVersions.getAll()).thenResolve([]);
    this.server = new SFRealtimeServer('TEST', true, true, this.db, instance(schemaVersions));
    if (sfPolicies) {
      this.policies = SF_GATEWAY_APPLICATION.createPolicies(this.server, instance(mock<Db>()));
    } else if (policies == null) {
      this.testPolicies = new TestPolicies(
        { refusedDocIds: refusedDocIds, withheldCollections: withheldCollections, withheldDocIds: withheldDocIds },
        refuseWrites
      );
      this.policies = this.testPolicies;
    } else {
      this.policies = policies;
    }
  }

  get writes(): GatewayWrite[] {
    return this.testPolicies?.writeHook.writes ?? [];
  }

  async start(): Promise<void> {
    await this.seed();
    const gateway = new RealtimeGateway({
      backend: this.server,
      protocol: SF_GATEWAY_APPLICATION.protocol,
      policies: this.policies,
      srcKey: this.srcKey,
      eventSink: this.eventSink,
      maxEndedSubscriptions: this.maxEndedSubscriptions,
      maxPendingRequests: this.maxPendingRequests
    });
    this.webSocketServer = new WebSocketServer({ server: this.httpServer });
    this.webSocketServer.on('connection', (socket: WebSocket, req: http.IncomingMessage) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      (req as any).user = {
        [XF_USER_ID_CLAIM]: url.searchParams.get('user'),
        [XF_ROLE_CLAIM]: 'user',
        exp: Number(url.searchParams.get('expMs')) / 1000
      };
      gateway.acceptConnection(socket, req);
    });
    await new Promise<void>(resolve => this.httpServer.listen(0, '127.0.0.1', () => resolve()));
    this.port = (this.httpServer.address() as AddressInfo).port;
  }

  /**
   * Opens a websocket for the user and, unless told not to, handshakes as the client does. `previousSrc` is the src
   * of the client's previous connection, which a reconnecting client asks to keep.
   */
  async connect(
    userId: string,
    {
      handshake = true,
      expiresInMs = 3_600_000,
      previousSrc = null
    }: { handshake?: boolean; expiresInMs?: number; previousSrc?: string | null } = {}
  ): Promise<TestClient> {
    const expMs: number = Date.now() + expiresInMs;
    const socket = new WebSocket(`ws://127.0.0.1:${this.port}/?user=${userId}&expMs=${expMs}`);
    const client = new TestClient(socket);
    this.clients.push(client);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    if (handshake) {
      await client.handshake(previousSrc);
    }
    return client;
  }

  async serverSnapshot(collection: string, id: string): Promise<{ v: number; data: any }> {
    const connection: Connection = this.server.connectAsServer();
    try {
      const doc: Doc = await fetchDoc(connection, collection, id);
      return { v: doc.version ?? -1, data: doc.data };
    } finally {
      connection.close();
    }
  }

  /** Submits an op as the backend does, over an in-process server connection. */
  async submitAsServer(collection: string, id: string, op: unknown): Promise<void> {
    const connection: Connection = this.server.connectAsServer();
    try {
      const doc: Doc = await fetchDoc(connection, collection, id);
      await new Promise<void>((resolve, reject) =>
        doc.submitOp(op as any, {}, err => (err == null ? resolve() : reject(err)))
      );
    } finally {
      connection.close();
    }
  }

  /** Submits a json0 op built with the builder the client and backend use, as the backend. */
  async submitJson0AsServer<T>(collection: string, id: string, build: (op: Json0OpBuilder<T>) => void): Promise<void> {
    const connection: Connection = this.server.connectAsServer();
    try {
      await submitJson0Op<T>(connection, collection, id, build);
    } finally {
      connection.close();
    }
  }

  /** Creates a json0 doc as the backend does. */
  async createAsServer<T>(collection: string, id: string, data: T): Promise<void> {
    const connection: Connection = this.server.connectAsServer();
    try {
      await createDoc<T>(connection, collection, id, data);
    } finally {
      connection.close();
    }
  }

  async deleteAsServer(collection: string, id: string): Promise<void> {
    const connection: Connection = this.server.connectAsServer();
    try {
      const doc: Doc = await fetchDoc(connection, collection, id);
      await new Promise<void>((resolve, reject) => doc.del({}, err => (err == null ? resolve() : reject(err))));
    } finally {
      connection.close();
    }
  }

  /** Removes a user from PROJECT_ID as the backend does: an op that removes them from `userRoles`. */
  removeFromProjectAsServer(userId: string): Promise<void> {
    return this.submitJson0AsServer<SFProject>(SF_PROJECTS_COLLECTION, PROJECT_ID, op =>
      op.unset(p => p.userRoles[userId])
    );
  }

  /** Changes a member's role in PROJECT_ID as the backend does. */
  setRoleAsServer(userId: string, role: SFProjectRole): Promise<void> {
    const roleName: string = role;
    return this.submitJson0AsServer<SFProject>(SF_PROJECTS_COLLECTION, PROJECT_ID, op =>
      op.set(p => p.userRoles[userId], roleName)
    );
  }

  /** A rich-text op as the editor sends it. */
  textOp(textId: string, seq: number, version: number, text: string): Message {
    return {
      a: 'op',
      c: TEXTS_COLLECTION,
      d: textId,
      v: version,
      seq: seq,
      x: { source: 'Editor' },
      op: { ops: [{ insert: text }] }
    };
  }

  trainingData(dataId: string, ownerRef: string): JsonObject {
    return {
      projectRef: PROJECT_ID,
      ownerRef: ownerRef,
      dataId: dataId,
      fileUrl: `/assets/${dataId}.csv`,
      mimeType: 'text/csv',
      skipRows: 0,
      title: dataId,
      deleted: false
    };
  }

  /** The user config of a member of PROJECT_ID, as seeded. */
  userConfig(userId: string): SFProjectUserConfig {
    return createTestProjectUserConfig({ projectRef: PROJECT_ID, ownerRef: userId });
  }

  /** A question on Matthew 1:1 as the question dialog makes it. */
  question(dataId: string, ownerRef: string, text: string, projectRef: string = PROJECT_ID): Question {
    return {
      dataId: dataId,
      projectRef: projectRef,
      ownerRef: ownerRef,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      text: text,
      answers: [],
      isArchived: false,
      dateCreated: NOW,
      dateModified: NOW
    };
  }

  /** An answer as the checking page makes it (CheckingComponent.answerAction). */
  answer(dataId: string, ownerRef: string, text: string): Answer {
    return {
      dataId: dataId,
      ownerRef: ownerRef,
      text: text,
      likes: [],
      dateCreated: NOW,
      dateModified: NOW,
      deleted: false,
      comments: [],
      status: AnswerStatus.None,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      scriptureText: 'The book of the genealogy'
    };
  }

  /** A note as the editor makes it (EditorComponent.saveNote). */
  note(dataId: string, threadId: string, ownerRef: string, content: string): Note {
    return {
      dateCreated: NOW,
      dateModified: NOW,
      threadId: threadId,
      dataId: dataId,
      tagId: 1,
      ownerRef: ownerRef,
      content: content,
      conflictType: NoteConflictType.DefaultValue,
      type: NoteType.Normal,
      status: NoteStatus.Todo,
      deleted: false,
      editable: true,
      versionNumber: 1
    };
  }

  /** An open note thread on Matthew 1:1 with one note, as the editor makes it (EditorComponent.saveNote). */
  noteThread({
    dataId,
    threadId,
    noteDataId,
    ownerRef,
    publishedToSF
  }: {
    dataId: string;
    threadId: string;
    noteDataId: string;
    ownerRef: string;
    publishedToSF: boolean;
  }): NoteThread {
    return {
      dataId: dataId,
      threadId: threadId,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      projectRef: PROJECT_ID,
      ownerRef: ownerRef,
      notes: [this.note(noteDataId, threadId, ownerRef, 'First note')],
      position: { start: 0, length: 0 },
      originalContextBefore: '',
      originalSelectedText: 'The book of the genealogy',
      originalContextAfter: '',
      status: NoteStatus.Todo,
      publishedToSF: publishedToSF
    };
  }

  /** Lets the event log's asynchronous writes finish. */
  async flushLog(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  async stop(): Promise<void> {
    await Promise.all(this.clients.map(client => client.close()));
    await new Promise<void>(resolve => this.webSocketServer?.close(() => resolve()) ?? resolve());
    await new Promise<void>(resolve => this.httpServer.close(() => resolve()));
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }

  private async seed(): Promise<void> {
    const conn: Connection = this.server.connect();
    const users: string[] = [ADMIN, TRANSLATOR, CONSULTANT, COMMENTER, NON_MEMBER, PT_OBSERVER, CHECKER, SF_OBSERVER];
    for (const [index, userId] of users.entries()) {
      await createDoc<User>(conn, USERS_COLLECTION, userId, createTestUser({}, index + 1));
    }
    const userRoles: { [userId: string]: string } = {};
    for (const [userId, role] of MEMBER_ROLES) {
      userRoles[userId] = role;
    }
    await createDoc<SFProject>(
      conn,
      SF_PROJECTS_COLLECTION,
      PROJECT_ID,
      createTestProject({
        name: 'project01',
        userRoles: userRoles,
        texts: [
          {
            bookNum: 40,
            hasSource: false,
            permissions: { [ADMIN]: 'write', [TRANSLATOR]: 'write', [CONSULTANT]: 'write' },
            chapters: [
              { number: 1, lastVerse: 25, isValid: true, permissions: {} },
              { number: 2, lastVerse: 23, isValid: true, permissions: { [TRANSLATOR]: 'read' } }
            ]
          }
        ],
        paratextUsers: [
          { sfUserId: ADMIN, username: 'ptadmin', opaqueUserId: 'opaqueadmin' },
          { sfUserId: TRANSLATOR, username: 'pttranslator', opaqueUserId: 'opaquetranslator' }
        ]
      })
    );
    await createDoc<SFProject>(
      conn,
      SF_PROJECTS_COLLECTION,
      OTHER_PROJECT_ID,
      createTestProject({ name: 'project02', userRoles: { [ADMIN]: SFProjectRole.ParatextAdministrator } }, 2)
    );
    for (const userId of MEMBER_ROLES.keys()) {
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, `${PROJECT_ID}:${userId}`, this.userConfig(userId));
    }
    await createDoc(conn, TEXTS_COLLECTION, TEXT_ID, new RichText.Delta(), 'rich-text');
    await createDoc(conn, TEXTS_COLLECTION, READ_ONLY_TEXT_ID, new RichText.Delta(), 'rich-text');
    await createDoc<Question>(
      conn,
      QUESTIONS_COLLECTION,
      QUESTION_ID,
      this.question(QUESTION_DATA_ID, ADMIN, 'Whose genealogy is this?')
    );
    await createDoc<NoteThread>(
      conn,
      NOTE_THREAD_COLLECTION,
      PUBLISHED_THREAD_ID,
      this.noteThread({
        dataId: PUBLISHED_THREAD_DATA_ID,
        threadId: 'e00000000000000000000001',
        noteDataId: 'f00000000000000000000001',
        ownerRef: ADMIN,
        publishedToSF: true
      })
    );
    await createDoc<NoteThread>(
      conn,
      NOTE_THREAD_COLLECTION,
      UNPUBLISHED_THREAD_ID,
      this.noteThread({
        dataId: UNPUBLISHED_THREAD_DATA_ID,
        threadId: 'e00000000000000000000002',
        noteDataId: 'f00000000000000000000002',
        ownerRef: ADMIN,
        publishedToSF: false
      })
    );
    await createDoc<BiblicalTerm>(conn, BIBLICAL_TERM_COLLECTION, BIBLICAL_TERM_ID, {
      projectRef: PROJECT_ID,
      ownerRef: ADMIN,
      dataId: 'term01',
      termId: 'Ἀβραάμ',
      transliteration: 'Abraam',
      renderings: ['Abraham'],
      description: '',
      language: 'greek',
      links: [],
      references: [40001001],
      definitions: {}
    });
    await createDoc<TextAudio>(
      conn,
      TEXT_AUDIO_COLLECTION,
      TEXT_AUDIO_ID,
      createTestTextAudio({ projectRef: PROJECT_ID, ownerRef: ADMIN, dataId: 'MAT:1:target' })
    );
    await createDoc(conn, TRAINING_DATA_COLLECTION, ADMIN_TRAINING_DATA_ID, this.trainingData('data01', ADMIN));
    await createDoc(
      conn,
      TRAINING_DATA_COLLECTION,
      TRANSLATOR_TRAINING_DATA_ID,
      this.trainingData('data02', TRANSLATOR)
    );
    conn.close();
  }
}
