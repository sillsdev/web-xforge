import http from 'http';
import ShareDB from 'sharedb';
import { WebSocket } from 'ws';
import { ExceptionReporter } from '../exception-reporter';
import { RealtimeServer, XF_ROLE_CLAIM, XF_USER_ID_CLAIM } from '../realtime-server';
import { hasOwnProp, hasProp, isObj } from '../utils/type-utils';
import { GatewayPolicies, GatewaySession, GatewayWrite, GatewayWriteChange, WriteDecision } from './authorization';
import { LegacySrcBindings, SrcAuthority } from './connection-src';
import { DecodeResult, Decoder, ROOT_PATH } from './decoder';
import {
  CLOSE_CODE_POLICY_VIOLATION,
  CLOSE_CODE_TOKEN_EXPIRED,
  GATEWAY_REFUSED_CODE,
  GatewayConnection,
  PERMISSION_DENIED_MESSAGE,
  MAX_ENDED_SUBSCRIPTIONS,
  MAX_PENDING_REQUESTS
} from './gateway-connection';
import { ConnectionEventLog, GatewayEventLog, GatewayEventSink } from './gateway-event-log';
import { OpEdit } from './inbound-messages';
import { JsonObject, jsonObject } from './json';
import { opEditDecoder } from './op-content-decoders';
import { CollectionProtocol, GatewayProtocolConfig } from './protocol-config';
import { GatewayTransport } from './transport';

/** Everything a RealtimeGateway is made from. */
export interface RealtimeGatewayOptions {
  /** The server whose clients the gateway stands in front of. */
  readonly backend: RealtimeServer;
  readonly protocol: GatewayProtocolConfig;
  readonly policies: GatewayPolicies;
  /** The key connection srcs are signed with (see connection-src.ts). */
  readonly srcKey: Buffer;
  readonly eventSink: GatewayEventSink;
  readonly exceptionReporter?: ExceptionReporter;
  /** The current time in milliseconds. Tests replace it to check token expiry. */
  readonly now?: () => number;
  /** How many ended subscriptions of each kind a connection remembers. Defaults to MAX_ENDED_SUBSCRIPTIONS. */
  readonly maxEndedSubscriptions?: number;
  /** How many requests a connection may have waiting for replies. Defaults to MAX_PENDING_REQUESTS. */
  readonly maxPendingRequests?: number;
}

/** A session and when its access token expires, from a verified token's claims. */
export interface VerifiedClaims {
  readonly session: GatewaySession;
  readonly expiresAtMs: number;
}

/**
 * The realtime gateway: an access-control layer between every client websocket and ShareDB, in addition to the
 * server's own access rules. WebSocketStreamListener hands it each accepted socket. The gateway also registers ShareDB
 * middleware for what only the server sees, such as the write hook. See README.md in this directory.
 *
 * Construct one per RealtimeServer and share it between listeners.
 */
export class RealtimeGateway {
  /** The connection of each agent the gateway created. Agents are only ever added, and are dropped with the agent. */
  private readonly connections = new WeakMap<ShareDB.Agent, GatewayConnection>();
  private readonly srcAuthority: SrcAuthority;
  private readonly legacySrcBindings: LegacySrcBindings = new LegacySrcBindings();
  private readonly eventLog: GatewayEventLog;
  private readonly now: () => number;

  constructor(private readonly options: RealtimeGatewayOptions) {
    this.srcAuthority = new SrcAuthority(options.srcKey);
    this.eventLog = new GatewayEventLog(options.eventSink);
    this.now = options.now ?? Date.now;
    options.backend.use('apply', (context: ShareDB.middleware.ApplyContext, next: (err?: unknown) => void) => {
      // `next` continues ShareDB's submit synchronously, so it is called outside the promise chain's handlers: an
      // exception it throws must not turn into an unhandled rejection.
      const proceed = (allowed: boolean): void => {
        try {
          // ShareDB replies with the code and message of an error object, so the client gets the same code and message
          // as for the gateway's other refusals. The ShareDB client handles every code but a few of its own alike: it
          // rolls the op back and reports the error.
          next(allowed ? undefined : { code: GATEWAY_REFUSED_CODE, message: PERMISSION_DENIED_MESSAGE });
        } catch (error) {
          this.reportError(error);
        }
      };
      this.applyWriteHook(context)
        .catch((error: unknown) => {
          this.reportError(error);
          this.connectionOf(context)?.logWriteDecision(
            'internal-error',
            `the write could not be checked: ${String(error)}`,
            context.collection,
            context.id
          );
          return false;
        })
        .then(proceed)
        .catch((error: unknown) => this.reportError(error));
    });
  }

