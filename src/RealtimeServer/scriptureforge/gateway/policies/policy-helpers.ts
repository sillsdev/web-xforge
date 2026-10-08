import { GatewaySession } from '../../../common/gateway/authorization';
import { OpEdit } from '../../../common/gateway/inbound-messages';
import { checkJson0Edit, Json0EditDecision, Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { Operation } from '../../../common/models/project-rights';
import { hasOwnProp } from '../../../common/utils/type-utils';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { ProjectAccess } from '../project-access';
import { ALLOWED, denied, PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';

/** Helpers shared by the collection policies. */

/** What a json0 edit rule of a Scripture Forge collection decides with. */
export interface SFEditRuleContext {
  readonly session: GatewaySession;
  readonly docId: string;
  /** The project the doc belongs to. Null only for docs that belong to no project (`users`). */
  readonly project: ProjectAccess | null;
}

/** The project's access facts, or null when the project does not exist. */
export function loadProject(projectId: string, context: SFAccessContext): Promise<ProjectAccess | null> {
  return context.projects.get(projectId);
}

/** A doc's `ownerRef`, or null when it has none that is a string. */
export function ownerRefOf(data: unknown): string | null {
  return hasOwnProp(data, 'ownerRef') && typeof data.ownerRef === 'string' ? data.ownerRef : null;
}

/** A doc's `projectRef`, or null when it has none that is a string. */
export function projectRefOf(data: unknown): string | null {
  return hasOwnProp(data, 'projectRef') && typeof data.projectRef === 'string' ? data.projectRef : null;
}

/**
 * Whether the user has `operation` in every domain, in a project that exists. `ownerRef` is the owner of the entity, for
 * the `_own` variants (see ProjectAccess.hasRight).
 */
export function hasRightsInAll(
  project: ProjectAccess | null,
  userId: string,
  domains: readonly SFProjectDomain[],
  operation: Operation,
  ownerRef: string | null
): PolicyDecision {
  if (project == null) {
    return denied('the project does not exist');
  }
  if (!project.isMember(userId)) {
    return denied('the user is not a member of the project');
  }
  for (const domain of domains) {
    if (!project.hasRight(userId, domain, operation, ownerRef)) {
      return denied(`the user may not ${operation} ${domain}`);
    }
  }
  return ALLOWED;
}

/** Checks a json0 edit against a collection's rules. Rich-text edits are refused: the collection is json0. */
export function checkJson0Rules(
  rules: readonly Json0EditRule<SFEditRuleContext>[],
  data: unknown,
  edit: OpEdit,
  ruleContext: SFEditRuleContext
): PolicyDecision {
  if (edit.otType !== 'json0') {
    return denied('the edit is not a json0 op');
  }
  const decision: Json0EditDecision = checkJson0Edit(rules, data, edit.components, ruleContext);
  return decision.allowed ? ALLOWED : denied(decision.reason);
}

/** Refuses: for collections where clients never create docs. */
export async function noClientCreates(): Promise<PolicyDecision> {
  return denied('clients do not create docs in this collection');
}

/** Refuses: for collections where clients never edit docs. */
export async function noClientEdits(): Promise<PolicyDecision> {
  return denied('clients do not edit docs in this collection');
}
