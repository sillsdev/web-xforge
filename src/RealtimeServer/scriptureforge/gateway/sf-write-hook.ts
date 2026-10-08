import { GatewaySession, GatewayWrite, WriteDecision, WriteHook } from '../../common/gateway/authorization';
import { OpEdit } from '../../common/gateway/inbound-messages';
import { JSON0_TYPE_URI } from '../../common/gateway/protocol-config';
import { CollectionPolicy, PolicyDecision } from './sf-collection-policy';
import { SF_COLLECTION_POLICIES } from './sf-collection-policies';
import { SFAccessContext } from './sf-access-context';
import { SFGatewayServices } from './sf-inbound-authorizer';

/**
 * Decides each op from a gateway connection as ShareDB is about to apply it: transformed to the doc's current version,
 * against the doc at that version. Creates must have the collection's exact create shape, edits must pass the
 * collection's edit policy (json0 path allowlists, or for texts the chapter write permission), and clients never
 * delete. The decision depends only on the write, the session and the current access facts, so ShareDB may ask again
 * for the same op when it retries a commit.
 */
export class SFWriteHook implements WriteHook {
  constructor(private readonly services: SFGatewayServices) {}

  async authorize(write: GatewayWrite, session: GatewaySession): Promise<WriteDecision> {
    try {
      return toWriteDecision(await this.decide(write, session));
    } catch {
      return { kind: 'refused', reason: 'The write could not be checked.' };
    }
  }

  private async decide(write: GatewayWrite, session: GatewaySession): Promise<PolicyDecision> {
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(write.addressedAs);
    if (policy == null || policy.storedIn !== write.collection) {
      return { allowed: false, reason: 'Clients may not write to this collection.' };
    }
    const context: SFAccessContext = {
      session: session,
      projects: this.services.projects,
      profiles: this.services.profiles,
      data: this.services.data
    };
    switch (write.change.kind) {
      case 'create':
        if (write.change.type !== JSON0_TYPE_URI) {
          return { allowed: false, reason: 'Clients create only json0 docs.' };
        }
        return policy.create(write.docId, write.change.data, context);
      case 'delete':
        return { allowed: false, reason: 'Clients may not delete docs.' };
      case 'edit':
        if (write.snapshot.type == null) {
          return { allowed: false, reason: 'The doc does not exist.' };
        }
        if (isEmptyEdit(write.change.edit)) {
          // A client can compose ops that cancel out. Such an op changes nothing, but it is still a write: it moves the
          // doc's version on, and its ack tells the client the version. So it needs the right to edit the collection's
          // docs at all (decided by the id), and whatever the edit policy requires of the doc itself, such as reading it.
          const mayEdit: PolicyDecision = await policy.mayEdit(write.docId, context);
          if (!mayEdit.allowed) {
            return mayEdit;
          }
        }
        return policy.edit(write.docId, write.snapshot.data, write.change.edit, context);
    }
  }
}

function isEmptyEdit(edit: OpEdit): boolean {
  return edit.otType === 'json0' ? edit.components.length === 0 : edit.ops.length === 0;
}

function toWriteDecision(decision: PolicyDecision): WriteDecision {
  return decision.allowed ? { kind: 'allowed' } : { kind: 'refused', reason: decision.reason };
}
