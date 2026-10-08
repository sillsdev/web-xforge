import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Binary, Collection, Db, MongoServerError } from 'mongodb';

/**
 * Connection ids ("src") issued by the gateway. ShareDB uses an op's `src` and `seq` to recognize an op it has already
 * committed, so a client that could choose any src could interfere with other users' ops. The gateway therefore issues
 * every connection's src itself, as `${nonce}.${mac}`, where the MAC binds the nonce to the user. Any src is broadcast
 * to everyone who reads the doc, so the user id is not part of it; only the server can check which user it belongs to.
 */

/** The length of the HMAC key, in bytes. */
export const SRC_KEY_BYTES = 32;

const NONCE_BYTES = 16;
/** The length of NONCE_BYTES bytes in unpadded base64url. */
const NONCE_TEXT_LENGTH = 22;
/** The length of an HMAC-SHA256 digest (32 bytes) in unpadded base64url. */
const MAC_TEXT_LENGTH = 43;
const SRC_PATTERN: RegExp = new RegExp(`^[A-Za-z0-9_-]{${NONCE_TEXT_LENGTH}}\\.[A-Za-z0-9_-]{${MAC_TEXT_LENGTH}}$`);
const LEGACY_SHAREDB_SRC_PATTERN: RegExp = /^[0-9a-f]{32}$/;

/** How many legacy srcs LegacySrcBindings remembers by default. */
export const DEFAULT_LEGACY_SRC_CAPACITY = 100_000;

/** Makes a new random key for SrcAuthority. */
export function generateSrcKey(): Buffer {
  return randomBytes(SRC_KEY_BYTES);
}

/**
 * Mints and verifies connection srcs `${nonce}.${mac}`: nonce = 16 random bytes base64url; mac = HMAC-SHA256(key,
 * nonce + '.' + userId) base64url. The user id is not embedded.
 */
export class SrcAuthority {
  private readonly key: Buffer;

  /** Throws if the key is not SRC_KEY_BYTES long. This happens at startup, never while handling a message. */
  constructor(key: Buffer) {
    if (key.length !== SRC_KEY_BYTES) {
      throw new Error(`The connection src key must be ${SRC_KEY_BYTES} bytes long, but it is ${key.length} bytes long`);
    }
    // A copy, so that later changes to the caller's buffer cannot change the key.
    this.key = Buffer.from(key);
  }

  /** Makes a new src for a connection of the user. Throws if the user id is empty. */
  mint(userId: string): string {
    if (userId === '') {
      throw new Error('A connection src needs a user id');
    }
    const nonce: string = randomBytes(NONCE_BYTES).toString('base64url');
    return `${nonce}.${this.mac(nonce, userId)}`;
  }

  /**
   * Whether `src` was minted for this user with this key. The format is checked exactly (lengths, base64url alphabet,
   * one '.') before the MAC is compared in constant time. Never throws.
   */
  verify(src: string, userId: string): boolean {
    try {
      if (typeof src !== 'string' || typeof userId !== 'string' || userId === '' || !SRC_PATTERN.test(src)) {
        return false;
      }
      const nonce: string = src.slice(0, NONCE_TEXT_LENGTH);
      const givenMac: string = src.slice(NONCE_TEXT_LENGTH + 1);
      const expectedMac: string = this.mac(nonce, userId);
      // The MAC texts are compared rather than the bytes they decode to, so that only the exact text minted verifies
      // (base64url can spell the same bytes in more than one way).
      return timingSafeEqual(Buffer.from(givenMac, 'utf8'), Buffer.from(expectedMac, 'utf8'));
    } catch (error) {
      console.error('Gateway: error while verifying a connection src', error);
      return false;
    }
  }

  private mac(nonce: string, userId: string): string {
    // The nonce has a fixed length and no '.', so the input names the nonce and user unambiguously.
    return createHmac('sha256', this.key).update(`${nonce}.${userId}`, 'utf8').digest('base64url');
  }
}

/**
 * Whether `src` looks like a connection id ShareDB made itself (with `hat`). Ops a client saved offline before the
 * gateway was deployed carry such ids.
 */
export function isLegacyShareDbSrc(src: string): boolean {
  return typeof src === 'string' && LEGACY_SHAREDB_SRC_PATTERN.test(src);
}

/**
 * Binds each legacy ShareDB src (see isLegacyShareDbSrc) to the first user whose op carries it, so that no other user
 * can submit ops under it. Shared by every connection in the process. It holds at most `capacity` srcs and forgets the
 * least recently used one when full; legacy srcs only come from offline ops saved before the gateway, so they become
 * rare.
 */
