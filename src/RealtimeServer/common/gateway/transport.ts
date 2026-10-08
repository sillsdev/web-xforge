import { Duplex } from 'stream';
import ws from 'ws';
import { isPlainObject } from '../utils/type-utils';
import { FORBIDDEN_KEYS } from './decoder';
import { JsonObject, MAX_JSON_DEPTH } from './json';

/**
 * The websocket transport of the gateway. It replaces `websocket-json-stream`: it turns the frames of one websocket
 * into messages for the gateway, and gives ShareDB a stream to read the gateway's rebuilt messages from and to write
 * its replies to. It fails closed: a frame it cannot safely parse is a protocol violation, and any error in gateway
 * code closes the connection. Nothing thrown inside it reaches the process.
 */

/** The largest frame accepted, in bytes. The websocket listener sets the same limit as ws `maxPayload`. */
export const MAX_FRAME_BYTES = 5 * 1024 * 1024;

/**
 * When this many parsed messages, or messages of this many bytes, are waiting to be handled, the transport stops
 * reading from the socket.
 */
export const INBOUND_HIGH_WATER_MARK = 64;
export const INBOUND_HIGH_WATER_BYTES = 16 * 1024 * 1024;
/** Once a paused socket's waiting messages drop to this many, and this many bytes, the transport reads again. */
export const INBOUND_LOW_WATER_MARK = 16;
export const INBOUND_LOW_WATER_BYTES = 4 * 1024 * 1024;
/**
 * The most bytes of inbound messages that may wait. A paused socket can still deliver the frames ws has already read,
 * so the queue can pass the high water mark by a little; a connection whose queue passes this is closed.
 */
export const MAX_INBOUND_QUEUE_BYTES = 64 * 1024 * 1024;

/**
 * The most messages, and bytes, that may wait to be authorized and sent to the client. ShareDB writes without waiting
 * for the client, so a client that cannot keep up, or a backlog the authorizers cannot clear, would grow the queue
 * without end; a connection whose queue would pass either limit is closed (1013), and the client reconnects. One
 * message is always accepted into an empty queue, however large, so that a large reply cannot close every attempt.
 */
export const MAX_OUTBOUND_QUEUE_MESSAGES = 20_000;
export const MAX_OUTBOUND_QUEUE_BYTES = 64 * 1024 * 1024;

/** Websocket close codes the transport uses (RFC 6455 section 7.4.1). */
export const CLOSE_CODE_NORMAL = 1000;
export const CLOSE_CODE_PROTOCOL_ERROR = 1002;
/** Used only when reporting a socket that was already closed when the transport was created; never sent. */
export const CLOSE_CODE_ABNORMAL = 1006;
export const CLOSE_CODE_POLICY_VIOLATION = 1008;
export const CLOSE_CODE_INTERNAL_ERROR = 1011;
export const CLOSE_CODE_TRY_AGAIN_LATER = 1013;

/** The longest close reason a websocket close frame can carry, in UTF-8 bytes. */
export const MAX_CLOSE_REASON_BYTES = 123;

/** The close reason sent when ShareDB ends the stream, such as when its agent is closed. */
export const CLOSED_BY_SERVER_REASON = 'closed by server';
/** The close reason sent after an internal error. Details are logged, not sent to the client. */
export const INTERNAL_ERROR_REASON = 'internal error';
/** The close reason sent when a queue overflows. */
export const OVERFLOW_REASON = 'too much traffic';

/** The result of parsing one inbound frame: a message, or why the frame broke the transport rules. */
export type InboundFrameResult =
  | { readonly ok: true; readonly message: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string };

/** Reasons parseInboundFrame gives for refusing a frame. */
export const FRAME_REASON_BINARY = 'binary frame';
export const FRAME_REASON_TOO_LARGE = 'frame too large';
export const FRAME_REASON_INVALID_JSON = 'invalid JSON';
export const FRAME_REASON_TOO_DEEP = 'nested too deeply';
export const FRAME_REASON_FORBIDDEN_KEY = 'forbidden key';
export const FRAME_REASON_NOT_OBJECT = 'not a JSON object';

/**
 * Parses one websocket frame into a message, without throwing. Refuses a binary frame, a frame larger than
 * MAX_FRAME_BYTES, text that is not JSON, JSON nested more than MAX_JSON_DEPTH levels (the top-level object is level
 * 1, and each object or array inside adds 1), any object key in FORBIDDEN_KEYS at any level, and any top-level value
 * other than a plain object.
 */
