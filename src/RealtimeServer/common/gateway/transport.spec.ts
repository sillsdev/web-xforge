import 'jest-expect-message';
import { AddressInfo } from 'net';
import ws from 'ws';
import { MAX_JSON_DEPTH } from './json';
import {
  CLOSE_CODE_INTERNAL_ERROR,
  CLOSE_CODE_NORMAL,
  CLOSE_CODE_POLICY_VIOLATION,
  CLOSE_CODE_TRY_AGAIN_LATER,
  CLOSED_BY_SERVER_REASON,
  FRAME_REASON_BINARY,
  FRAME_REASON_FORBIDDEN_KEY,
  FRAME_REASON_INVALID_JSON,
  FRAME_REASON_NOT_OBJECT,
  FRAME_REASON_TOO_DEEP,
  FRAME_REASON_TOO_LARGE,
  GatewayStream,
  GatewayTransport,
  INBOUND_HIGH_WATER_BYTES,
  INBOUND_HIGH_WATER_MARK,
  MAX_CLOSE_REASON_BYTES,
  MAX_FRAME_BYTES,
  MAX_OUTBOUND_QUEUE_BYTES,
  MAX_OUTBOUND_QUEUE_MESSAGES,
  OUTBOUND_HIGH_WATER_BYTES,
  parseInboundFrame,
  TransportHandlers,
  truncateCloseReason
} from './transport';

describe('parseInboundFrame', () => {
  it('accepts a JSON object in a text frame', () => {
    const text: string = '{"a":"hs","id":null,"protocol":1,"protocolMinor":2}';
    const expected: Record<string, unknown> = { a: 'hs', id: null, protocol: 1, protocolMinor: 2 };
    expect(parseInboundFrame(Buffer.from(text), false)).toEqual({ ok: true, message: expected });
    expect(parseInboundFrame(new Uint8Array(Buffer.from(text)).buffer, false)).toEqual({ ok: true, message: expected });
    const fragments: Buffer[] = [Buffer.from(text.slice(0, 10)), Buffer.from(text.slice(10))];
    expect(parseInboundFrame(fragments, false)).toEqual({ ok: true, message: expected });
  });

  it('refuses a binary frame', () => {
    expect(parseInboundFrame(Buffer.from('{}'), true)).toEqual({ ok: false, reason: FRAME_REASON_BINARY });
  });

  it('refuses a frame larger than MAX_FRAME_BYTES', () => {
    const atLimit: string = `{"a":"${'x'.repeat(MAX_FRAME_BYTES - 8)}"}`;
    expect(Buffer.byteLength(atLimit)).toBe(MAX_FRAME_BYTES);
    expect(parseInboundFrame(Buffer.from(atLimit), false).ok).toBe(true);

    const overLimit: string = `{"a":"${'x'.repeat(MAX_FRAME_BYTES - 7)}"}`;
    expect(parseInboundFrame(Buffer.from(overLimit), false)).toEqual({ ok: false, reason: FRAME_REASON_TOO_LARGE });
    const fragments: Buffer[] = [Buffer.from(overLimit.slice(0, 100)), Buffer.from(overLimit.slice(100))];
    expect(parseInboundFrame(fragments, false)).toEqual({ ok: false, reason: FRAME_REASON_TOO_LARGE });
  });

  it('refuses text that is not JSON', () => {
    for (const text of ['', '{', '{"a":}', "{'a':1}", '{"a":1}x', 'undefined', '{"a":NaN}']) {
      expect(parseInboundFrame(Buffer.from(text), false), text).toEqual({
        ok: false,
        reason: FRAME_REASON_INVALID_JSON
      });
    }
  });

  it('accepts nesting up to MAX_JSON_DEPTH and refuses deeper nesting', () => {
    const env = new ParseTestEnvironment();
    expect(MAX_JSON_DEPTH).toBe(32);
    expect(parseInboundFrame(Buffer.from(env.nestedObject(32)), false).ok).toBe(true);
    expect(parseInboundFrame(Buffer.from(env.nestedObject(33)), false)).toEqual({
      ok: false,
      reason: FRAME_REASON_TOO_DEEP
    });
    // Arrays count as levels too. The object plus 31 arrays is 32 levels.
    expect(parseInboundFrame(Buffer.from(env.objectWithNestedArrays(31)), false).ok).toBe(true);
    expect(parseInboundFrame(Buffer.from(env.objectWithNestedArrays(32)), false)).toEqual({
      ok: false,
      reason: FRAME_REASON_TOO_DEEP
    });
  });

  it('does not count brackets inside strings as nesting', () => {
    const text: string = JSON.stringify({ a: '[[[[{{{{'.repeat(100), b: 'quote \\" [ {' });
    expect(parseInboundFrame(Buffer.from(text), false).ok).toBe(true);
  });

  it('refuses extremely deep nesting without overflowing the stack', () => {
    const depth: number = 100_000;
    const arrays: string = '{"a":' + '['.repeat(depth) + ']'.repeat(depth) + '}';
    expect(parseInboundFrame(Buffer.from(arrays), false)).toEqual({ ok: false, reason: FRAME_REASON_TOO_DEEP });
    const unclosed: string = '{"a":' + '{"b":'.repeat(depth);
    expect(parseInboundFrame(Buffer.from(unclosed), false)).toEqual({ ok: false, reason: FRAME_REASON_TOO_DEEP });
  });

  it('refuses forbidden keys anywhere', () => {
    const texts: string[] = [
      '{"__proto__":{"isAdmin":true}}',
      '{"constructor":1}',
      '{"prototype":1}',
      '{"a":{"b":{"__proto__":1}}}',
      '{"a":[1,{"constructor":{}}]}',
      '{"a":[[[{"prototype":null}]]]}',
      // An escaped key is the same key once parsed.
      '{"a":{"__proto\\u005f_":1}}'
    ];
    for (const text of texts) {
      expect(parseInboundFrame(Buffer.from(text), false), text).toEqual({
        ok: false,
        reason: FRAME_REASON_FORBIDDEN_KEY
      });
    }
  });

  it('accepts forbidden words as values', () => {
    const text: string = '{"a":"__proto__","b":["constructor"],"c":{"d":"prototype"}}';
    expect(parseInboundFrame(Buffer.from(text), false).ok).toBe(true);
  });

  it('refuses a top-level value that is not an object', () => {
    for (const text of ['[]', '[{"a":1}]', 'null', '1', '"a"', 'true']) {
      expect(parseInboundFrame(Buffer.from(text), false), text).toEqual({
        ok: false,
        reason: FRAME_REASON_NOT_OBJECT
      });
    }
  });
});

