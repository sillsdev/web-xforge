/**
 * Which connection each presence id belongs to, process-wide. A client makes a random presence id for each text view
 * and sends it, with its connection's src, on the presence channels of every text that view shows. The receiving
 * client labels a cursor from the doc presence channel with the viewer sent under the same id on the plain channel.
 * Binding an id to the first src that uses it, on any channel, stops another connection from sending presence under
 * someone else's id, which would move or hide their cursor or label a cursor with their name.
 *
 * A binding is held by the connection that made it (its owner) for as long as that connection is open, and is never
 * dropped meanwhile. When the connection closes, the binding is released but kept: a client that reconnects keeps its
 * src and its presence ids, and its new connection takes the binding over. A released binding can be taken by another
 * src only after RELEASED_BINDING_GRACE_MS, and is the first to be dropped when the table is full.
 */

/** The most bindings kept, held and released together. */
export const MAX_PRESENCE_BINDINGS = 100_000;
/**
 * The most bindings the open connections of one user may hold together. A page shows a few text views at a time, each
 * with its own id, and a user may have several tabs open.
 */
export const MAX_PRESENCE_BINDINGS_PER_USER = 2_000;
/** How long a released binding stays with its src, so that a reconnecting client finds its ids still its own. */
export const RELEASED_BINDING_GRACE_MS = 10 * 60 * 1000;

/**
 * The outcome of binding a presence id: newly bound, already bound to the same src, bound to another src, or not
 * bound because the table (or the user's share of it) is full.
 */
export type PresenceBindingResult = 'bound' | 'already-bound' | 'taken' | 'full';

/** The bindings one connection holds. Give it to `release` when the connection closes. */
export class PresenceBindingOwner {
  /** The presence ids this owner holds. */
  readonly ids = new Set<string>();

  constructor(readonly userId: string) {}
}

interface Binding {
  readonly src: string;
  /** The connection holding the binding, or null once that connection has closed. */
  owner: PresenceBindingOwner | null;
  /** When the binding was released; meaningful only when `owner` is null. */
  releasedAtMs: number;
}

export interface PresenceIdBindingsOptions {
  readonly maxBindings?: number;
  readonly maxBindingsPerUser?: number;
  readonly releasedGraceMs?: number;
  readonly now?: () => number;
}

export class PresenceIdBindings {
  private readonly bindings = new Map<string, Binding>();
  /** The ids of the released bindings, in the order they were released (oldest first). */
  private readonly released = new Set<string>();
  /** How many bindings the open connections of each user hold. */
  private readonly heldByUser = new Map<string, number>();
  private readonly maxBindings: number;
  private readonly maxBindingsPerUser: number;
  private readonly releasedGraceMs: number;
  private readonly now: () => number;

  constructor(options: PresenceIdBindingsOptions = {}) {
    this.maxBindings = options.maxBindings ?? MAX_PRESENCE_BINDINGS;
    this.maxBindingsPerUser = options.maxBindingsPerUser ?? MAX_PRESENCE_BINDINGS_PER_USER;
    this.releasedGraceMs = options.releasedGraceMs ?? RELEASED_BINDING_GRACE_MS;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.bindings.size;
  }

  /** Whether the presence id is bound to `src`, held or released. */
  isBoundTo(presenceId: string, src: string): boolean {
    return this.bindings.get(presenceId)?.src === src;
  }

  /**
   * Binds the presence id to `src`, held by `owner`, unless it is bound to another src. A binding of the same src that
   * another connection holds, or that was released, passes to `owner`.
   */
  bind(presenceId: string, src: string, owner: PresenceBindingOwner): PresenceBindingResult {
    const existing: Binding | undefined = this.bindings.get(presenceId);
    if (existing != null && existing.src !== src) {
      if (existing.owner != null || this.now() - existing.releasedAtMs < this.releasedGraceMs) {
        return 'taken';
      }
      this.drop(presenceId);
    } else if (existing != null) {
      if (existing.owner === owner) {
        return 'already-bound';
      }
      if (!this.mayHoldMore(owner)) {
        return 'full';
      }
      this.unhold(presenceId, existing);
      this.hold(presenceId, existing, owner);
      return 'already-bound';
    }
    if (!this.mayHoldMore(owner) || !this.makeRoom()) {
      return 'full';
    }
    const binding: Binding = { src: src, owner: null, releasedAtMs: 0 };
    this.bindings.set(presenceId, binding);
    this.hold(presenceId, binding, owner);
    return 'bound';
  }

  /** Releases every binding `owner` holds. Call it once its connection has closed. */
  release(owner: PresenceBindingOwner): void {
    const releasedAtMs: number = this.now();
    for (const presenceId of Array.from(owner.ids)) {
      const binding: Binding | undefined = this.bindings.get(presenceId);
      if (binding != null && binding.owner === owner) {
        this.unhold(presenceId, binding);
        binding.releasedAtMs = releasedAtMs;
        this.released.add(presenceId);
      }
    }
    owner.ids.clear();
  }

  private mayHoldMore(owner: PresenceBindingOwner): boolean {
    return (this.heldByUser.get(owner.userId) ?? 0) < this.maxBindingsPerUser;
  }

  /** Drops the oldest released binding if the table is full. False when it is full of held bindings. */
  private makeRoom(): boolean {
    if (this.bindings.size < this.maxBindings) {
      return true;
    }
    const oldest: string | undefined = this.released.values().next().value;
    if (oldest == null) {
      return false;
    }
    this.drop(oldest);
    return true;
  }

  private hold(presenceId: string, binding: Binding, owner: PresenceBindingOwner): void {
    this.released.delete(presenceId);
    binding.owner = owner;
    owner.ids.add(presenceId);
    this.heldByUser.set(owner.userId, (this.heldByUser.get(owner.userId) ?? 0) + 1);
  }

  /** Takes a held binding from its owner, leaving it unheld. */
  private unhold(presenceId: string, binding: Binding): void {
    const owner: PresenceBindingOwner | null = binding.owner;
    if (owner == null) {
      return;
    }
    owner.ids.delete(presenceId);
    const held: number = (this.heldByUser.get(owner.userId) ?? 1) - 1;
    if (held > 0) {
      this.heldByUser.set(owner.userId, held);
    } else {
      this.heldByUser.delete(owner.userId);
    }
    binding.owner = null;
  }

  private drop(presenceId: string): void {
    const binding: Binding | undefined = this.bindings.get(presenceId);
    if (binding != null) {
      this.unhold(presenceId, binding);
    }
    this.bindings.delete(presenceId);
    this.released.delete(presenceId);
  }
}
