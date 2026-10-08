import { OpEdit } from '../../../common/gateway/inbound-messages';
import { JsonObject } from '../../../common/gateway/json';
import { Operation } from '../../../common/models/project-rights';
import { TEXT_AUDIO_COLLECTION } from '../../models/text-audio';
import { TEXTS_COLLECTION } from '../../models/text-data';
import { TextInfoPermission } from '../../models/text-info-permission';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { ProjectAccess } from '../project-access';
import { ALLOWED, CollectionPolicy, denied, PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';
import { ChapterDocId, isHexId, parseChapterDocId } from '../sf-doc-ids';
import { hasRightsInAll, loadProject, noClientCreates, noClientEdits, projectRefOf } from './policy-helpers';

/**
 * `texts`, the rich-text chapters of a project, at `${projectId}:${BOOK}:${chapter}:target`. Every member may read
 * every chapter (per-chapter Paratext read permissions are not enforced). Editing needs the texts edit right and,
 * as the client decides it, the user's Paratext write permission for the chapter (TextDocService.canEdit). The
 * backend creates and deletes texts.
 */
export class TextsPolicy implements CollectionPolicy {
  readonly name: string = TEXTS_COLLECTION;
  readonly storedIn: string = TEXTS_COLLECTION;
  readonly readDependsOn: readonly string[] = [];

  async readById(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ChapterDocId | undefined = parseChapterDocId(docId);
    if (id == null) {
      return denied('not a text id');
    }
    const project: ProjectAccess | null = await loadProject(id.projectId, context);
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.Texts], Operation.View, null);
  }

  read(docId: string, _data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    return this.readById(docId, context);
  }

  async mayEdit(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ChapterDocId | undefined = parseChapterDocId(docId);
    if (id == null) {
      return denied('not a text id');
    }
    const project: ProjectAccess | null = await loadProject(id.projectId, context);
    const right: PolicyDecision = hasRightsInAll(
      project,
      context.session.userId,
      [SFProjectDomain.Texts],
      Operation.Edit,
      null
    );
    if (!right.allowed || project == null) {
      return right;
    }
    // The client's TextDocService.hasChapterEditPermissionForText: the chapter's permission, else the book's, must be
    // write. A chapter the project does not list has no permission.
    const permission: string | undefined = project.textPermission(context.session.userId, id.bookNum, id.chapterNum);
    return permission === TextInfoPermission.Write ? ALLOWED : denied('the user may not edit this chapter');
  }

  create(_docId: string, _data: JsonObject, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientCreates();
  }

  async edit(docId: string, _data: unknown, edit: OpEdit, context: SFAccessContext): Promise<PolicyDecision> {
    if (edit.otType !== 'rich-text') {
      return denied('the edit is not a rich-text op');
    }
    return this.mayEdit(docId, context);
  }
}

/**
 * `text_audio`, the audio and timing data of a chapter: readable by members with the text audio view right. Clients
 * change chapter audio only through the backend's RPCs.
 */
export class TextAudioPolicy implements CollectionPolicy {
  readonly name: string = TEXT_AUDIO_COLLECTION;
  readonly storedIn: string = TEXT_AUDIO_COLLECTION;
  readonly readDependsOn: readonly string[] = ['projectRef'];

  async readById(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    const id: ChapterDocId | undefined = parseChapterDocId(docId);
    if (id == null) {
      return denied('not a text audio id');
    }
    const project: ProjectAccess | null = await loadProject(id.projectId, context);
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.TextAudio], Operation.View, null);
  }

  async read(_docId: string, data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    // As the server's own rules do, an existing doc is read by the project it names.
    const projectRef: string | null = projectRefOf(data);
    if (projectRef == null || !isHexId(projectRef)) {
      return denied('the doc names no project');
    }
    const project: ProjectAccess | null = await loadProject(projectRef, context);
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.TextAudio], Operation.View, null);
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