describe('truncateCloseReason', () => {
  it('keeps short reasons and cuts long ones at a character boundary', () => {
    expect(truncateCloseReason('short')).toBe('short');
    expect(Buffer.byteLength(truncateCloseReason('x'.repeat(300)))).toBe(MAX_CLOSE_REASON_BYTES);
    // Each of these characters is 4 bytes in UTF-8; 123 bytes hold 30 of them.
    const truncated: string = truncateCloseReason('😀'.repeat(100));
    expect(truncated).toBe('😀'.repeat(30));
  });
});

describe('GatewayTransport', () => {
  const environments: TransportTestEnvironment[] = [];

  afterEach(async () => {
    await Promise.all(environments.map(env => env.dispose()));
    environments.length = 0;
  });

  async function connect(handlers: Partial<TransportHandlers> = {}): Promise<TransportTestEnvironment> {
    const env: TransportTestEnvironment = new TransportTestEnvironment(handlers);
    environments.push(env);
    await env.connect();
    return env;
  }

  it('hands inbound messages to the handler one at a time, in order', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    let running: number = 0;
    let maxRunning: number = 0;
    const env = await connect({
      handleInbound: async (message: Readonly<Record<string, unknown>>) => {
        const n: number = Number(message.n);
        started.push(n);
        running++;
        maxRunning = Math.max(maxRunning, running);
        // Earlier messages take longer, so any overlap would finish them out of order.
        await env.delay(10 - n);
        running--;
        finished.push(n);
      }
    });
    for (let n = 0; n < 10; n++) {
      env.client.send(JSON.stringify({ n: n }));
    }

    // SUT
    await env.waitFor(() => finished.length === 10);

    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(finished).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxRunning).toBe(1);
    expect(env.handlers.handleInternalError).not.toHaveBeenCalled();
  });

  it('passes messages the gateway pushes on to the stream', async () => {
    const env = await connect();
    const received: unknown[] = [];
    env.transport.stream.on('data', (chunk: unknown) => received.push(chunk));

    env.transport.pushToShareDB({ a: 'f', c: 'texts', d: 'p1:MAT:1:target', v: null });

    // A stream starts flowing on the tick after its first 'data' listener is added.
    await env.delay(0);
    expect(received).toEqual([{ a: 'f', c: 'texts', d: 'p1:MAT:1:target', v: null }]);
  });

  it('exposes the websocket on the stream and never sets isServer', async () => {
    const env = await connect();
    expect(env.transport.stream).toBeInstanceOf(GatewayStream);
    expect(env.transport.stream.ws).toBe(env.serverSocket);
    expect((env.transport.stream as unknown as { isServer?: unknown }).isServer).toBeUndefined();
  });

  it('sends outbound messages in write order, mixed with gateway messages', async () => {
    const seen: string[] = [];
    const env = await connect({
      handleOutbound: async (json: string) => {
        seen.push(json);
        const message: { n: number } = JSON.parse(json);
        // Earlier messages take longer, so any overlap would send them out of order.
        await env.delay(5 - (message.n % 5));
        return [JSON.stringify({ n: message.n, checked: true })];
      }
    });
    const stream: GatewayStream = env.transport.stream;
    stream.write({ n: 0 });
    stream.write({ n: 1 });
    env.transport.sendFromGateway('{"gateway":1}');
    stream.write({ n: 2 });
    env.transport.sendFromGateway('{"gateway":2}');

    // SUT
    await env.waitFor(() => env.clientMessages.length === 5);

    expect(env.clientMessages).toEqual([
      '{"n":0,"checked":true}',
      '{"n":1,"checked":true}',
      '{"gateway":1}',
      '{"n":2,"checked":true}',
      '{"gateway":2}'
    ]);
    // Gateway messages do not go through handleOutbound.
    expect(seen).toEqual(['{"n":0}', '{"n":1}', '{"n":2}']);
  });

  it('serializes what ShareDB writes when it is written', async () => {
    let release: () => void = () => {};
    const blocked: Promise<void> = new Promise<void>(resolve => (release = resolve));
    const env = await connect({
      handleOutbound: async (json: string) => {
        await blocked;
        return [json];
      }
    });
    const message: { v: number } = { v: 1 };
    env.transport.stream.write(message);
    message.v = 2;
    env.transport.stream.write(message);
    release();

    await env.waitFor(() => env.clientMessages.length === 2);
    expect(env.clientMessages).toEqual(['{"v":1}', '{"v":2}']);
  });

  it('drops a message when handleOutbound gives no text, and sends every text it gives', async () => {
    const env = await connect({
      handleOutbound: async (json: string) =>
        json.includes('secret') ? [] : json.includes('twice') ? [json, json] : [json]
    });
    env.transport.stream.write({ a: 1 });
    env.transport.stream.write({ secret: true });
    env.transport.stream.write({ twice: true });

    await env.waitFor(() => env.clientMessages.length === 3);
    await env.delay(10);
    expect(env.clientMessages).toEqual(['{"a":1}', '{"twice":true}', '{"twice":true}']);
  });

  it('closes the socket when ShareDB ends the stream', async () => {
    const env = await connect();
    const streamClosed: Promise<void> = env.streamEvent('close');

    // SUT
    env.transport.stream.end();

    expect(await env.clientClosed).toEqual({ code: CLOSE_CODE_NORMAL, reason: CLOSED_BY_SERVER_REASON });
    await streamClosed;
    expect(env.transport.isClosed).toBe(true);
    expect(env.handlers.handleClosed).toHaveBeenCalledTimes(1);
    expect(env.handlers.handleInternalError).not.toHaveBeenCalled();
  });

  it('ends and closes the stream when the client closes', async () => {
    const env = await connect();
    const streamClosed: Promise<void> = env.streamEvent('close');

    // SUT
    env.client.close(4000, 'bye');

    await streamClosed;
    expect(env.transport.isClosed).toBe(true);
    expect(env.transport.stream.destroyed).toBe(true);
    expect(env.handlers.handleClosed).toHaveBeenCalledTimes(1);
    expect(env.handlers.handleClosed).toHaveBeenCalledWith(4000, 'bye');
    // Writes from ShareDB that race the close are ignored without an error.
    env.transport.stream.write({ a: 'late' });
    env.transport.pushToShareDB({ a: 'late' });
    env.transport.sendFromGateway('{}');
    await env.delay(10);
    expect(env.handlers.handleInternalError).not.toHaveBeenCalled();
  });

  it('closes with 1008 after a frame that breaks the rules', async () => {
    const env = await connect();
    env.client.send(Buffer.from('{}'), { binary: true });

    expect(await env.clientClosed).toEqual({ code: CLOSE_CODE_POLICY_VIOLATION, reason: FRAME_REASON_BINARY });
    expect(env.handlers.handleViolation).toHaveBeenCalledWith(FRAME_REASON_BINARY);
    expect(env.handlers.handleInbound).not.toHaveBeenCalled();
  });

  it('drops queued inbound messages once closed', async () => {
    const handled: unknown[] = [];
    const env = await connect({
      handleInbound: async (message: Readonly<Record<string, unknown>>) => {
        handled.push(message.n);
        if (message.n === 0) {
          env.transport.close(CLOSE_CODE_POLICY_VIOLATION, 'stop');
        }
      }
    });
    env.client.send('{"n":0}');
    env.client.send('{"n":1}');

    expect(await env.clientClosed).toEqual({ code: CLOSE_CODE_POLICY_VIOLATION, reason: 'stop' });
    expect(handled).toEqual([0]);
  });

  it('truncates a long close reason', async () => {
    const env = await connect();
    env.transport.close(CLOSE_CODE_POLICY_VIOLATION, 'x'.repeat(500));

    const closed: { code: number; reason: string } = await env.clientClosed;
    expect(closed.code).toBe(CLOSE_CODE_POLICY_VIOLATION);
    expect(closed.reason).toBe('x'.repeat(MAX_CLOSE_REASON_BYTES));
  });

  it('closes with 1011 when a handler throws or rejects, and nothing escapes', async () => {
    // Nothing escaping is checked by jest itself: it fails the running test on an unhandled rejection or an uncaught
    // exception. (Listeners added to `process` inside a jest test do not receive those events.)
    // The transport reports a throwing handleInternalError to the console.
    const consoleError: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failures: Partial<TransportHandlers>[] = [
      {
        handleInbound: () => {
          throw new Error('sync inbound');
        }
      },
      { handleInbound: async () => Promise.reject(new Error('async inbound')) },
      { handleOutbound: async () => Promise.reject(new Error('async outbound')) },
      {
        handleOutbound: () => {
          throw new Error('sync outbound');
        }
      },
      {
        handleInbound: async () => Promise.reject(new Error('inbound')),
        handleInternalError: () => {
          throw new Error('handleInternalError also fails');
        }
      }
    ];
    for (const handlers of failures) {
      const env = await connect(handlers);
      env.client.send('{"a":1}');
      env.transport.stream.write({ a: 1 });

      // SUT
      const closed: { code: number; reason: string } = await env.clientClosed;

      expect(closed.code).toBe(CLOSE_CODE_INTERNAL_ERROR);
      expect(env.handlers.handleInternalError).toHaveBeenCalled();
    }
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('treats a message JSON cannot serialize as an internal error', async () => {
    const env = await connect();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    env.transport.stream.write(circular);

    expect((await env.clientClosed).code).toBe(CLOSE_CODE_INTERNAL_ERROR);
    expect(env.handlers.handleInternalError).toHaveBeenCalledTimes(1);
  });

  it('survives a throwing handleClosed', async () => {
    const env = await connect({
      handleClosed: () => {
        throw new Error('handleClosed fails');
      }
    });
    const streamClosed: Promise<void> = env.streamEvent('close');
    env.client.close();

    await streamClosed;
    expect(env.handlers.handleInternalError).toHaveBeenCalledTimes(1);
  });

  it('pauses the socket while many messages wait, and resumes once they are handled', async () => {
    let release: () => void = () => {};
    const blocked: Promise<void> = new Promise<void>(resolve => (release = resolve));
    let handledCount: number = 0;
    const env = await connect({
      handleInbound: async () => {
        await blocked;
        handledCount++;
      }
    });
    const total: number = INBOUND_HIGH_WATER_MARK + 10;
    for (let n = 0; n < total; n++) {
      env.client.send(JSON.stringify({ n: n }));
    }

    // SUT
    await env.waitFor(() => env.serverSocket.isPaused);
    release();
    await env.waitFor(() => handledCount === total);

    expect(env.serverSocket.isPaused).toBe(false);
    expect(env.transport.isClosed).toBe(false);
  });
});