export function parseInboundFrame(data: ws.RawData, isBinary: boolean): InboundFrameResult {
  if (isBinary) {
    return frameViolation(FRAME_REASON_BINARY);
  }
  if (rawDataByteLength(data) > MAX_FRAME_BYTES) {
    return frameViolation(FRAME_REASON_TOO_LARGE);
  }
  const text: string = rawDataToText(data);
  // Checked on the text first so that a deeply nested frame is refused without building the nested value.
  if (textNestingExceeds(text, MAX_JSON_DEPTH)) {
    return frameViolation(FRAME_REASON_TOO_DEEP);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return frameViolation(FRAME_REASON_INVALID_JSON);
  }
  if (!isPlainObject(parsed)) {
    return frameViolation(FRAME_REASON_NOT_OBJECT);
  }
  const problem: string | undefined = findStructureProblem(parsed);
  if (problem != null) {
    return frameViolation(problem);
  }
  return { ok: true, message: parsed };
}

/** Shortens a close reason so that it fits in a close frame, without splitting a character. */
export function truncateCloseReason(reason: string): string {
  if (Buffer.byteLength(reason, 'utf8') <= MAX_CLOSE_REASON_BYTES) {
    return reason;
  }
  let truncated: string = '';
  let byteCount: number = 0;
  // Iterating a string yields whole code points, so a surrogate pair is kept or dropped as one character.
  for (const character of reason) {
    const characterBytes: number = Buffer.byteLength(character, 'utf8');
    if (byteCount + characterBytes > MAX_CLOSE_REASON_BYTES) {
      break;
    }
    truncated += character;
    byteCount += characterBytes;
  }
  return truncated;
}

/** What the gateway does with the traffic of one connection. GatewayTransport calls these. */
export interface TransportHandlers {
  /** One parsed inbound message. Called strictly one at a time, in order; the next call waits for the returned promise. */
  handleInbound(message: Readonly<Record<string, unknown>>): Promise<void>;
  /**
   * One message ShareDB wrote, already serialized once with JSON.stringify. Called one at a time, in write order.
   * Resolves to the exact texts to send in its place, in order: usually the message itself, none to drop it, or
   * replacements the gateway built.
   */
  handleOutbound(json: string): Promise<readonly string[]>;
  /** A frame broke the transport rules. The transport closes the socket with 1008 itself after calling this. */
  handleViolation(reason: string): void;
  /** A queue passed its limit. The transport closes the socket with 1013 itself after calling this. */
  handleOverflow(reason: string): void;
  /**
   * Any exception or rejection from gateway code (including the handlers above). The transport closes with 1011 itself
   * after calling this.
   */
  handleInternalError(error: unknown): void;
  /** The socket closed (whoever closed it). Called once. */
  handleClosed(code: number, reason: string): void;
}

/** How much is waiting in a transport's outbound queue. */
export interface OutboundQueueSize {
  readonly messages: number;
  readonly bytes: number;
}

/**
 * The stream GatewayTransport gives ShareDB (`backend.listen(stream, req)`). It never sets `isServer`, so ShareDB
 * and sharedb-access treat its agent as a remote client.
 */
export class GatewayStream extends Duplex {
  /** The connection's websocket. ResourceMonitor reads its `bufferedAmount`, as it did on websocket-json-stream. */
  readonly ws: ws.WebSocket;

  constructor(
    socket: ws.WebSocket,
    private readonly onShareDbWrite: (message: unknown) => void,
    private readonly onShareDbEnd: () => void,
    private readonly outboundQueueSize: () => OutboundQueueSize
  ) {
    super({ objectMode: true });
    this.ws = socket;
  }

  /**
   * The messages ShareDB wrote that are still waiting to be authorized and sent. `_write` takes each message at once,
   * so they are not in the stream's own buffer; ResourceMonitor reads this instead.
   */
  get queuedOutbound(): OutboundQueueSize {
    return this.outboundQueueSize();
  }

  override _read(): void {
    // Messages are pushed by the transport when the gateway forwards them; there is nothing to fetch on demand.
  }

  override _write(message: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    // The callback is called at once and never with an error: the message is queued for sending, and a stream error
    // would only be an 'error' event that nothing in ShareDB listens to.
    this.onShareDbWrite(message);
    callback();
  }

  override _final(callback: (error?: Error | null) => void): void {
    callback();
    this.onShareDbEnd();
  }
}

/** A message waiting to be sent to the client. */
interface OutboundItem {
  readonly json: string;
  /** The UTF-8 length of `json`. */
  readonly bytes: number;
  /** True for text the gateway produced itself, which is sent without calling handleOutbound. */
  readonly fromGateway: boolean;
}

