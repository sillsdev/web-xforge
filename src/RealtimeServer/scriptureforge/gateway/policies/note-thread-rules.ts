import { GatewaySession } from '../../../common/gateway/authorization';
import {
  arrayOf,
  booleanValue,
  DecodeFailure,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  integerValue,
  literal,
  oneOf,
  ROOT_PATH,
  stringValue,
  success
} from '../../../common/gateway/decoder';
import { JsonObject } from '../../../common/gateway/json';
import { ANY_INDEX, ComponentAction, Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { Operation } from '../../../common/models/project-rights';
import { hasOwnProp } from '../../../common/utils/type-utils';
import { NoteConflictType, NoteStatus, NoteType } from '../../models/note-thread';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { TextInfoPermission } from '../../models/text-info-permission';
import { ProjectAccess } from '../project-access';
import { ALLOWED, denied, PolicyDecision } from '../sf-collection-policy';
import { ProjectDataId } from '../sf-doc-ids';
import { hasRightsInAll, SFEditRuleContext } from './policy-helpers';
import {
  allDistinct,
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
  ownerRefOfValue,
  SFComponentCheck,
  shortString,
  textAnchorValue,
  textValue,
  trueValue,
  userIdOf,
  VerseRefValue,
  verseRefValue
} from './sf-edit-rule-helpers';

/** Every thread status. Paratext's own notes can have any of them. */
const THREAD_STATUSES: readonly string[] = [
  NoteStatus.Unspecified,
  NoteStatus.Todo,
  NoteStatus.Done,
  NoteStatus.Resolved
];

/** The statuses the client gives a note it makes, and a thread when a note is added or edited: open or resolved. */
const CLIENT_NOTE_STATUSES: readonly string[] = [NoteStatus.Todo, NoteStatus.Resolved];

/** The tag id range accepted on a note. Paratext tag ids are small positive numbers; Biblical Terms notes use -3. */
const tagIdValue: Decoder<number> = integerValue({ min: -0x80000000, max: 0x7fffffff });

/**
 * The longest thread id accepted on a note. Threads the client makes have a new id, or `BT_${termId}` when they are about
 * a biblical term; threads from Paratext have Paratext's ids.
 */
const MAX_THREAD_ID_LENGTH = 3 + MAX_SHORT_STRING_LENGTH;

/** Path depth of a note in a thread doc: ['notes', i]. */
const NOTE_DEPTH = 2;

/**
 * Whether a note is decoded as the client adds it to an existing thread (new: not deleted), or as it can be in the
 * data of a thread the client creates, where edits made while the create was pending are folded in (so the note can
 * already be edited or deleted).
 */
type NoteForm = 'inserted' | 'created';

/** What the checks need of a note whose shape was accepted. */
interface DecodedNote {
  readonly dataId: string;
  readonly ownerRef: string;
  readonly threadId: string;
  readonly deleted: boolean;
}

type NoteFields = Fields<
  | 'dateCreated'
  | 'dateModified'
  | 'threadId'
  | 'dataId'
  | 'ownerRef'
  | 'conflictType'
  | 'type'
  | 'status'
  | 'deleted'
  | 'editable'
  | 'versionNumber',
  'tagId' | 'content'
>;

/**
 * A note as the client makes it (`editor.component.ts` and `biblical-terms.component.ts` `saveNote`): an editable,
 * first-version, normal note, open or resolved, with XML-encoded content unless it only resolves the thread. It never has
 * `syncUserRef`, `reattached`, `assignment` or `acceptedChangeXml`, which come from Paratext.
 */
function noteValue(form: NoteForm): Decoder<DecodedNote> {
  return (input: unknown, path: string): DecodeResult<DecodedNote> => {
    const fields: DecodeResult<NoteFields> = exactFields(
      input,
      path,
      [
        'dateCreated',
        'dateModified',
        'threadId',
        'dataId',
        'ownerRef',
        'conflictType',
        'type',
        'status',
        'deleted',
        'editable',
        'versionNumber'
      ],
      ['tagId', 'content']
    );
    if (!fields.ok) return fields;
    const f: NoteFields = fields.value;
    const dataId: DecodeResult<string> = objectIdValue(f.required('dataId'), f.path('dataId'));
    const ownerRef: DecodeResult<string> = objectIdValue(f.required('ownerRef'), f.path('ownerRef'));
    const threadId: DecodeResult<string> = stringValue({ minLength: 1, maxLength: MAX_THREAD_ID_LENGTH })(
      f.required('threadId'),
      f.path('threadId')
    );
    const deleted: DecodeResult<boolean> = (form === 'inserted' ? literal(false) : booleanValue)(
      f.required('deleted'),
      f.path('deleted')
    );
    const failed: DecodeFailure | undefined = firstFailure([
      isoDate(f.required('dateCreated'), f.path('dateCreated')),
      isoDate(f.required('dateModified'), f.path('dateModified')),
      threadId,
      dataId,
      ownerRef,
      literal(NoteConflictType.DefaultValue)(f.required('conflictType'), f.path('conflictType')),
      literal(NoteType.Normal)(f.required('type'), f.path('type')),
      oneOf(CLIENT_NOTE_STATUSES)(f.required('status'), f.path('status')),
      deleted,
      literal(true)(f.required('editable'), f.path('editable')),
      literal(1)(f.required('versionNumber'), f.path('versionNumber')),
      optionalField(f, 'tagId', tagIdValue),
      optionalField(f, 'content', textValue)
    ]);
    if (failed != null) return failed;
    if (!dataId.ok || !ownerRef.ok || !threadId.ok || !deleted.ok) return failure(path, 'invalid value');
    return success({
      dataId: dataId.value,
      ownerRef: ownerRef.value,
      threadId: threadId.value,
      deleted: deleted.value
    });
  };
}

/** The thread domain a thread's rights come from: the Scripture Forge one when it is published to Scripture Forge. */
function threadDomainOf(thread: unknown): SFProjectDomain {
  return hasOwnProp(thread, 'publishedToSF') && thread.publishedToSF === true
    ? SFProjectDomain.SFNoteThreads
    : SFProjectDomain.PTNoteThreads;
}

/** Whether the user may edit the thread itself, as the server's NoteThreadService decides it. */
function mayEditThread(check: SFComponentCheck): boolean {
  return hasProjectRight(check, threadDomainOf(check.doc), Operation.Edit, ownerAt(check, 0));
}

/** Whether the user may add notes to the thread. Reading the thread is already required of every edit. */
function mayAddNotes(check: SFComponentCheck): boolean {
  return hasProjectRight(check, SFProjectDomain.Notes, Operation.Create, null);
}

/**
 * Whether the user may edit the text of the thread's chapter, so that their text edits move the thread's position: the
 * texts edit right, and write permission on the chapter (as the texts policy requires to edit it).
 */
function mayEditThreadChapter(check: SFComponentCheck): boolean {
  const verseRef: DecodeResult<VerseRefValue> = verseRefValue(verseRefOf(check.doc), ROOT_PATH);
  const project: ProjectAccess | null = check.context.project;
  if (!verseRef.ok || project == null || !hasProjectRight(check, SFProjectDomain.Texts, Operation.Edit, null)) {
    return false;
  }
  const permission: string | undefined = project.textPermission(
    userIdOf(check),
    verseRef.value.bookNum,
    verseRef.value.chapterNum
  );
  return permission === TextInfoPermission.Write;
}

function verseRefOf(thread: unknown): unknown {
  return hasOwnProp(thread, 'verseRef') ? thread.verseRef : undefined;
}

/**
 * Whether the note at the component's path, as it is in the doc, is one the user may change with `operation` on notes
 * (an `_own` right for its owner), and one made in Scripture Forge (`editable`). The client offers edits and deletes
 * only for those; Paratext's own notes are changed in Paratext.
 */
function mayChangeNote(check: SFComponentCheck, operation: Operation): boolean {
  const note: unknown = check.valueAt(NOTE_DEPTH);
  const owner: string | null = ownerRefOfValue(note);
  const editable: boolean = hasOwnProp(note, 'editable') && note.editable === true;
  return owner != null && editable && hasProjectRight(check, SFProjectDomain.Notes, operation, owner);
}

/** A change to a field of a note: the user's own note, made in Scripture Forge. */
function noteField(
  field: string,
  value: Decoder<unknown>,
  actions: readonly ComponentAction[],
  operation: Operation
): Json0EditRule<SFEditRuleContext> {
  return {
    path: ['notes', ANY_INDEX, field],
    actions: actions,
    value: value,
    allowed: (check: SFComponentCheck): boolean => mayChangeNote(check, operation)
  };
}

/** The thread's `threadId` in the doc. */
function threadIdOf(thread: unknown): unknown {
  return hasOwnProp(thread, 'threadId') ? thread.threadId : undefined;
}

/**
 * The edits clients may make to note threads. `publishedToSF`, which decides who may read a thread, and the thread's
 * identity and anchor text are never changed by clients; notes are never removed or replaced whole.
 */
export const NOTE_THREAD_EDIT_RULES: readonly Json0EditRule<SFEditRuleContext>[] = [
  {
    // Thread editors may set any status.
    path: ['status'],
    actions: ['set'],
    value: oneOf(THREAD_STATUSES),
    allowed: mayEditThread
  },
  {
    // When the client adds a note to a thread, or edits its last note, it also sets the thread's status to the note's,
    // open or resolved. Commenters do that without the thread edit right, such as when they reply to a resolved thread
    // and so reopen it. Anyone who may add notes may make this change: adding a note that only resolves or reopens the
    // thread (which the client does for "resolve" without text) would make it anyway.
    path: ['status'],
    actions: ['set'],
    value: oneOf(CLIENT_NOTE_STATUSES),
    allowed: mayAddNotes
  },
  {
    // The editor moves the anchors of the threads in a chapter when the user edits its text, and puts a thread's anchor
    // back when an edit is undone (which unsets it if it had none). It does so for any thread the user can see there.
    path: ['position'],
    actions: ['set', 'unset'],
    value: textAnchorValue,
    allowed: (check: SFComponentCheck): boolean => mayEditThread(check) || mayEditThreadChapter(check)
  },
  {
    path: ['notes', ANY_INDEX],
    actions: ['insert'],
    value: noteValue('inserted'),
    allowed: (check: SFComponentCheck): boolean =>
      insertsWithinList(check) &&
      insertsNewDataId(check) &&
      insertsOwnEntity(check) &&
      hasOwnProp(check.inserted, 'threadId') &&
      check.inserted.threadId === threadIdOf(check.doc) &&
      hasProjectRight(check, SFProjectDomain.Notes, Operation.Create, userIdOf(check))
  },
  noteField('content', textValue, ['set', 'unset'], Operation.Edit),
  noteField('dateModified', isoDate, ['set'], Operation.Edit),
  noteField('status', oneOf(CLIENT_NOTE_STATUSES), ['set'], Operation.Edit),
  noteField('deleted', trueValue, ['set'], Operation.Delete)
];

type NoteThreadFields = Fields<
  | 'dataId'
  | 'threadId'
  | 'verseRef'
  | 'projectRef'
  | 'ownerRef'
  | 'notes'
  | 'position'
  | 'originalContextBefore'
  | 'originalContextAfter'
  | 'status'
  | 'publishedToSF',
  'originalSelectedText' | 'biblicalTermId' | 'extraHeadingInfo'
>;

type HeadingKey = 'gloss' | 'language' | 'lemma' | 'transliteration';
const HEADING_KEYS: readonly HeadingKey[] = ['gloss', 'language', 'lemma', 'transliteration'];

/** The heading of a thread about a biblical term: `{ gloss, language, lemma, transliteration }`. */
const extraHeadingInfoValue: Decoder<unknown> = (input: unknown, path: string): DecodeResult<unknown> => {
  const fields: DecodeResult<Fields<HeadingKey, never>> = exactFields(input, path, HEADING_KEYS);
  if (!fields.ok) return fields;
  const failed: DecodeFailure | undefined = firstFailure(
    HEADING_KEYS.map((key: HeadingKey) => shortString(fields.value.required(key), fields.value.path(key)))
  );
  return failed ?? success(input);
};

/**
 * Whether the session may create this note thread. The editor and the Biblical Terms panel make threads of the same
 * shape: owned by the user, with a new id, published to Scripture Forge, open, and with one note of the user's. A
 * Biblical Terms thread also names its term, and its thread id is `BT_` and the term id. This needs the create rights of
 * Scripture Forge threads and of notes. Edits made while the create was pending are folded into it, so the thread can
 * have more of the user's notes, edited or deleted ones, another status and a moved position.
 */
export function checkNoteThreadCreate(
  id: ProjectDataId,
  project: ProjectAccess | null,
  data: JsonObject,
  session: GatewaySession
): PolicyDecision {
  const fields: DecodeResult<NoteThreadFields> = exactFields(
    data,
    ROOT_PATH,
    [
      'dataId',
      'threadId',
      'verseRef',
      'projectRef',
      'ownerRef',
      'notes',
      'position',
      'originalContextBefore',
      'originalContextAfter',
      'status',
      'publishedToSF'
    ],
    ['originalSelectedText', 'biblicalTermId', 'extraHeadingInfo']
  );
  if (!fields.ok) {
    return denied(`not a note thread: ${fields.message}`);
  }
  const f: NoteThreadFields = fields.value;
  const userId: string = session.userId;
  if (f.required('ownerRef') !== userId) {
    return denied('the thread must be owned by the user');
  }
  const dataId: DecodeResult<string> = objectIdValue(f.required('dataId'), f.path('dataId'));
  if (!dataId.ok || dataId.value !== id.dataId) {
    return denied('the data id must be a new id equal to the id of the doc');
  }
  const biblicalTermId: DecodeResult<string | undefined> = optionalField(
    f,
    'biblicalTermId',
    stringValue({ minLength: 1, maxLength: MAX_SHORT_STRING_LENGTH })
  );
  const threadId: DecodeResult<string> =
    biblicalTermId.ok && biblicalTermId.value != null
      ? literal(`BT_${biblicalTermId.value}`)(f.required('threadId'), f.path('threadId'))
      : objectIdValue(f.required('threadId'), f.path('threadId'));
  const notes: DecodeResult<readonly DecodedNote[]> = arrayOf(noteValue('created'), {
    minLength: 1,
    maxLength: MAX_CREATED_ENTITIES
  })(f.required('notes'), f.path('notes'));
  const failed: DecodeFailure | undefined = firstFailure([
    biblicalTermId,
    threadId,
    verseRefValue(f.required('verseRef'), f.path('verseRef')),
    notes,
    textAnchorValue(f.required('position'), f.path('position')),
    textValue(f.required('originalContextBefore'), f.path('originalContextBefore')),
    textValue(f.required('originalContextAfter'), f.path('originalContextAfter')),
    optionalField(f, 'originalSelectedText', textValue),
    oneOf(CLIENT_NOTE_STATUSES)(f.required('status'), f.path('status')),
    literal(true)(f.required('publishedToSF'), f.path('publishedToSF')),
    optionalField(f, 'extraHeadingInfo', extraHeadingInfoValue)
  ]);
  if (failed != null) {
    return denied(`not a note thread: ${failed.path}: ${failed.message}`);
  }
  if (!notes.ok || !threadId.ok) {
    return denied('not a note thread');
  }
  if (f.has('extraHeadingInfo') && !f.has('biblicalTermId')) {
    return denied('only a thread about a biblical term has its heading');
  }
  // As when they are inserted into an existing thread (see insertsNewDataId).
  if (!allDistinct(notes.value.map((note: DecodedNote) => note.dataId))) {
    return denied('two notes have the same data id');
  }

  const right = (domain: SFProjectDomain, operation: Operation): PolicyDecision =>
    hasRightsInAll(project, userId, [domain], operation, userId);
  const decisions: PolicyDecision[] = [
    right(SFProjectDomain.SFNoteThreads, Operation.Create),
    right(SFProjectDomain.Notes, Operation.Create)
  ];
  for (const note of notes.value) {
    // Nobody else could see the thread yet, so every note is the user's own.
    decisions.push(note.ownerRef === userId ? ALLOWED : denied("notes must be the user's own"));
    decisions.push(note.threadId === threadId.value ? ALLOWED : denied("a note's thread id must be its thread's"));
    if (note.deleted) {
      decisions.push(right(SFProjectDomain.Notes, Operation.Delete));
    }
  }
  return decisions.find((decision: PolicyDecision) => !decision.allowed) ?? ALLOWED;
}
