import { OpEdit } from '../../../common/gateway/inbound-messages';
import { JsonObject } from '../../../common/gateway/json';
import { Operation } from '../../../common/models/project-rights';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../../models/sf-project-user-config';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { ProjectAccess } from '../project-access';
import { ALLOWED, CollectionPolicy, denied, PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';
import { parseProjectUserConfigId, ProjectUserConfigId } from '../sf-doc-ids';
import {
  checkJson0Rules,
  hasRightsInAll,
  loadProject,
  noClientCreates,
  ownerRefOf,
  projectRefOf
} from './policy-helpers';
import { PROJECT_USER_CONFIG_EDIT_RULES } from './project-user-config-edit-rules';

/**
 * `sf_project_user_configs`, each member's own settings for a project, at `${projectId}:${userId}`. Only that user
 * reads and edits it. They may read it whether or not they are a member, since it holds only their own data: the
 * client asks for it on every project page, including the pages system and Serval administrators open for projects
 * they are not members of, and after a user was removed. Editing it needs membership. The backend creates and deletes
 * them.
 */
export class ProjectUserConfigsPolicy implements CollectionPolicy {
  readonly name: string = SF_PROJECT_USER_CONFIGS_COLLECTION;
  readonly storedIn: string = SF_PROJECT_USER_CONFIGS_COLLECTION;
  readonly readDependsOn: readonly string[] = ['projectRef', 'ownerRef'];

  async readById(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    return isOwnConfigId(docId, context) ? ALLOWED : denied("users may not read other users' project configs");
  }

  async read(_docId: string, data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    // As the server's own rules do, an existing config is read by the owner it names.
    return ownerRefOf(data) === context.session.userId
      ? ALLOWED
      : denied('users may read only their own project configs');
  }

  mayEdit(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    return this.ownConfigRight(docId, Operation.Edit, context);
  }

  create(_docId: string, _data: JsonObject, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientCreates();
  }

  async edit(docId: string, data: unknown, edit: OpEdit, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ProjectUserConfigId | undefined = parseProjectUserConfigId(docId);
    if (id == null || projectRefOf(data) !== id.projectId || ownerRefOf(data) !== id.userId) {
      return denied('the doc does not belong at its id');
    }
    const read: PolicyDecision = await this.read(docId, data, context);
    if (!read.allowed) {
      return read;
    }
    const mayEdit: PolicyDecision = await this.mayEdit(docId, context);
    if (!mayEdit.allowed) {
      return mayEdit;
    }
    const project: ProjectAccess | null = await loadProject(id.projectId, context);
    return checkJson0Rules(PROJECT_USER_CONFIG_EDIT_RULES, data, edit, {
      session: context.session,
      docId: docId,
      project: project
    });
  }

  /** Whether the id names the session user's own config in a project where they have the right, as a member. */
  private async ownConfigRight(docId: string, operation: Operation, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ProjectUserConfigId | undefined = parseProjectUserConfigId(docId);
    if (id == null) {
      return denied('not a project user config id');
    }
    if (id.userId !== context.session.userId) {
      return denied("users may not use other users' project configs");
    }
    const project: ProjectAccess | null = await loadProject(id.projectId, context);
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.ProjectUserConfigs], operation, id.userId);
  }
}

/** Whether the id is that of a config of the session user (in any project). */
function isOwnConfigId(docId: string, context: SFAccessContext): boolean {
  const id: ProjectUserConfigId | undefined = parseProjectUserConfigId(docId);
  return id != null && id.userId === context.session.userId;
}