describe('GatewayTransport queue limits', () => {
  const environments: TransportTestEnvironment[] = [];

  afterEach(async () => {
    await Promise.all(environments.map(env => env.dispose()));
    environments.length = 0;
  });

  async function connect(handlers: Partial<TransportHandlers> = {}): Promise<TransportTestEnvironment> {
    const env: TransportTestEnvironment = new TransportTestEnvironment(handlers);
    environments.push(env);
    await env.connect();
    return env;
  }

  it('pauses the socket while a few large messages wait, by their size', async () => {
    let release: () => void = () => {};
    const blocked: Promise<void> = new Promise<void>(resolve => (release = resolve));
    let handledCount: number = 0;
    const env = await connect({
      handleInbound: async () => {
        await blocked;
        handledCount++;
      }
    });
    const frameText: string = JSON.stringify({ text: 'x'.repeat(MAX_FRAME_BYTES - 100) });
    const total: number = Math.ceil(INBOUND_HIGH_WATER_BYTES / frameText.length) + 1;
    expect(total).toBeLessThan(INBOUND_HIGH_WATER_MARK);
    for (let n = 0; n < total; n++) {
      env.client.send(frameText);
    }

    // SUT
    await env.waitFor(() => env.serverSocket.isPaused, 10_000);
    release();
    await env.waitFor(() => handledCount === total, 10_000);

    expect(env.serverSocket.isPaused).toBe(false);
    expect(env.transport.isClosed).toBe(false);
  });

  it('shows ResourceMonitor the outbound queue, and closes with 1013 when it holds too many messages', async () => {
    const env = await connect({ handleOutbound: () => new Promise<readonly string[]>(() => {}) });

    for (let n = 0; n < MAX_OUTBOUND_QUEUE_MESSAGES; n++) {
      env.transport.stream.write({ n: n });
    }
    // The first message is being handled, so it has left the queue.
    expect(env.transport.stream.queuedOutbound.messages).toEqual(MAX_OUTBOUND_QUEUE_MESSAGES - 1);
    expect(env.transport.stream.queuedOutbound.bytes).toBeGreaterThan(0);
    env.transport.stream.write({ n: -1 });
    env.transport.stream.write({ n: -2 });

    // SUT
    const closed = await env.clientClosed;

    expect(closed.code).toEqual(CLOSE_CODE_TRY_AGAIN_LATER);
    expect(env.handlers.handleOverflow).toHaveBeenCalledTimes(1);
    expect(env.transport.stream.queuedOutbound).toEqual({ messages: 0, bytes: 0 });
  });

  it('takes one message of any size into an empty outbound queue, but closes when the queued bytes pass the limit', async () => {
    const env = await connect({ handleOutbound: () => new Promise<readonly string[]>(() => {}) });
    const half: string = 'x'.repeat(Math.ceil(MAX_OUTBOUND_QUEUE_BYTES / 2));

    env.transport.stream.write({ first: half });
    env.transport.stream.write({ large: half + half });
    expect(env.transport.isClosed).toBe(false);
    env.transport.stream.write({ second: half });

    // SUT
    const closed = await env.clientClosed;

    expect(closed.code).toEqual(CLOSE_CODE_TRY_AGAIN_LATER);
    expect(env.handlers.handleOverflow).toHaveBeenCalledTimes(1);
  });

  it('stops sending while the client is not reading, and sends everything in order once it reads again', async () => {
    const env = await connect();
    env.client.pause();
    const messageText: string = 'x'.repeat(1024 * 1024);
    // In case sending never stops: more than the socket and the operating system's buffers hold together, and less
    // than the outbound queue may hold.
    const maxCount: number = MAX_OUTBOUND_QUEUE_BYTES / messageText.length - 2;
    let count: number = 0;
    while (env.transport.stream.queuedOutbound.messages < 2 && count < maxCount) {
      env.transport.stream.write({ n: count, text: messageText });
      count++;
      await env.delay(1);
    }

    expect(env.transport.stream.queuedOutbound.messages, 'messages wait in the queue').toBeGreaterThanOrEqual(2);
    expect(env.serverSocket.bufferedAmount).toBeLessThanOrEqual(OUTBOUND_HIGH_WATER_BYTES + messageText.length * 2);

    // SUT
    env.client.resume();

    await env.waitFor(() => env.clientMessages.length === count, 20_000);
    expect(env.clientMessages.map((json: string) => JSON.parse(json).n)).toEqual(Array.from(Array(count).keys()));
    expect(env.transport.isClosed).toBe(false);
  }, 30_000);

  it('closes with 1013 when a client stops reading and the outbound queue passes its limit', async () => {
    let bufferedAtOverflow: number = -1;
    const env = await connect({
      handleOverflow: () => (bufferedAtOverflow = env.serverSocket.bufferedAmount)
    });
    env.client.pause();
    const messageText: string = 'x'.repeat(1024 * 1024);
    // Enough to fill the queue and the socket's buffer, with room for what the operating system buffers.
    const maxCount: number = (MAX_OUTBOUND_QUEUE_BYTES + OUTBOUND_HIGH_WATER_BYTES) / messageText.length + 64;

    // SUT
    for (let count = 0; count < maxCount && !env.transport.isClosed; count++) {
      env.transport.stream.write({ n: count, text: messageText });
      await env.delay(1);
    }

    expect(env.transport.isClosed).toBe(true);
    expect(env.handlers.handleOverflow).toHaveBeenCalledTimes(1);
    expect(bufferedAtOverflow).toBeLessThanOrEqual(OUTBOUND_HIGH_WATER_BYTES + messageText.length * 2);
    // The close frame waits behind what the socket already holds, so the client sees it once it reads again.
    env.client.resume();
    expect((await env.clientClosed).code).toEqual(CLOSE_CODE_TRY_AGAIN_LATER);
  }, 30_000);
});

