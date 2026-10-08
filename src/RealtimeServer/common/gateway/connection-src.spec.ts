import 'jest-expect-message';
import { Binary, Db, MongoServerError } from 'mongodb';
import {
  GATEWAY_KEYS_COLLECTION,
  generateSrcKey,
  isLegacyShareDbSrc,
  LegacySrcBindings,
  loadOrCreateSrcKey,
  SRC_KEY_BYTES,
  SRC_KEY_DOC_ID,
  SrcAuthority
} from './connection-src';

describe('SrcAuthority', () => {
  it('verifies a src it minted for the same user', () => {
    const authority = new SrcAuthority(generateSrcKey());
    const src: string = authority.mint('user01');
    expect(src).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(authority.verify(src, 'user01')).toBe(true);
    expect(src).not.toContain('user01');
  });

  it('mints a different src each time', () => {
    const authority = new SrcAuthority(generateSrcKey());
    expect(authority.mint('user01')).not.toBe(authority.mint('user01'));
  });

  it('does not verify a src for another user or another key', () => {
    const key: Buffer = generateSrcKey();
    const authority = new SrcAuthority(key);
    const src: string = authority.mint('user01');
    expect(authority.verify(src, 'user02')).toBe(false);
    expect(authority.verify(src, '')).toBe(false);
    expect(new SrcAuthority(generateSrcKey()).verify(src, 'user01')).toBe(false);
    expect(new SrcAuthority(Buffer.from(key)).verify(src, 'user01')).toBe(true);
  });

  it('does not verify a tampered src', () => {
    const env = new SrcTestEnvironment();
    const src: string = env.authority.mint('user01');
    const [nonce, mac] = src.split('.');
    expect(env.authority.verify(`${env.changeFirstCharacter(nonce)}.${mac}`, 'user01')).toBe(false);
    expect(env.authority.verify(`${nonce}.${env.changeFirstCharacter(mac)}`, 'user01')).toBe(false);
    expect(env.authority.verify(`${mac.slice(0, 22)}.${nonce}${mac.slice(22)}`, 'user01')).toBe(false);
  });

  it('refuses a src of the wrong format without throwing', () => {
    const env = new SrcTestEnvironment();
    const src: string = env.authority.mint('user01');
    const [nonce, mac] = src.split('.');
    const badSrcs: unknown[] = [
      '',
      nonce,
      `${nonce}.`,
      `${nonce}${mac}`,
      `${nonce}.${mac}.`,
      `${nonce}..${mac}`,
      `${nonce}A.${mac}`,
      `${nonce.slice(1)}.${mac}`,
      `${nonce}.${mac}A`,
      `${nonce}.${mac.slice(1)}`,
      `${nonce}=.${mac}`,
      `${nonce.slice(1)}+.${mac}`,
      `${nonce.slice(1)}/.${mac}`,
      `${nonce}.${mac.slice(1)}=`,
      ` ${src}`,
      `${src}\n`,
      src.toUpperCase() === src ? src.toLowerCase() : src.toUpperCase(),
      'user01',
      '0123456789abcdef0123456789abcdef',
      null,
      undefined,
      42,
      {}
    ];
    for (const badSrc of badSrcs) {
      expect(env.authority.verify(badSrc as string, 'user01'), JSON.stringify(badSrc)).toBe(false);
    }
  });

  it('requires a key of SRC_KEY_BYTES bytes', () => {
    expect(generateSrcKey().length).toBe(SRC_KEY_BYTES);
    expect(() => new SrcAuthority(Buffer.alloc(SRC_KEY_BYTES - 1))).toThrow();
    expect(() => new SrcAuthority(Buffer.alloc(SRC_KEY_BYTES + 1))).toThrow();
  });

  it('keeps its own copy of the key', () => {
    const key: Buffer = generateSrcKey();
    const authority = new SrcAuthority(key);
    const src: string = authority.mint('user01');
    key.fill(0);
    expect(authority.verify(src, 'user01')).toBe(true);
  });

  it('refuses to mint for an empty user id', () => {
    expect(() => new SrcAuthority(generateSrcKey()).mint('')).toThrow();
  });
});