/** A parsed message waiting to be handled. */
interface InboundItem {
  readonly message: Readonly<Record<string, unknown>>;
  /** The size of the frame it came in. */
  readonly bytes: number;
}

/**
 * Connects one websocket to ShareDB through the gateway. Inbound frames are parsed (see parseInboundFrame) and handed
 * to `handleInbound` one at a time, in order; the gateway forwards what it accepts with `pushToShareDB`. Each message
 * ShareDB writes is serialized once and handed to `handleOutbound` one at a time, in order; whatever text that gives
 * back is sent. A rule-breaking frame closes the socket with 1008; any error in gateway code closes it with 1011.
 * When the socket closes, the stream ends and closes so that ShareDB cleans up the agent, and any work still queued
 * is dropped.
 */
export class GatewayTransport {
  /** The stream to pass to `backend.listen`. */
  readonly stream: GatewayStream;

  private readonly inboundQueue: InboundItem[] = [];
  private inboundBytes: number = 0;
  private readonly outboundQueue: OutboundItem[] = [];
  private outboundBytes: number = 0;
  private inboundRunning: boolean = false;
  private outboundRunning: boolean = false;
  private inboundPaused: boolean = false;
  private closed: boolean = false;
  private socketCloseHandled: boolean = false;

  constructor(
    private readonly socket: ws.WebSocket,
    private readonly handlers: TransportHandlers
  ) {
    this.stream = new GatewayStream(
      socket,
      (message: unknown) => this.guard(() => this.onShareDbWrite(message)),
      () => this.guard(() => this.close(CLOSE_CODE_NORMAL, CLOSED_BY_SERVER_REASON)),
      () => ({ messages: this.outboundQueue.length, bytes: this.outboundBytes })
    );
    // A Duplex emits 'error' for misuse such as a write after end, and an 'error' event without a listener would throw.
    this.stream.on('error', (error: Error) => this.guard(() => this.onStreamError(error)));
    socket.on('message', (data: ws.RawData, isBinary: boolean) => this.guard(() => this.onFrame(data, isBinary)));
    socket.on('close', (code: number, reason: Buffer) => this.guard(() => this.onSocketClose(code, reason)));
    // ws closes the socket itself after an 'error' event, and an 'error' event without a listener would throw.
    socket.on('error', () => this.guard(() => this.close(CLOSE_CODE_PROTOCOL_ERROR, 'socket error')));
    if (socket.readyState === ws.CLOSED) {
      // The socket will not emit 'close' again. Wait until the caller has handed the stream to ShareDB, so that the
      // agent sees the stream close.
      process.nextTick(() => this.guard(() => this.onSocketClose(CLOSE_CODE_ABNORMAL, Buffer.alloc(0))));
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Pushes a message for ShareDB to read (the gateway's rebuilt request). Ignored once closed. */
  pushToShareDB(message: JsonObject): void {
    this.guard(() => {
      if (this.closed) {
        return;
      }
      this.stream.push(message);
    });
  }

  /**
   * Queues text the gateway itself produced (such as an error reply), in order with ShareDB's outbound messages, sent
   * without calling handleOutbound.
   */
  sendFromGateway(json: string): void {
    this.guard(() => {
      if (this.closed) {
        return;
      }
      this.enqueueOutbound(json, true);
    });
  }

  /**
   * Closes the socket with the code and reason (reason truncated to fit the close frame). Work still queued is
   * dropped. Idempotent. `handleClosed` is called when the socket has closed.
   */
  close(code: number, reason: string): void {
    if (this.closed) {
      return;
    }
    this.markClosed();
    try {
      if (this.inboundPaused) {
        // The closing handshake needs to read the client's close frame.
        this.inboundPaused = false;
        this.socket.resume();
      }
      this.socket.close(code, truncateCloseReason(reason));
    } catch (error) {
      // For example, a close code ws does not allow. The socket must still go.
      this.reportInternalError(error);
      this.terminateSocket();
    }
  }

  private onFrame(data: ws.RawData, isBinary: boolean): void {
    if (this.closed) {
      return;
    }
    const result: InboundFrameResult = parseInboundFrame(data, isBinary);
    if (!result.ok) {
      this.violation(result.reason);
      return;
    }
    const bytes: number = rawDataByteLength(data);
    if (this.inboundBytes + bytes > MAX_INBOUND_QUEUE_BYTES) {
      this.overflow('the inbound queue is full');
      return;
    }
    this.inboundQueue.push({ message: result.message, bytes: bytes });
    this.inboundBytes += bytes;
    if (
      !this.inboundPaused &&
      (this.inboundQueue.length >= INBOUND_HIGH_WATER_MARK || this.inboundBytes >= INBOUND_HIGH_WATER_BYTES)
    ) {
      this.inboundPaused = true;
      this.socket.pause();
    }
    this.startInbound();
  }

  private startInbound(): void {
    if (this.inboundRunning) {
      return;
    }
    this.processInbound().catch((error: unknown) => this.fail(error));
  }

  /** Hands queued inbound messages to the gateway one at a time, until the queue is empty or the transport closes. */
  private async processInbound(): Promise<void> {
    this.inboundRunning = true;
    try {
      while (!this.closed) {
        const item: InboundItem | undefined = this.inboundQueue.shift();
        if (item == null) {
          break;
        }
        this.inboundBytes -= item.bytes;
        if (
          this.inboundPaused &&
          this.inboundQueue.length <= INBOUND_LOW_WATER_MARK &&
          this.inboundBytes <= INBOUND_LOW_WATER_BYTES
        ) {
          this.inboundPaused = false;
          this.socket.resume();
        }
        await this.handlers.handleInbound(item.message);
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.inboundRunning = false;
    }
  }

  private onShareDbWrite(message: unknown): void {
    if (this.closed) {
      return;
    }
    // Serialized now, while the message is as ShareDB wrote it; ShareDB may change the objects it wrote afterwards.
    const json: string | undefined = JSON.stringify(message);
    if (typeof json !== 'string') {
      throw new Error('ShareDB wrote a message that JSON cannot represent');
    }
    this.enqueueOutbound(json, false);
  }

  /** Queues a message for the client, or closes the connection if the queue would pass its limits. */
  private enqueueOutbound(json: string, fromGateway: boolean): void {
    const bytes: number = Buffer.byteLength(json, 'utf8');
    const queued: number = this.outboundQueue.length;
    if (
      queued >= MAX_OUTBOUND_QUEUE_MESSAGES ||
      (queued > 0 && this.outboundBytes + bytes > MAX_OUTBOUND_QUEUE_BYTES)
    ) {
      this.overflow(`the outbound queue is full (${queued} messages, ${this.outboundBytes} bytes)`);
      return;
    }
    this.outboundQueue.push({ json: json, bytes: bytes, fromGateway: fromGateway });
    this.outboundBytes += bytes;
    this.startOutbound();
  }

  private startOutbound(): void {
    if (this.outboundRunning) {
      return;
    }
    this.processOutbound().catch((error: unknown) => this.fail(error));
  }

  /** Sends queued outbound messages one at a time, until the queue is empty or the transport closes. */
  private async processOutbound(): Promise<void> {
    this.outboundRunning = true;
    try {
      while (!this.closed) {
        const item: OutboundItem | undefined = this.outboundQueue.shift();
        if (item == null) {
          break;
        }
        this.outboundBytes -= item.bytes;
        const texts: readonly string[] = item.fromGateway ? [item.json] : await this.handlers.handleOutbound(item.json);
        if (this.closed) {
          break;
        }
        for (const text of texts) {
          this.sendText(text);
        }
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.outboundRunning = false;
    }
  }

  private sendText(text: string): void {
    if (this.socket.readyState !== ws.OPEN) {
      return;
    }
    // A failed send means the socket is going away. Its 'close' event does the cleanup, so the error is ignored.
    this.socket.send(text, () => {});
  }

  private onStreamError(error: Error): void {
    if (this.closed || this.stream.writableEnded) {
      // Expected: ShareDB can write after it ended the stream or after the connection closed, until its agent has
      // cleaned up. Ending the stream closes the connection anyway.
      return;
    }
    this.fail(error);
  }

  private onSocketClose(code: number, reason: Buffer): void {
    if (this.socketCloseHandled) {
      return;
    }
    this.socketCloseHandled = true;
    this.markClosed();
    try {
      this.handlers.handleClosed(code, reason.toString('utf8'));
    } catch (error) {
      this.reportInternalError(error);
    }
    // ShareDB's agent cleans up when its stream emits 'end' or 'close'. Destroying the stream emits 'close'.
    this.stream.push(null);
    this.stream.destroy();
  }

  private violation(reason: string): void {
    try {
      this.handlers.handleViolation(reason);
    } catch (error) {
      this.reportInternalError(error);
    }
    this.close(CLOSE_CODE_POLICY_VIOLATION, reason);
  }

  private overflow(reason: string): void {
    try {
      this.handlers.handleOverflow(reason);
    } catch (error) {
      this.reportInternalError(error);
    }
    this.close(CLOSE_CODE_TRY_AGAIN_LATER, OVERFLOW_REASON);
  }

  /** Reports an error from gateway code and closes the connection. Never throws. */
  private fail(error: unknown): void {
    this.reportInternalError(error);
    try {
      this.close(CLOSE_CODE_INTERNAL_ERROR, INTERNAL_ERROR_REASON);
    } catch (closeError) {
      console.error('Gateway transport: error while closing the socket', closeError);
    }
  }

  /** Runs an event handler body, turning anything it throws into an internal error. Never throws. */
  private guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.fail(error);
    }
  }

  private reportInternalError(error: unknown): void {
    try {
      this.handlers.handleInternalError(error);
    } catch (handlerError) {
      console.error('Gateway transport: handleInternalError threw', handlerError, 'while reporting', error);
    }
  }

  private markClosed(): void {
    this.closed = true;
    this.inboundQueue.length = 0;
    this.inboundBytes = 0;
    this.outboundQueue.length = 0;
    this.outboundBytes = 0;
  }

  private terminateSocket(): void {
    try {
      this.socket.terminate();
    } catch (error) {
      console.error('Gateway transport: could not terminate the socket', error);
    }
  }
}

function frameViolation(reason: string): InboundFrameResult {
  return { ok: false, reason: reason };
}

function rawDataByteLength(data: ws.RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total: number, fragment: Buffer) => total + fragment.length, 0);
  }
  if (Buffer.isBuffer(data)) {
    return data.length;
  }
  return data.byteLength;
}

