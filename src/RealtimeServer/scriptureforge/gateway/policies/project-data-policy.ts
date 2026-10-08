import { OpEdit } from '../../../common/gateway/inbound-messages';
import { JsonObject } from '../../../common/gateway/json';
import { Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { ProjectAccess } from '../project-access';
import { CollectionPolicy, denied, PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';
import { isHexId, parseProjectDataId, ProjectDataId } from '../sf-doc-ids';
import { checkJson0Rules, loadProject, ownerRefOf, projectRefOf, SFEditRuleContext } from './policy-helpers';

/**
 * The common shape of the policies of project data collections whose docs live at `${projectId}:${dataId}` and name
 * their project in `projectRef`: questions, note threads, biblical terms and training data. An existing doc is read by the project its `projectRef` names, as the server's own rules decide it, so that docs
 * made in the past whose id names another project stay readable. Where no doc is, the project the id names decides.
 * Docs are edited and created only where `projectRef` is the project the id names, which is how the backend and the
 * client always make them. Subclasses say who may do what.
 */
export abstract class ProjectDataPolicy implements CollectionPolicy {
  abstract readonly name: string;
  abstract readonly readDependsOn: readonly string[];
  /** The edits clients may make. Empty for collections clients do not edit. */
  protected abstract readonly editRules: readonly Json0EditRule<SFEditRuleContext>[];

  get storedIn(): string {
    return this.name;
  }

  async readById(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ProjectDataId | undefined = parseProjectDataId(docId);
    if (id == null) {
      return denied('not a project data id');
    }
    return this.mayReadAnyDoc(await loadProject(id.projectId, context), context);
  }

  async read(_docId: string, data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    const projectRef: string | null = projectRefOf(data);
    if (projectRef == null || !isHexId(projectRef)) {
      return denied('the doc names no project');
    }
    return this.mayReadDoc(await loadProject(projectRef, context), data, context);
  }

  async mayEdit(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ProjectDataId | undefined = parseProjectDataId(docId);
    if (id == null) {
      return denied('not a project data id');
    }
    return this.mayEditSomething(await loadProject(id.projectId, context), context);
  }

  async create(docId: string, data: JsonObject, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ProjectDataId | undefined = parseProjectDataId(docId);
    if (id == null) {
      return denied('not a project data id');
    }
    if (projectRefOf(data) !== id.projectId) {
      return denied('the doc does not belong at its id');
    }
    return this.mayCreate(id, await loadProject(id.projectId, context), data, context);
  }

  async edit(docId: string, data: unknown, edit: OpEdit, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ProjectDataId | undefined = parseProjectDataId(docId);
    if (id == null || projectRefOf(data) !== id.projectId) {
      return denied('the doc does not belong at its id');
    }
    const project: ProjectAccess | null = await loadProject(id.projectId, context);
    // Only what the user may read may be edited, whatever the edit rules say.
    const read: PolicyDecision = await this.mayReadDoc(project, data, context);
    if (!read.allowed) {
      return read;
    }
    return checkJson0Rules(this.editRules, data, edit, { session: context.session, docId: docId, project: project });
  }

  /**
   * Whether the session may read every doc this collection could have in the project. Used for ids where no doc is,
   * so it must not allow anything `mayReadDoc` could refuse for some doc.
   */
  protected abstract mayReadAnyDoc(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision;

  /** Whether the session may read this doc of the project. */
  protected abstract mayReadDoc(project: ProjectAccess | null, data: unknown, context: SFAccessContext): PolicyDecision;

  /** Whether the session could make any edit to docs of this collection in the project. */
  protected abstract mayEditSomething(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision;

  /** Whether the session may create this doc. `data.projectRef` is already known to match the id. */
  protected abstract mayCreate(
    id: ProjectDataId,
    project: ProjectAccess | null,
    data: JsonObject,
    context: SFAccessContext
  ): PolicyDecision;

  /** The owner of a doc, for rights that fall back to `_own` variants. */
  protected ownerOf(data: unknown): string | null {
    return ownerRefOf(data);
  }
}
