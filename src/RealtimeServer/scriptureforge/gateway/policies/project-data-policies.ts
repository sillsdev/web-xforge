import { JsonObject } from '../../../common/gateway/json';
import { Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { Operation } from '../../../common/models/project-rights';
import { hasOwnProp } from '../../../common/utils/type-utils';
import { BIBLICAL_TERM_COLLECTION } from '../../models/biblical-term';
import { NOTE_THREAD_COLLECTION } from '../../models/note-thread';
import { QUESTIONS_COLLECTION } from '../../models/question';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { TRAINING_DATA_COLLECTION } from '../../models/training-data';
import { ProjectAccess } from '../project-access';
import { ALLOWED, denied, PolicyDecision } from '../sf-collection-policy';
import { isServalAdmin, SFAccessContext } from '../sf-access-context';
import { ProjectDataId } from '../sf-doc-ids';
import { BIBLICAL_TERM_EDIT_RULES } from './biblical-term-rules';
import { checkNoteThreadCreate, NOTE_THREAD_EDIT_RULES } from './note-thread-rules';
import { hasRightsInAll, SFEditRuleContext } from './policy-helpers';
import { ProjectDataPolicy } from './project-data-policy';
import { checkQuestionCreate, QUESTION_EDIT_RULES } from './question-rules';
import { checkTrainingDataCreate } from './training-data-rules';

/**
 * The domains a question doc holds. Reading a question needs the view right in all of them, as the server's
 * QuestionService decides it: the doc carries the question with its answers, comments, statuses and likes.
 */
const QUESTION_DOMAINS: readonly SFProjectDomain[] = [
  SFProjectDomain.Questions,
  SFProjectDomain.Answers,
  SFProjectDomain.AnswerComments,
  SFProjectDomain.AnswerStatus,
  SFProjectDomain.Likes
];

/** The rights of which a user needs at least one to make any edit to questions. */
const QUESTION_EDIT_RIGHTS: readonly [SFProjectDomain, Operation][] = [
  [SFProjectDomain.Questions, Operation.Edit],
  [SFProjectDomain.Answers, Operation.Create],
  [SFProjectDomain.AnswerComments, Operation.Create],
  [SFProjectDomain.AnswerStatus, Operation.Edit],
  [SFProjectDomain.Likes, Operation.Create]
];

/** The rights of which a user needs at least one to make any edit to note threads. */
const NOTE_THREAD_EDIT_RIGHTS: readonly [SFProjectDomain, Operation][] = [
  [SFProjectDomain.Notes, Operation.Create],
  [SFProjectDomain.PTNoteThreads, Operation.Edit],
  [SFProjectDomain.SFNoteThreads, Operation.Edit],
  [SFProjectDomain.Texts, Operation.Edit]
];

/** `questions`: community checking questions with their answers, comments and likes. */
export class QuestionsPolicy extends ProjectDataPolicy {
  readonly name: string = QUESTIONS_COLLECTION;
  readonly readDependsOn: readonly string[] = ['projectRef', 'ownerRef'];
  protected readonly editRules: readonly Json0EditRule<SFEditRuleContext>[] = QUESTION_EDIT_RULES;

  protected mayReadAnyDoc(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    return hasRightsInAll(project, context.session.userId, QUESTION_DOMAINS, Operation.View, null);
  }

  protected mayReadDoc(project: ProjectAccess | null, data: unknown, context: SFAccessContext): PolicyDecision {
    return hasRightsInAll(project, context.session.userId, QUESTION_DOMAINS, Operation.View, this.ownerOf(data));
  }

  protected mayEditSomething(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    const read: PolicyDecision = this.mayReadAnyDoc(project, context);
    if (!read.allowed || project == null) {
      return read;
    }
    // Some edit rule must be able to apply; the rules decide each change. Rights to edit or delete one's own answers
    // and comments come with the right to create them.
    return QUESTION_EDIT_RIGHTS.some(([domain, operation]) =>
      project.hasRight(context.session.userId, domain, operation, null)
    )
      ? ALLOWED
      : denied('the user may not change questions');
  }

  protected mayCreate(
    id: ProjectDataId,
    project: ProjectAccess | null,
    data: JsonObject,
    context: SFAccessContext
  ): PolicyDecision {
    return checkQuestionCreate(id, project, data, context.session);
  }
}

/**
 * `note_threads`: Paratext notes and Scripture Forge comments. Threads that are not published to Scripture Forge are
 * readable only with the Paratext note thread view right; published ones also with the Scripture Forge one (commenters
 * and Scripture Forge observers). `publishedToSF` is in the doc and can change, so reading depends on it.
 */
export class NoteThreadsPolicy extends ProjectDataPolicy {
  readonly name: string = NOTE_THREAD_COLLECTION;
  readonly readDependsOn: readonly string[] = ['projectRef', 'ownerRef', 'publishedToSF'];
  protected readonly editRules: readonly Json0EditRule<SFEditRuleContext>[] = NOTE_THREAD_EDIT_RULES;

  protected mayReadAnyDoc(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    // Where no thread is, whether one would be published is unknown, so only those who may read both kinds may read.
    return hasRightsInAll(
      project,
      context.session.userId,
      [SFProjectDomain.PTNoteThreads, SFProjectDomain.SFNoteThreads, SFProjectDomain.Notes],
      Operation.View,
      null
    );
  }

  protected mayReadDoc(project: ProjectAccess | null, data: unknown, context: SFAccessContext): PolicyDecision {
    const published: boolean = hasOwnProp(data, 'publishedToSF') && data.publishedToSF === true;
    const threadDomain: SFProjectDomain = published ? SFProjectDomain.SFNoteThreads : SFProjectDomain.PTNoteThreads;
    return hasRightsInAll(
      project,
      context.session.userId,
      [threadDomain, SFProjectDomain.Notes],
      Operation.View,
      this.ownerOf(data)
    );
  }

  protected mayEditSomething(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    const userId: string = context.session.userId;
    const canViewThreads: boolean =
      project != null &&
      (project.hasRight(userId, SFProjectDomain.PTNoteThreads, Operation.View, null) ||
        project.hasRight(userId, SFProjectDomain.SFNoteThreads, Operation.View, null));
    if (!canViewThreads || project == null) {
      return denied('the user may not view note threads');
    }
    const view: PolicyDecision = hasRightsInAll(project, userId, [SFProjectDomain.Notes], Operation.View, null);
    if (!view.allowed) {
      return view;
    }
    // Some edit rule must be able to apply: inserting notes, editing threads, or moving thread anchors when editing
    // text. Rights to edit or delete one's own notes come with the right to create them.
    return NOTE_THREAD_EDIT_RIGHTS.some(([domain, operation]) => project.hasRight(userId, domain, operation, null))
      ? ALLOWED
      : denied('the user may not change note threads');
  }

  protected mayCreate(
    id: ProjectDataId,
    project: ProjectAccess | null,
    data: JsonObject,
    context: SFAccessContext
  ): PolicyDecision {
    return checkNoteThreadCreate(id, project, data, context.session);
  }
}

/** `biblical_terms`: the project's Biblical Terms, whose renderings and description translators edit. */
export class BiblicalTermsPolicy extends ProjectDataPolicy {
  readonly name: string = BIBLICAL_TERM_COLLECTION;
  readonly readDependsOn: readonly string[] = ['projectRef'];
  protected readonly editRules: readonly Json0EditRule<SFEditRuleContext>[] = BIBLICAL_TERM_EDIT_RULES;

  protected mayReadAnyDoc(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.BiblicalTerms], Operation.View, null);
  }

  protected mayReadDoc(project: ProjectAccess | null, _data: unknown, context: SFAccessContext): PolicyDecision {
    return this.mayReadAnyDoc(project, context);
  }

  protected mayEditSomething(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.BiblicalTerms], Operation.Edit, null);
  }

  protected mayCreate(): PolicyDecision {
    return denied('clients do not create biblical terms');
  }
}

