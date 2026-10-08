import {
  GatewaySession,
  QueryAuthorization,
  QueryRegistryEntry,
  registerQuery,
  RegisteredQuery
} from '../../../common/gateway/authorization';
import { Fields, literal, stringValue } from '../../../common/gateway/decoder';
import { StoredSnapshot } from '../../../common/gateway/gateway-data-source';
import { JsonObject } from '../../../common/gateway/json';
import { CollectionPolicy, decideRead, PolicyDecision } from '../sf-collection-policy';
import { SF_COLLECTION_POLICIES } from '../sf-collection-policies';
import { accept, accessContext, AUTHORIZED, fieldsOf, NO_DOC_ID, SFQueryServices, singleField } from './query-support';

/**
 * E1, the existence check: `{ _id, $limit: 1, $count: { applySkipLimit: true } }`, which RealtimeDoc.checkExists sends
 * (with `qf`) for a doc of any collection, to find out whether a doc it has offline was deleted while it was away. The
 * client reads only the count.
 *
 * The check is never refused. The client calls checkExists without handling errors (`void this.checkExists()` in
 * xforge-common/models/realtime-doc.ts), so an error reply would become an unhandled rejection in the app. Instead the
 * built query asks about the doc only when the session may read it, and otherwise asks about NO_DOC_ID, so that the
 * count is 0. A count of 0 makes the client drop its offline copy, which is right for a doc it may no longer read.
 * The built query keeps the client's shape because the server's own query middleware lets exactly this shape through
 * for every collection (isDocIdExistenceQuery); a query of any other shape that matches nothing would be refused there
 * for collections that have no query rule.
 */

/** The longest doc id accepted. The longest real ids (texts) are well under 100 characters. */
const MAX_DOC_ID_LENGTH = 1024;

/** The arguments of an existence check. */
interface ExistenceArgs {
  readonly docId: string;
}

/** One existence check entry for each collection and projection the client addresses. */
export function existenceQueries(services: SFQueryServices): RegisteredQuery[] {
  return Array.from(SF_COLLECTION_POLICIES.values(), (policy: CollectionPolicy) =>
    registerQuery(existenceQuery(policy, services))
  );
}

function existenceQuery(policy: CollectionPolicy, services: SFQueryServices): QueryRegistryEntry<ExistenceArgs> {
  return {
    name: `${policy.name}-exists`,
    collection: policy.name,
    actions: ['query-fetch'],
    // The built query names the doc only when the session may read it, so the count reveals nothing more.
    extraIsSafe: true,
    match: matchExistenceQuery,
    // Whether the session may know about the doc is decided in build, which never fails (see above).
    authorize: async (_args: ExistenceArgs, _session: GatewaySession): Promise<QueryAuthorization> => AUTHORIZED,
    build: async (args: ExistenceArgs, session: GatewaySession): Promise<JsonObject> => {
      const readable: boolean = await mayReadStoredDoc(policy, args.docId, services, session);
      return existenceQueryFor(readable ? args.docId : NO_DOC_ID);
    }
  };
}

function matchExistenceQuery(query: JsonObject): ExistenceArgs | undefined {
  const fields: Fields<'_id' | '$limit' | '$count', never> | undefined = fieldsOf(query, ['_id', '$limit', '$count']);
  if (fields == null) {
    return undefined;
  }
  const docId: string | undefined = accept(
    stringValue({ minLength: 1, maxLength: MAX_DOC_ID_LENGTH }),
    fields.required('_id')
  );
  const limit: 1 | undefined = accept(literal(1), fields.required('$limit'));
  const applySkipLimit: true | undefined = singleField(fields.required('$count'), 'applySkipLimit', literal(true));
  if (docId == null || limit == null || applySkipLimit == null) {
    return undefined;
  }
  return { docId: docId };
}

function existenceQueryFor(docId: string): JsonObject {
  return { _id: docId, $limit: 1, $count: { applySkipLimit: true } };
}

/** Whether the session may read what is stored at the id now. False when that cannot be found out. */
async function mayReadStoredDoc(
  policy: CollectionPolicy,
  docId: string,
  services: SFQueryServices,
  session: GatewaySession
): Promise<boolean> {
  try {
    const snapshot: StoredSnapshot = await services.data.getSnapshot(policy.storedIn, docId, policy.readDependsOn);
    const decision: PolicyDecision = await decideRead(policy, docId, snapshot, accessContext(services, session));
    return decision.allowed;
  } catch {
    return false;
  }
}