function rawDataToText(data: ws.RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  return Buffer.from(data).toString('utf8');
}

const QUOTE: number = '"'.charCodeAt(0);
const BACKSLASH: number = '\\'.charCodeAt(0);
const OPEN_BRACE: number = '{'.charCodeAt(0);
const CLOSE_BRACE: number = '}'.charCodeAt(0);
const OPEN_BRACKET: number = '['.charCodeAt(0);
const CLOSE_BRACKET: number = ']'.charCodeAt(0);

/**
 * Whether objects and arrays in JSON text nest more than `maxDepth` levels. Brackets inside strings are skipped. For
 * text that is not valid JSON the answer does not matter, because JSON.parse refuses it anyway.
 */
function textNestingExceeds(text: string, maxDepth: number): boolean {
  let depth: number = 0;
  let inString: boolean = false;
  for (let index = 0; index < text.length; index++) {
    const code: number = text.charCodeAt(index);
    if (inString) {
      if (code === BACKSLASH) {
        // Skip the escaped character, which may be a quote.
        index++;
      } else if (code === QUOTE) {
        inString = false;
      }
    } else if (code === QUOTE) {
      inString = true;
    } else if (code === OPEN_BRACE || code === OPEN_BRACKET) {
      depth++;
      if (depth > maxDepth) {
        return true;
      }
    } else if (code === CLOSE_BRACE || code === CLOSE_BRACKET) {
      depth--;
    }
  }
  return false;
}