describe('isLegacyShareDbSrc', () => {
  it('recognizes 32 lowercase hex digits only', () => {
    expect(isLegacyShareDbSrc('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isLegacyShareDbSrc('0123456789ABCDEF0123456789abcdef')).toBe(false);
    expect(isLegacyShareDbSrc('0123456789abcdef0123456789abcde')).toBe(false);
    expect(isLegacyShareDbSrc('0123456789abcdef0123456789abcdef0')).toBe(false);
    expect(isLegacyShareDbSrc('0123456789abcdef0123456789abcdeg')).toBe(false);
    expect(isLegacyShareDbSrc('0123456789abcdef0123456789abcdef\n')).toBe(false);
    expect(isLegacyShareDbSrc(new SrcAuthority(generateSrcKey()).mint('user01'))).toBe(false);
  });
});

describe('LegacySrcBindings', () => {
  it('binds a src to the first user that uses it', () => {
    const env = new SrcTestEnvironment();
    const bindings = new LegacySrcBindings();
    expect(bindings.bindOrCheck(env.legacySrc(1), 'user01')).toBe(true);
    expect(bindings.bindOrCheck(env.legacySrc(1), 'user01')).toBe(true);
    expect(bindings.bindOrCheck(env.legacySrc(1), 'user02')).toBe(false);
    expect(bindings.bindOrCheck(env.legacySrc(2), 'user02')).toBe(true);
  });

  it('refuses a src that is not a legacy src', () => {
    const bindings = new LegacySrcBindings();
    expect(bindings.bindOrCheck('not-legacy', 'user01')).toBe(false);
    expect(bindings.bindOrCheck(new SrcTestEnvironment().legacySrc(1), '')).toBe(false);
  });

  it('forgets the least recently used src when full', () => {
    const env = new SrcTestEnvironment();
    const bindings = new LegacySrcBindings(2);
    bindings.bindOrCheck(env.legacySrc(1), 'user01');
    bindings.bindOrCheck(env.legacySrc(2), 'user01');
    // Using src 1 again makes src 2 the least recently used.
    bindings.bindOrCheck(env.legacySrc(1), 'user01');

    // SUT
    bindings.bindOrCheck(env.legacySrc(3), 'user01');

    expect(bindings.bindOrCheck(env.legacySrc(1), 'user02')).toBe(false);
    expect(bindings.bindOrCheck(env.legacySrc(3), 'user02')).toBe(false);
    // Src 2 was forgotten, so another user can now bind it.
    expect(bindings.bindOrCheck(env.legacySrc(2), 'user02')).toBe(true);
  });

  it('refuses an invalid capacity', () => {
    expect(() => new LegacySrcBindings(0)).toThrow();
    expect(() => new LegacySrcBindings(1.5)).toThrow();
  });
});

describe('loadOrCreateSrcKey', () => {
  it('creates a key when none is stored, and loads the same key later', async () => {
    const env = new SrcTestEnvironment();

    // SUT
    const first: Buffer = await loadOrCreateSrcKey(env.db);

    expect(first.length).toBe(SRC_KEY_BYTES);
    expect(env.collectionNames).toEqual([GATEWAY_KEYS_COLLECTION]);
    const second: Buffer = await loadOrCreateSrcKey(env.db);
    expect(second.equals(first)).toBe(true);
  });

  it('agrees on one key when processes start at the same time', async () => {
    const env = new SrcTestEnvironment();
    const keys: Buffer[] = await Promise.all([loadOrCreateSrcKey(env.db), loadOrCreateSrcKey(env.db)]);
    expect(keys[0].equals(keys[1])).toBe(true);
  });

  it('reads back the stored key after losing an insert race', async () => {
    const env = new SrcTestEnvironment();
    const stored: Buffer = generateSrcKey();
    env.loseNextInsertRaceTo(stored);

    // SUT
    const key: Buffer = await loadOrCreateSrcKey(env.db);

    expect(key.equals(stored)).toBe(true);
  });

  it('accepts a key stored as a Buffer', async () => {
    const env = new SrcTestEnvironment();
    const stored: Buffer = generateSrcKey();
    env.store(stored);
    expect((await loadOrCreateSrcKey(env.db)).equals(stored)).toBe(true);
  });

  it('throws a clear error for a stored key that is not valid', async () => {
    for (const badKey of [new Binary(Buffer.alloc(16)), 'a string key', null, Buffer.alloc(SRC_KEY_BYTES + 1)]) {
      const env = new SrcTestEnvironment();
      env.store(badKey);
      await expect(loadOrCreateSrcKey(env.db)).rejects.toThrow(/is not a binary value of 32 bytes/);
    }
  });

  it('passes on other database errors', async () => {
    const env = new SrcTestEnvironment();
    env.failNextUpdateWith(new Error('network down'));
    await expect(loadOrCreateSrcKey(env.db)).rejects.toThrow('network down');
  });
});

/** A key document as the fake collection stores it. */
interface FakeKeyDocument {
  _id: string;
  key: unknown;
  createdAt?: Date;
}

/**
 * An SrcAuthority and a fake Mongo Db that supports just the collection calls loadOrCreateSrcKey makes, since jest
 * tests cannot rely on a Mongo server.
 */
class SrcTestEnvironment {
  readonly authority: SrcAuthority = new SrcAuthority(generateSrcKey());
  readonly collectionNames: string[] = [];
  readonly db: Db;
  private readonly documents: Map<string, FakeKeyDocument> = new Map<string, FakeKeyDocument>();
  private raceWinnerKey: Buffer | undefined;
  private nextUpdateError: Error | undefined;

  constructor() {
    const fakeCollection = {
      updateOne: async (
        filter: { _id: string },
        update: { $setOnInsert: { key: unknown; createdAt: Date } },
        options: { upsert: boolean }
      ): Promise<void> => {
        // Yield first, as a real database call would, so that concurrent callers interleave.
        await Promise.resolve();
        if (this.nextUpdateError != null) {
          const error: Error = this.nextUpdateError;
          this.nextUpdateError = undefined;
          throw error;
        }
        if (this.raceWinnerKey != null) {
          // Another process inserted between this upsert's check and its insert.
          this.store(this.raceWinnerKey);
          this.raceWinnerKey = undefined;
          throw new MongoServerError({ message: 'E11000 duplicate key error', code: 11000 });
        }
        if (!this.documents.has(filter._id) && options.upsert) {
          this.documents.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
        }
      },
      findOne: async (filter: { _id: string }): Promise<FakeKeyDocument | null> => {
        await Promise.resolve();
        return this.documents.get(filter._id) ?? null;
      }
    };
    this.db = {
      collection: (name: string) => {
        this.collectionNames.push(name);
        return fakeCollection;
      }
    } as unknown as Db;
  }

  store(key: unknown): void {
    this.documents.set(SRC_KEY_DOC_ID, { _id: SRC_KEY_DOC_ID, key: key });
  }

  loseNextInsertRaceTo(key: Buffer): void {
    this.raceWinnerKey = key;
  }

  failNextUpdateWith(error: Error): void {
    this.nextUpdateError = error;
  }

  /** A legacy ShareDB src, different for each n. */
  legacySrc(n: number): string {
    return n.toString(16).padStart(32, '0');
  }

  /** Changes the first character of base64url text to another base64url character. */
  changeFirstCharacter(text: string): string {
    return (text[0] === 'A' ? 'B' : 'A') + text.slice(1);
  }
}