/**
 * `training_data`: files uploaded for draft generation. Translators and administrators of the project, and Serval
 * administrators (the Serval project page), may read them. Clients create them; the backend marks them deleted.
 */
export class TrainingDataPolicy extends ProjectDataPolicy {
  readonly name: string = TRAINING_DATA_COLLECTION;
  readonly readDependsOn: readonly string[] = ['projectRef', 'ownerRef'];
  protected readonly editRules: readonly Json0EditRule<SFEditRuleContext>[] = [];

  protected mayReadAnyDoc(project: ProjectAccess | null, context: SFAccessContext): PolicyDecision {
    if (isServalAdmin(context.session)) {
      return ALLOWED;
    }
    return hasRightsInAll(project, context.session.userId, [SFProjectDomain.TrainingData], Operation.View, null);
  }

  protected mayReadDoc(project: ProjectAccess | null, data: unknown, context: SFAccessContext): PolicyDecision {
    if (isServalAdmin(context.session)) {
      return ALLOWED;
    }
    return hasRightsInAll(
      project,
      context.session.userId,
      [SFProjectDomain.TrainingData],
      Operation.View,
      this.ownerOf(data)
    );
  }

  protected mayEditSomething(): PolicyDecision {
    return denied('clients do not edit training data');
  }

  protected mayCreate(
    id: ProjectDataId,
    project: ProjectAccess | null,
    data: JsonObject,
    context: SFAccessContext
  ): PolicyDecision {
    return checkTrainingDataCreate(id, project, data, context.session);
  }
}
