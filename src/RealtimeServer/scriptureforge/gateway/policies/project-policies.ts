import { OpEdit } from '../../../common/gateway/inbound-messages';
import { JsonObject } from '../../../common/gateway/json';
import { Operation } from '../../../common/models/project-rights';
import { SF_PROJECT_PROFILES_COLLECTION, SF_PROJECTS_COLLECTION } from '../../models/sf-project';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { ProjectAccess } from '../project-access';
import { ALLOWED, CollectionPolicy, denied, PolicyDecision } from '../sf-collection-policy';
import { isServalAdmin, isSystemAdmin, SFAccessContext } from '../sf-access-context';
import { noClientCreates, noClientEdits } from './policy-helpers';

/** The fields of a project doc that decide who may read it. */
const PROJECT_READ_FIELDS: readonly string[] = ['userRoles', 'userPermissions', 'rolePermissions'];

/**
 * `sf_projects`, the whole project doc: system and Serval administrators, and members with the project view right
 * (the Paratext roles). Clients change projects only through the backend's RPCs, never with ops.
 */
export class ProjectsPolicy implements CollectionPolicy {
  readonly name: string = SF_PROJECTS_COLLECTION;
  readonly storedIn: string = SF_PROJECTS_COLLECTION;
  readonly readDependsOn: readonly string[] = PROJECT_READ_FIELDS;

  async readById(_docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    // Without a project there is no membership, so only those who may read every project may read the id.
    return isSystemAdmin(context.session) || isServalAdmin(context.session)
      ? ALLOWED
      : denied('the project does not exist');
  }

  async read(docId: string, data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    if (isSystemAdmin(context.session) || isServalAdmin(context.session)) {
      return ALLOWED;
    }
    const project: ProjectAccess = ProjectAccess.fromData(docId, data);
    return project.hasRight(context.session.userId, SFProjectDomain.Project, Operation.View, null)
      ? ALLOWED
      : denied('the user may not view the project');
  }

  mayEdit(_docId: string, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientEdits();
  }

  create(_docId: string, _data: JsonObject, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientCreates();
  }

  edit(_docId: string, _data: unknown, _edit: OpEdit, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientEdits();
  }
}

/**
 * `sf_projects_profile`, the parts of a project doc every member needs: any member, and system and Serval
 * administrators.
 */
export class ProjectProfilesPolicy implements CollectionPolicy {
  readonly name: string = SF_PROJECT_PROFILES_COLLECTION;
  readonly storedIn: string = SF_PROJECTS_COLLECTION;
  readonly readDependsOn: readonly string[] = PROJECT_READ_FIELDS;

  async readById(_docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    return isSystemAdmin(context.session) || isServalAdmin(context.session)
      ? ALLOWED
      : denied('the project does not exist');
  }

  async read(docId: string, data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    if (isSystemAdmin(context.session) || isServalAdmin(context.session)) {
      return ALLOWED;
    }
    return ProjectAccess.fromData(docId, data).isMember(context.session.userId)
      ? ALLOWED
      : denied('the user is not a member of the project');
  }

  mayEdit(_docId: string, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientEdits();
  }

  create(_docId: string, _data: JsonObject, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientCreates();
  }

  edit(_docId: string, _data: unknown, _edit: OpEdit, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientEdits();
  }
}
