import { GatewaySession } from '../../../common/gateway/authorization';
import {
  ArrayOptions,
  arrayOf,
  booleanValue,
  DecodeFailure,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  literal,
  oneOf,
  ROOT_PATH,
  stringValue,
  success
} from '../../../common/gateway/decoder';
import { JsonObject } from '../../../common/gateway/json';
import { ANY_INDEX, ComponentAction, Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { Operation } from '../../../common/models/project-rights';
import { AnswerStatus } from '../../models/answer';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { ProjectAccess } from '../project-access';
import { ALLOWED, denied, PolicyDecision } from '../sf-collection-policy';
import { ProjectDataId } from '../sf-doc-ids';
import { hasRightsInAll, SFEditRuleContext } from './policy-helpers';
import {
  allDistinct,
  audioUrlValue,
  changesNothing,
  firstFailure,
  hasProjectRight,
  insertsNewDataId,
  insertsOwnEntity,
  insertsWithinList,
  isoDate,
  MAX_CREATED_ENTITIES,
  MAX_SHORT_STRING_LENGTH,
  objectIdValue,
  optionalField,
  ownerAt,
  SFComponentCheck,
  textValue,
  trueValue,
  userIdOf,
  verseRefValue
} from './sf-edit-rule-helpers';

/**
 * Whether an answer, comment or like is decoded as the client inserts it into an existing question (new: not deleted,
 * no status, likes or comments), or as it can be in the data of a question the client creates. Edits the user makes
 * to a question while its create is still pending are folded into the create data, so a created question's answers
 * can already be edited, deleted, liked or commented on by their owner.
 */
type EntityForm = 'inserted' | 'created';

/** What the checks need of a comment whose shape was accepted. */
interface DecodedComment {
  readonly dataId: string;
  readonly ownerRef: string;
  readonly deleted: boolean;
}

/** What the checks need of an answer whose shape was accepted. */
interface DecodedAnswer extends DecodedComment {
  readonly status: string;
  readonly comments: readonly DecodedComment[];
  readonly likeOwners: readonly string[];
}

const ANSWER_STATUSES: readonly string[] = [AnswerStatus.None, AnswerStatus.Resolved, AnswerStatus.Exportable];

/** A like: `{ ownerRef }`, exactly. */
const likeValue: Decoder<string> = (input: unknown, path: string): DecodeResult<string> => {
  const fields: DecodeResult<Fields<'ownerRef', never>> = exactFields(input, path, ['ownerRef']);
  if (!fields.ok) return fields;
  return objectIdValue(fields.value.required('ownerRef'), fields.value.path('ownerRef'));
};

type CommentFields = Fields<'dataId' | 'ownerRef' | 'dateCreated' | 'dateModified' | 'deleted', 'text' | 'audioUrl'>;

/**
 * A comment on an answer, as the client makes it (`checking.component.ts` `commentAction`). It never has `syncUserRef`,
 * which only the server sets.
 */
function commentValue(form: EntityForm): Decoder<DecodedComment> {
  return (input: unknown, path: string): DecodeResult<DecodedComment> => {
    const fields: DecodeResult<CommentFields> = exactFields(
      input,
      path,
      ['dataId', 'ownerRef', 'dateCreated', 'dateModified', 'deleted'],
      ['text', 'audioUrl']
    );
    if (!fields.ok) return fields;
    const f: CommentFields = fields.value;
    const dataId: DecodeResult<string> = objectIdValue(f.required('dataId'), f.path('dataId'));
    const ownerRef: DecodeResult<string> = objectIdValue(f.required('ownerRef'), f.path('ownerRef'));
    const deleted: DecodeResult<boolean> = (form === 'inserted' ? literal(false) : booleanValue)(
      f.required('deleted'),
      f.path('deleted')
    );
    const failed: DecodeFailure | undefined = firstFailure([
      dataId,
      ownerRef,
      isoDate(f.required('dateCreated'), f.path('dateCreated')),
      isoDate(f.required('dateModified'), f.path('dateModified')),
      deleted,
      optionalField(f, 'text', textValue),
      optionalField(f, 'audioUrl', audioUrlValue)
    ]);
    if (failed != null) return failed;
    if (!dataId.ok || !ownerRef.ok || !deleted.ok) return failure(path, 'invalid value');
    return success({ dataId: dataId.value, ownerRef: ownerRef.value, deleted: deleted.value });
  };
}

type AnswerFields = Fields<
  'dataId' | 'ownerRef' | 'likes' | 'dateCreated' | 'dateModified' | 'deleted' | 'comments' | 'status',
  'text' | 'scriptureText' | 'verseRef' | 'selectionStartClipped' | 'selectionEndClipped' | 'audioUrl'
>;

/**
 * An answer, as the client makes it (`checking.component.ts` `answerAction`). It never has `syncUserRef`, which only
 * the server sets.
 */
function answerValue(form: EntityForm): Decoder<DecodedAnswer> {
  return (input: unknown, path: string): DecodeResult<DecodedAnswer> => {
    const fields: DecodeResult<AnswerFields> = exactFields(
      input,
      path,
      ['dataId', 'ownerRef', 'likes', 'dateCreated', 'dateModified', 'deleted', 'comments', 'status'],
      ['text', 'scriptureText', 'verseRef', 'selectionStartClipped', 'selectionEndClipped', 'audioUrl']
    );
    if (!fields.ok) return fields;
    const f: AnswerFields = fields.value;
    const dataId: DecodeResult<string> = objectIdValue(f.required('dataId'), f.path('dataId'));
    const ownerRef: DecodeResult<string> = objectIdValue(f.required('ownerRef'), f.path('ownerRef'));
    const inserted: boolean = form === 'inserted';
    const deleted: DecodeResult<boolean> = (inserted ? literal(false) : booleanValue)(
      f.required('deleted'),
      f.path('deleted')
    );
    const status: DecodeResult<string> = (inserted ? literal('') : oneOf(ANSWER_STATUSES))(
      f.required('status'),
      f.path('status')
    );
    const entities: ArrayOptions = { maxLength: inserted ? 0 : MAX_CREATED_ENTITIES };
    const likeOwners: DecodeResult<readonly string[]> = arrayOf(likeValue, entities)(
      f.required('likes'),
      f.path('likes')
    );
    const comments: DecodeResult<readonly DecodedComment[]> = arrayOf(commentValue(form), entities)(
      f.required('comments'),
      f.path('comments')
    );
    const failed: DecodeFailure | undefined = firstFailure([
      dataId,
      ownerRef,
      isoDate(f.required('dateCreated'), f.path('dateCreated')),
      isoDate(f.required('dateModified'), f.path('dateModified')),
      deleted,
      status,
      likeOwners,
      comments,
      optionalField(f, 'text', textValue),
      optionalField(f, 'scriptureText', textValue),
      optionalField(f, 'verseRef', verseRefValue),
      optionalField(f, 'selectionStartClipped', booleanValue),
      optionalField(f, 'selectionEndClipped', booleanValue),
      optionalField(f, 'audioUrl', audioUrlValue)
    ]);
    if (failed != null) return failed;
    if (!dataId.ok || !ownerRef.ok || !deleted.ok || !status.ok || !likeOwners.ok || !comments.ok)
      return failure(path, 'invalid value');
    return success({
      dataId: dataId.value,
      ownerRef: ownerRef.value,
      deleted: deleted.value,
      status: status.value,
      comments: comments.value,
      likeOwners: likeOwners.value
    });
  };
}

/** Path depths of the entities in a question doc: an answer's path is ['answers', i], and so on. */
const ANSWER_DEPTH = 2;
const COMMENT_DEPTH = 4;
const LIKE_DEPTH = 4;

/** A change to a question's own field. Needs the questions edit right (as owner, `edit_own`, when someone has it). */
function questionField(
  field: string,
  value: Decoder<unknown>,
  actions: readonly ComponentAction[]
): Json0EditRule<SFEditRuleContext> {
  return {
    path: [field],
    actions: actions,
    value: value,
    allowed: (check: SFComponentCheck): boolean =>
      hasProjectRight(check, SFProjectDomain.Questions, Operation.Edit, ownerAt(check, 0))
  };
}

/**
 * A change to a field of an answer, allowed with `right` on the answer (an `_own` right for its owner). A change that
 * leaves the field as it is in the doc is allowed without the right. The client's `saveAnswer` sets all of an answer's
 * fields from a copy taken when the user started, so its op can name fields it does not change: once ShareDB has
 * transformed it past a concurrent edit, such a component can set the value already there. Refusing it would refuse the
 * user's real change too, such as an administrator's status change.
 */
function answerField(
  field: string,
  value: Decoder<unknown>,
  actions: readonly ComponentAction[],
  domain: SFProjectDomain,
  operation: Operation
): Json0EditRule<SFEditRuleContext> {
  return {
    path: ['answers', ANY_INDEX, field],
    actions: actions,
    value: value,
    allowed: (check: SFComponentCheck): boolean =>
      hasProjectRight(check, domain, operation, ownerAt(check, ANSWER_DEPTH)) || changesNothing(check)
  };
}

/** A change to a field of a comment, allowed with `operation` on comments (an `_own` right for its owner). */
function commentField(
  field: string,
  value: Decoder<unknown>,
  actions: readonly ComponentAction[],
  operation: Operation
): Json0EditRule<SFEditRuleContext> {
  return {
    path: ['answers', ANY_INDEX, 'comments', ANY_INDEX, field],
    actions: actions,
    value: value,
    allowed: (check: SFComponentCheck): boolean =>
      hasProjectRight(check, SFProjectDomain.AnswerComments, operation, ownerAt(check, COMMENT_DEPTH))
  };
}

/** Whether the user may remove the like at the component's path: their own like, as it is in the doc. */
function mayRemoveLike(check: SFComponentCheck): boolean {
  const owner: string | null = ownerAt(check, LIKE_DEPTH);
  return owner != null && hasProjectRight(check, SFProjectDomain.Likes, Operation.Delete, owner);
}

/**
 * Whether the user may insert the like the component inserts: their own, on an answer they do not like yet. When the
 * component replaces a like, the one it replaces does not count, since it goes.
 */
function mayInsertLike(check: SFComponentCheck): boolean {
  const userId: string = userIdOf(check);
  const likesBefore: number = check.countInList(check.path.length - 1, 'ownerRef', userId);
  const replaced: number = check.action === 'replace-item' && ownerAt(check, LIKE_DEPTH) === userId ? 1 : 0;
  return (
    insertsOwnEntity(check) &&
    likesBefore - replaced === 0 &&
    hasProjectRight(check, SFProjectDomain.Likes, Operation.Create, userId)
  );
}

/**
 * The edits clients may make to questions. Question fields need the questions edit right. Users add answers, comments
 * and likes as their own, edit and delete (by marking deleted) answers and comments as their rights allow, and remove
 * their own likes. An answer's status needs the answer status edit right. Answers and comments are never removed from
 * their lists or replaced whole, and no client changes ids, owners, creation dates or `syncUserRef`.
 */
export const QUESTION_EDIT_RULES: readonly Json0EditRule<SFEditRuleContext>[] = [
  questionField('verseRef', verseRefValue, ['set']),
  questionField('text', textValue, ['set', 'unset']),
  questionField('audioUrl', audioUrlValue, ['set', 'unset']),
  questionField('dateModified', isoDate, ['set']),
  questionField('isArchived', booleanValue, ['set']),
  questionField('dateArchived', isoDate, ['set', 'unset']),
  {
    path: ['answers', ANY_INDEX],
    actions: ['insert'],
    value: answerValue('inserted'),
    allowed: (check: SFComponentCheck): boolean =>
      insertsWithinList(check) &&
      insertsNewDataId(check) &&
      insertsOwnEntity(check) &&
      hasProjectRight(check, SFProjectDomain.Answers, Operation.Create, userIdOf(check))
  },
  answerField('text', textValue, ['set', 'unset'], SFProjectDomain.Answers, Operation.Edit),
  answerField('scriptureText', textValue, ['set', 'unset'], SFProjectDomain.Answers, Operation.Edit),
  answerField('verseRef', verseRefValue, ['set', 'unset'], SFProjectDomain.Answers, Operation.Edit),
  answerField('selectionStartClipped', booleanValue, ['set', 'unset'], SFProjectDomain.Answers, Operation.Edit),
  answerField('selectionEndClipped', booleanValue, ['set', 'unset'], SFProjectDomain.Answers, Operation.Edit),
  answerField('audioUrl', audioUrlValue, ['set', 'unset'], SFProjectDomain.Answers, Operation.Edit),
  answerField('dateModified', isoDate, ['set'], SFProjectDomain.Answers, Operation.Edit),
  answerField('status', oneOf(ANSWER_STATUSES), ['set', 'unset'], SFProjectDomain.AnswerStatus, Operation.Edit),
  answerField('deleted', trueValue, ['set'], SFProjectDomain.Answers, Operation.Delete),
  {
    path: ['answers', ANY_INDEX, 'comments', ANY_INDEX],
    actions: ['insert'],
    value: commentValue('inserted'),
    allowed: (check: SFComponentCheck): boolean =>
      insertsWithinList(check) &&
      insertsNewDataId(check) &&
      insertsOwnEntity(check) &&
      hasProjectRight(check, SFProjectDomain.AnswerComments, Operation.Create, userIdOf(check))
  },
  commentField('text', textValue, ['set', 'unset'], Operation.Edit),
  commentField('audioUrl', audioUrlValue, ['set', 'unset'], Operation.Edit),
  commentField('dateModified', isoDate, ['set'], Operation.Edit),
  commentField('deleted', trueValue, ['set'], Operation.Delete),
  {
    path: ['answers', ANY_INDEX, 'likes', ANY_INDEX],
    actions: ['insert'],
    value: likeValue,
    allowed: (check: SFComponentCheck): boolean => insertsWithinList(check) && mayInsertLike(check)
  },
  { path: ['answers', ANY_INDEX, 'likes', ANY_INDEX], actions: ['remove'], allowed: mayRemoveLike },
  {
    // The client never replaces a like, but ShareDB can make a removal and an insert at the same index into one.
    path: ['answers', ANY_INDEX, 'likes', ANY_INDEX],
    actions: ['replace-item'],
    value: likeValue,
    allowed: (check: SFComponentCheck): boolean => mayRemoveLike(check) && mayInsertLike(check)
  }
];

type QuestionFields = Fields<
  'dataId' | 'projectRef' | 'ownerRef' | 'verseRef' | 'answers' | 'isArchived' | 'dateCreated' | 'dateModified',
  'text' | 'audioUrl' | 'dateArchived' | 'transceleratorQuestionId' | 'paratextNoteId'
>;

/**
 * Whether the session may create this question. The question dialog and the question import make questions of the
 * same shape, owned by the user, with a new id, unarchived and without answers, which needs the questions create right.
 * Edits made while the create was pending are folded into it (see EntityForm), so the question may also be archived,
 * which needs the questions edit right, and have answers, comments and likes, all the user's own, each needing the
 * rights the edit rules would require for it.
 */
export function checkQuestionCreate(
  id: ProjectDataId,
  project: ProjectAccess | null,
  data: JsonObject,
  session: GatewaySession
): PolicyDecision {
  const fields: DecodeResult<QuestionFields> = exactFields(
    data,
    ROOT_PATH,
    ['dataId', 'projectRef', 'ownerRef', 'verseRef', 'answers', 'isArchived', 'dateCreated', 'dateModified'],
    ['text', 'audioUrl', 'dateArchived', 'transceleratorQuestionId', 'paratextNoteId']
  );
  if (!fields.ok) {
    return denied(`not a question: ${fields.message}`);
  }
  const f: QuestionFields = fields.value;
  const userId: string = session.userId;
  if (f.required('ownerRef') !== userId) {
    return denied('the question must be owned by the user');
  }
  const dataId: DecodeResult<string> = objectIdValue(f.required('dataId'), f.path('dataId'));
  if (!dataId.ok || dataId.value !== id.dataId) {
    return denied('the data id must be a new id equal to the id of the doc');
  }
  const isArchived: DecodeResult<boolean> = booleanValue(f.required('isArchived'), f.path('isArchived'));
  const answers: DecodeResult<readonly DecodedAnswer[]> = arrayOf(answerValue('created'), {
    maxLength: MAX_CREATED_ENTITIES
  })(f.required('answers'), f.path('answers'));
  const importId: Decoder<string> = stringValue({ minLength: 1, maxLength: MAX_SHORT_STRING_LENGTH });
  const failed: DecodeFailure | undefined = firstFailure([
    verseRefValue(f.required('verseRef'), f.path('verseRef')),
    isArchived,
    answers,
    isoDate(f.required('dateCreated'), f.path('dateCreated')),
    isoDate(f.required('dateModified'), f.path('dateModified')),
    optionalField(f, 'text', textValue),
    optionalField(f, 'audioUrl', audioUrlValue),
    optionalField(f, 'dateArchived', isoDate),
    optionalField(f, 'transceleratorQuestionId', importId),
    optionalField(f, 'paratextNoteId', importId)
  ]);
  if (failed != null) {
    return denied(`not a question: ${failed.path}: ${failed.message}`);
  }
  if (!isArchived.ok || !answers.ok) {
    return denied('not a question');
  }
  if (f.has('dateArchived') && !isArchived.value) {
    return denied('only an archived question has an archive date');
  }
  if (f.has('transceleratorQuestionId') && f.has('paratextNoteId')) {
    return denied('a question is imported from Transcelerator or from Paratext notes, not both');
  }
  // As when they are inserted into an existing question (see insertsNewDataId and mayInsertLike).
  if (!allDistinct(answers.value.map((answer: DecodedAnswer) => answer.dataId))) {
    return denied('two answers have the same data id');
  }
  for (const answer of answers.value) {
    if (!allDistinct(answer.comments.map((comment: DecodedComment) => comment.dataId))) {
      return denied('two comments on an answer have the same data id');
    }
    if (!allDistinct(answer.likeOwners)) {
      return denied('a user likes an answer more than once');
    }
  }

  const right = (domain: SFProjectDomain, operation: Operation): PolicyDecision =>
    hasRightsInAll(project, userId, [domain], operation, userId);
  const decisions: PolicyDecision[] = [right(SFProjectDomain.Questions, Operation.Create)];
  if (isArchived.value) {
    decisions.push(right(SFProjectDomain.Questions, Operation.Edit));
  }
  for (const answer of answers.value) {
    decisions.push(ownedByUser(answer, userId), right(SFProjectDomain.Answers, Operation.Create));
    if (answer.deleted) {
      decisions.push(right(SFProjectDomain.Answers, Operation.Delete));
    }
    if (answer.status !== AnswerStatus.None) {
      decisions.push(right(SFProjectDomain.AnswerStatus, Operation.Edit));
    }
    for (const comment of answer.comments) {
      decisions.push(ownedByUser(comment, userId), right(SFProjectDomain.AnswerComments, Operation.Create));
      if (comment.deleted) {
        decisions.push(right(SFProjectDomain.AnswerComments, Operation.Delete));
      }
    }
    for (const likeOwner of answer.likeOwners) {
      decisions.push(
        likeOwner === userId ? ALLOWED : denied("likes must be the user's own"),
        right(SFProjectDomain.Likes, Operation.Create)
      );
    }
  }
  return decisions.find((decision: PolicyDecision) => !decision.allowed) ?? ALLOWED;
}

/** Answers and comments in a created question can only be the user's own: nobody else could see the question yet. */
function ownedByUser(entity: DecodedComment, userId: string): PolicyDecision {
  return entity.ownerRef === userId ? ALLOWED : denied("answers and comments must be the user's own");
}