/** A value still to be checked by findStructureProblem, and how deeply it is nested (the top-level object is 1). */
interface PendingValue {
  readonly value: unknown;
  readonly depth: number;
}

/**
 * Walks a parsed message without recursion and gives the reason it breaks the rules, if it does: a key in
 * FORBIDDEN_KEYS anywhere, or nesting deeper than MAX_JSON_DEPTH. JSON.parse makes even `"__proto__"` an ordinary own
 * property, so the keys are all visible to Object.keys.
 */
function findStructureProblem(message: Readonly<Record<string, unknown>>): string | undefined {
  const pending: PendingValue[] = [{ value: message, depth: 1 }];
  for (let item: PendingValue | undefined = pending.pop(); item != null; item = pending.pop()) {
    if (item.depth > MAX_JSON_DEPTH) {
      return FRAME_REASON_TOO_DEEP;
    }
    const childDepth: number = item.depth + 1;
    if (Array.isArray(item.value)) {
      const elements: readonly unknown[] = item.value;
      for (const element of elements) {
        if (typeof element === 'object' && element !== null) {
          pending.push({ value: element, depth: childDepth });
        }
      }
    } else if (typeof item.value === 'object' && item.value !== null) {
      const entries: [string, unknown][] = Object.entries(item.value);
      for (const [key, child] of entries) {
        if (FORBIDDEN_KEYS.includes(key)) {
          return FRAME_REASON_FORBIDDEN_KEY;
        }
        if (typeof child === 'object' && child !== null) {
          pending.push({ value: child, depth: childDepth });
        }
      }
    }
  }
  return undefined;
}