  /**
   * Takes over a websocket that WebSocketStreamListener accepted, whose access token it verified and stored as
   * `req.user`. Never throws.
   */
  acceptConnection(socket: WebSocket, req: http.IncomingMessage): void {
    try {
      const claims: VerifiedClaims | undefined = decodeVerifiedClaims(req);
      if (claims == null) {
        socket.close(CLOSE_CODE_POLICY_VIOLATION, 'invalid access token claims');
        return;
      }
      const log: ConnectionEventLog = this.eventLog.forConnection({
        userId: claims.session.userId,
        src: '',
        remoteAddress: remoteAddressOf(req),
        origin: typeof req.headers.origin === 'string' ? req.headers.origin : null
      });
      if (claims.expiresAtMs <= this.now()) {
        log.log('token-expired', { reason: 'access token expired before the connection opened' });
        socket.close(CLOSE_CODE_TOKEN_EXPIRED, 'token expired');
        return;
      }
      const connection = new GatewayConnection(
        {
          protocol: this.options.protocol,
          policies: this.options.policies,
          srcAuthority: this.srcAuthority,
          legacySrcBindings: this.legacySrcBindings,
          now: this.now,
          maxEndedSubscriptions: this.options.maxEndedSubscriptions ?? MAX_ENDED_SUBSCRIPTIONS,
          maxPendingRequests: this.options.maxPendingRequests ?? MAX_PENDING_REQUESTS
        },
        claims.session,
        claims.expiresAtMs,
        log
      );
      const transport = new GatewayTransport(socket, connection);
      connection.start(transport, () => {
        const agent: ShareDB.Agent = this.options.backend.listen(transport.stream, req);
        this.connections.set(agent, connection);
        return agent;
      });
    } catch (error) {
      this.options.exceptionReporter?.report(String(error));
      try {
        socket.terminate();
      } catch {
        // The socket is unusable either way.
      }
    }
  }

  private reportError(error: unknown): void {
    try {
      this.options.exceptionReporter?.report(String(error));
    } catch {
      // Reporting is best effort.
    }
  }

  /**
   * The gateway's `apply` middleware. Resolves to whether the op may be applied, and logs a refusal with the connection
   * the op came from. Ops from in-process server connections are not the gateway's concern; ops from any other
   * connection the gateway did not create are refused.
   */
  private async applyWriteHook(context: ShareDB.middleware.ApplyContext): Promise<boolean> {
    const agent: ShareDB.Agent | undefined = context.agent;
    if (agent == null) {
      this.reportError(`The gateway refused an op on ${context.collection}/${context.id} that has no connection.`);
      return false;
    }
    const connection: GatewayConnection | undefined = this.connections.get(agent);
    if (connection == null) {
      if (isServerStream(agent.stream)) {
        return true;
      }
      this.reportError(`The gateway refused an op on ${context.collection}/${context.id} from an unknown connection.`);
      return false;
    }
    const write: GatewayWrite | string = this.decodeWrite(context);
    const decision: WriteDecision =
      typeof write === 'string'
        ? { kind: 'refused', reason: write }
        : await this.options.policies.writeHook.authorize(write, connection.session);
    if (decision.kind === 'allowed') {
      return true;
    }
    connection.logWriteDecision('refused', decision.reason, context.collection, context.id);
    return false;
  }

  /** The gateway connection an apply context's op came from, if the gateway made it. */
  private connectionOf(context: ShareDB.middleware.ApplyContext): GatewayConnection | undefined {
    return context.agent == null ? undefined : this.connections.get(context.agent);
  }