export class LegacySrcBindings {
  /** Maps src to user id. A Map iterates in insertion order, so the first key is the least recently used. */
  private readonly userIdsBySrc: Map<string, string> = new Map<string, string>();

  constructor(private readonly capacity: number = DEFAULT_LEGACY_SRC_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error(`The legacy src capacity must be a positive integer, but it is ${capacity}`);
    }
  }

  /** Whether `src` is a legacy src that is not bound to any user other than `userId`. Binds nothing. */
  isAvailableTo(src: string, userId: string): boolean {
    if (!isLegacyShareDbSrc(src) || userId === '') {
      return false;
    }
    const boundUserId: string | undefined = this.userIdsBySrc.get(src);
    return boundUserId == null || boundUserId === userId;
  }

  /** Whether `src` is already bound to `userId`. */
  isBoundTo(src: string, userId: string): boolean {
    return this.userIdsBySrc.get(src) === userId;
  }

  /**
   * True if `src` is unbound (and binds it to the user now) or already bound to the user; false if it is bound to
   * another user, or is not a legacy src at all. Marks the src as most recently used.
   */
  bindOrCheck(src: string, userId: string): boolean {
    if (!isLegacyShareDbSrc(src) || typeof userId !== 'string' || userId === '') {
      return false;
    }
    const boundUserId: string | undefined = this.userIdsBySrc.get(src);
    if (boundUserId != null && boundUserId !== userId) {
      return false;
    }
    // Re-inserting moves the src to the end, the most recently used position.
    this.userIdsBySrc.delete(src);
    this.userIdsBySrc.set(src, userId);
    if (this.userIdsBySrc.size > this.capacity) {
      const leastRecentlyUsed: string | undefined = this.userIdsBySrc.keys().next().value;
      if (leastRecentlyUsed != null) {
        this.userIdsBySrc.delete(leastRecentlyUsed);
      }
    }
    return true;
  }
}

/**
 * The Mongo collection that holds the gateway's keys. ShareDB does not serve it, so no client can read it.
 */
export const GATEWAY_KEYS_COLLECTION = 'realtime_gateway_keys';

/** The id of the document in GATEWAY_KEYS_COLLECTION that holds the src key. */
export const SRC_KEY_DOC_ID = 'connection-src-hmac';

/** A document in GATEWAY_KEYS_COLLECTION. `key` is read as unknown because it is checked before use. */
interface GatewayKeyDocument {
  _id: string;
  key: unknown;
  createdAt: Date;
}

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Loads the src key from Mongo, creating it first if there is none. Processes that start at the same time agree on
 * one key: each inserts a new key only if none is stored (an upsert with $setOnInsert) and then reads back whichever
 * key was stored. Throws a clear error if the stored key is not a binary value of SRC_KEY_BYTES bytes.
 */
export async function loadOrCreateSrcKey(db: Db): Promise<Buffer> {
  const collection: Collection<GatewayKeyDocument> = db.collection<GatewayKeyDocument>(GATEWAY_KEYS_COLLECTION);
  try {
    await collection.updateOne(
      { _id: SRC_KEY_DOC_ID },
      { $setOnInsert: { key: new Binary(generateSrcKey()), createdAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    // Two processes upserting at once can both try the insert. One then fails with a duplicate key error, and the
    // key the other one stored is read back below.
    if (!(error instanceof MongoServerError && error.code === MONGO_DUPLICATE_KEY_ERROR_CODE)) {
      throw error;
    }
  }
  const stored: GatewayKeyDocument | null = await collection.findOne({ _id: SRC_KEY_DOC_ID });
  if (stored == null) {
    throw new Error(`The connection src key was not found in ${GATEWAY_KEYS_COLLECTION} after it was stored`);
  }
  const key: Buffer | undefined = keyBytes(stored.key);
  if (key == null || key.length !== SRC_KEY_BYTES) {
    throw new Error(
      `The connection src key in ${GATEWAY_KEYS_COLLECTION} (_id '${SRC_KEY_DOC_ID}') is not a binary value of ` +
        `${SRC_KEY_BYTES} bytes. Delete that document to have a new key made; connections then get new srcs.`
    );
  }
  return key;
}

/** The bytes of a key as Mongo returns it: usually a BSON Binary, or a Buffer. A copy, never shared. */
function keyBytes(value: unknown): Buffer | undefined {
  if (value instanceof Binary) {
    return Buffer.from(value.buffer.subarray(0, value.position));
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  return undefined;
}
