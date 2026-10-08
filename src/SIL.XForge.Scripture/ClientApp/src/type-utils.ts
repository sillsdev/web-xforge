// The generic type guards and types are shared with the realtime server, which also uses them to check what clients
// send. Only browser-specific declarations live here.
export * from 'realtime-server/lib/esm/common/utils/type-utils';

// The CaretPosition type is no longer in the TypeScript DOM API type definitions, though it is still in Firefox,
// as of Firefox 104.0, on 2022-09-06
export interface CaretPosition {
  readonly offset: number;
  readonly offsetNode: Node;
}