  /** The write the apply context describes, or why it cannot be described. */
  private decodeWrite(context: ShareDB.middleware.ApplyContext): GatewayWrite | string {
    const snapshot: ShareDB.Snapshot | null = context.snapshot;
    if (snapshot == null) {
      return 'The op has no snapshot to apply to.';
    }
    // ShareDB hands over live objects: a transformed rich-text op is a Delta instance, for example. A JSON copy is
    // exactly the data the op will be stored as, and is what the decoders accept.
    let op: unknown;
    try {
      op = JSON.parse(JSON.stringify(context.op));
    } catch {
      return 'The op cannot be serialized.';
    }
    let change: GatewayWriteChange;
    if (hasOwnProp(op, 'create') && op.create != null) {
      const create: unknown = op.create;
      if (!hasOwnProp(create, 'type') || typeof create.type !== 'string' || !hasOwnProp(create, 'data')) {
        return 'The create op is malformed.';
      }
      const data: DecodeResult<JsonObject> = jsonObject()(create.data, ROOT_PATH);
      if (!data.ok) {
        return 'The created data is not a JSON object.';
      }
      change = { kind: 'create', type: create.type, data: data.value };
    } else if (hasOwnProp(op, 'del') && op.del === true) {
      change = { kind: 'delete' };
    } else if (hasOwnProp(op, 'op')) {
      // The collection's protocol is looked up by the name the client addressed, which may be a projection.
      const protocol: CollectionProtocol | undefined = this.options.protocol.collections.get(context.index);
      if (protocol == null) {
        return 'The op is for a collection the gateway does not serve.';
      }
      // Transforming against concurrent ops can turn a client's component into a list replace, so it is accepted here.
      const decoder: Decoder<OpEdit> = opEditDecoder(protocol.otType, { allowListReplace: true });
      const edit: DecodeResult<OpEdit> = decoder(op.op, ROOT_PATH);
      if (!edit.ok) {
        return 'The op does not have a shape the gateway can check.';
      }
      change = { kind: 'edit', edit: edit.value };
    } else {
      return 'The op has no change.';
    }
    return {
      collection: context.collection,
      addressedAs: context.index,
      docId: context.id,
      change: change,
      snapshot: { version: snapshot.v, type: snapshot.type, data: snapshot.data }
    };
  }
}

/** Whether a stream is ShareDB's in-process stream for a server connection (Backend.connect). */
function isServerStream(stream: unknown): boolean {
  // ShareDB's ServerStream declares isServer on its prototype, so an own-property check would miss it. Streams are
  // made by ShareDB or the gateway, never by a client, and the gateway's own stream never has isServer.
  return isObj(stream) && hasProp(stream, 'isServer') && stream.isServer === true;
}

/**
 * The session and expiry from the claims WebSocketStreamListener verified and stored as `req.user`. The token must
 * name a user and an expiry; the role claim is a string or a list of strings, as in RealtimeServer.setConnectSession.
 */
export function decodeVerifiedClaims(req: unknown): VerifiedClaims | undefined {
  if (!hasOwnProp(req, 'user')) {
    return undefined;
  }
  const claims: unknown = req.user;
  if (!isObj(claims) || !hasOwnProp(claims, XF_USER_ID_CLAIM) || !hasOwnProp(claims, 'exp')) {
    return undefined;
  }
  const userId: unknown = claims[XF_USER_ID_CLAIM];
  const expiresAtSeconds: unknown = claims.exp;
  if (typeof userId !== 'string' || userId === '' || typeof expiresAtSeconds !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(expiresAtSeconds)) {
    return undefined;
  }
  let systemRoles: string[];
  const roleClaim: unknown = hasOwnProp(claims, XF_ROLE_CLAIM) ? claims[XF_ROLE_CLAIM] : undefined;
  if (roleClaim == null) {
    systemRoles = [];
  } else if (typeof roleClaim === 'string') {
    systemRoles = [roleClaim];
  } else if (Array.isArray(roleClaim) && roleClaim.every((role: unknown) => typeof role === 'string')) {
    systemRoles = roleClaim.filter((role: unknown): role is string => typeof role === 'string');
  } else {
    return undefined;
  }
  return { session: { userId: userId, systemRoles: systemRoles }, expiresAtMs: expiresAtSeconds * 1000 };
}

/** The client's address for logs: the first address a proxy forwarded for, or else the socket's peer. */
function remoteAddressOf(req: http.IncomingMessage): string | null {
  const forwardedFor: string | string[] | undefined = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor !== '') {
    return forwardedFor.split(',')[0].trim().slice(0, 64);
  }
  return req.socket.remoteAddress ?? null;
}