/** Builds deeply nested JSON text for the parse tests. */
class ParseTestEnvironment {
  /** An object nested `depth` levels deep, counting the top-level object. */
  nestedObject(depth: number): string {
    return '{"a":'.repeat(depth - 1) + '{}' + '}'.repeat(depth - 1);
  }

  /** A top-level object holding `arrayDepth` nested arrays. */
  objectWithNestedArrays(arrayDepth: number): string {
    return '{"a":' + '['.repeat(arrayDepth) + ']'.repeat(arrayDepth) + '}';
  }
}

/** A GatewayTransport on a real ws server, connected to a real ws client on an ephemeral port. */
class TransportTestEnvironment {
  readonly handlers: jest.Mocked<TransportHandlers>;
  readonly clientMessages: string[] = [];
  readonly wss: ws.WebSocketServer;
  client!: ws.WebSocket;
  serverSocket!: ws.WebSocket;
  transport!: GatewayTransport;
  clientClosed!: Promise<{ code: number; reason: string }>;

  constructor(overrides: Partial<TransportHandlers>) {
    this.handlers = {
      handleInbound: jest.fn(overrides.handleInbound ?? (async () => {})),
      handleOutbound: jest.fn(overrides.handleOutbound ?? (async (json: string) => [json])),
      handleViolation: jest.fn(overrides.handleViolation ?? (() => {})),
      handleOverflow: jest.fn(overrides.handleOverflow ?? (() => {})),
      handleInternalError: jest.fn(overrides.handleInternalError ?? (() => {})),
      handleClosed: jest.fn(overrides.handleClosed ?? (() => {}))
    };
    this.wss = new ws.WebSocketServer({ port: 0, host: '127.0.0.1' });
  }

