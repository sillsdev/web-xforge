/**
 * What the gateway's inbound decoders need to know about each collection a client may address: which OT type its
 * docs use, and which of the less common messages the application's client sends for it. A collection or projection
 * that is not in the config cannot be addressed at all. Each application supplies its own config (see
 * scriptureforge/gateway/sf-gateway-protocol.ts), because these facts come from its client code.
 */
export interface GatewayProtocolConfig {
  readonly collections: ReadonlyMap<string, CollectionProtocol>;
}

/** The OT types the gateway can decode ops for. */
export type GatewayOtType = 'json0' | 'rich-text';

/** The URI ShareDB uses for the json0 OT type. */
export const JSON0_TYPE_URI = 'http://sharejs.org/types/JSONv0';
/** The name of the json0 OT type, which a client may use in place of its URI when creating a doc. */
export const JSON0_TYPE_NAME = 'json0';
/** The URI ShareDB uses for the rich-text OT type. */
export const RICH_TEXT_TYPE_URI = 'http://sharejs.org/types/rich-text/v1';

/** How the client uses one collection or projection. */
export interface CollectionProtocol {
  readonly otType: GatewayOtType;
  /** Whether the client creates docs here (an `op` with `create`). Creates are always json0. */
  readonly clientCreates: boolean;
  /**
   * The values the client may send as `x.source` on an op. Empty when ops here carry only `x: {}`. An op may carry
   * `x: {}` in every collection.
   */
  readonly opSources: readonly string[];
  /** Whether the client fetches past versions of docs here (`nf`). */
  readonly snapshotFetchByVersion: boolean;
  /** Whether the client uses presence on docs here, on the channels `<collection>:<id>` and `<collection>.<id>`. */
  readonly presence: boolean;
}