  async connect(): Promise<void> {
    await new Promise<void>(resolve => this.wss.once('listening', () => resolve()));
    const port: number = (this.wss.address() as AddressInfo).port;
    const serverConnected: Promise<void> = new Promise<void>(resolve =>
      this.wss.once('connection', (socket: ws.WebSocket) => {
        this.serverSocket = socket;
        this.transport = new GatewayTransport(socket, this.handlers);
        resolve();
      })
    );
    this.client = new ws.WebSocket(`ws://127.0.0.1:${port}`);
    this.client.on('message', (data: ws.RawData) => this.clientMessages.push(data.toString()));
    this.clientClosed = new Promise(resolve =>
      this.client.once('close', (code: number, reason: Buffer) => resolve({ code: code, reason: reason.toString() }))
    );
    await new Promise<void>(resolve => this.client.once('open', () => resolve()));
    await serverConnected;
  }

  streamEvent(event: string): Promise<void> {
    return new Promise<void>(resolve => this.transport.stream.once(event, () => resolve()));
  }

  delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  async waitFor(condition: () => boolean, timeoutMs: number = 2000): Promise<void> {
    const deadline: number = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for a condition');
      }
      await this.delay(2);
    }
  }

  async dispose(): Promise<void> {
    this.client?.terminate();
    for (const socket of this.wss.clients) {
      socket.terminate();
    }
    await new Promise<void>(resolve => this.wss.close(() => resolve()));
  }
}
