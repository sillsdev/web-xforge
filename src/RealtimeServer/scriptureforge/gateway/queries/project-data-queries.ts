import {
  GatewaySession,
  QueryAuthorization,
  QueryRegistryEntry,
  registerQuery,
  RegisteredQuery
} from '../../../common/gateway/authorization';
import { Fields, integerValue, literal } from '../../../common/gateway/decoder';
import { JsonObject, JsonValue } from '../../../common/gateway/json';
import { Operation } from '../../../common/models/project-rights';
import { BIBLICAL_TERM_COLLECTION } from '../../models/biblical-term';
import { NOTE_THREAD_COLLECTION } from '../../models/note-thread';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { TEXT_AUDIO_COLLECTION } from '../../models/text-audio';
import { TRAINING_DATA_COLLECTION } from '../../models/training-data';
import { hasRightsInAll, loadProject } from '../policies/policy-helpers';
import { BiblicalTermsPolicy, TrainingDataPolicy } from '../policies/project-data-policies';
import { ProjectAccess } from '../project-access';
import { ALLOWED, denied, PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';
import {
  accept,
  anyValue,
  authorizeSafely,
  bookNumValue,
  chapterNumValue,
  fieldsOf,
  mayReadEveryDocInProject,
  NO_DOC_ID,
  projectIdValue,
  SFQueryServices,
  singleField
} from './query-support';

/**
 * The subscribed (`qs`) queries for a project's note threads (N1, N2), Biblical Terms (B1), chapter audio (A1) and
 * training data (T1, T2). Each is allowed to project members with the view right that reading the collection's docs
 * needs. Training data is also allowed to Serval administrators, who read every project's training data.
 */

const BIBLICAL_TERMS_POLICY: BiblicalTermsPolicy = new BiblicalTermsPolicy();
const TRAINING_DATA_POLICY: TrainingDataPolicy = new TrainingDataPolicy();

/** The arguments of a query for all of a project's docs of a collection. */
interface ProjectArgs {
  readonly projectRef: string;
}

/** The arguments of N1, the editor's open note threads of a chapter. */
interface ChapterNoteThreadsArgs {
  readonly projectRef: string;
  readonly bookNum: number;
  readonly chapterNum: number;
}

/** The arguments of B1, the Biblical Terms with a reference in a book. */
interface BookBiblicalTermsArgs {
  readonly projectRef: string;
  readonly bookNum: number;
}

export function projectDataQueries(services: SFQueryServices): RegisteredQuery[] {
  return [
    registerQuery(chapterNoteThreadsQuery(services)),
    registerQuery(biblicalTermNoteThreadsQuery(services)),
    registerQuery(bookBiblicalTermsQuery(services)),
    registerQuery(chapterAudioQuery(services)),
    registerQuery(trainingDataQuery(services, false)),
    registerQuery(trainingDataQuery(services, true))
  ];
}

// Note threads

/**
 * Which of a project's note threads a user may read. Threads published to Scripture Forge need the Scripture Forge
 * note thread view right, the others the Paratext one (NoteThreadsPolicy); both need the notes view right.
 */
type ReadableNoteThreads = 'all' | 'published' | 'unpublished';

function readableNoteThreads(project: ProjectAccess | null, userId: string): ReadableNoteThreads | undefined {
  if (project == null || !project.hasRight(userId, SFProjectDomain.Notes, Operation.View, null)) {
    return undefined;
  }
  const paratext: boolean = project.hasRight(userId, SFProjectDomain.PTNoteThreads, Operation.View, null);
  const scriptureForge: boolean = project.hasRight(userId, SFProjectDomain.SFNoteThreads, Operation.View, null);
  if (paratext && scriptureForge) {
    return 'all';
  }
  if (scriptureForge) {
    return 'published';
  }
  if (paratext) {
    return 'unpublished';
  }
  return undefined;
}

function authorizeNoteThreads(
  services: SFQueryServices,
  projectRef: string,
  session: GatewaySession
): Promise<QueryAuthorization> {
  return authorizeSafely(services, session, async (context: SFAccessContext): Promise<PolicyDecision> => {
    const project: ProjectAccess | null = await context.projects.get(projectRef);
    if (project == null) {
      return denied('the project does not exist');
    }
    return readableNoteThreads(project, session.userId) == null
      ? denied('the user may not view note threads')
      : ALLOWED;
  });
}

/**
 * Adds the condition that limits a note threads query to the threads the user may read, so that its results, count
 * and `$skip` reveal nothing about the others. For a user who may read only published threads (commenters and
 * Scripture Forge observers) this is `publishedToSF: true`, the same filter the server's own query middleware adds.
 * Should the user's rights be gone since the query was authorized, or not be readable, the query matches nothing.
 */
async function withReadableNoteThreadFilter(
  services: SFQueryServices,
  query: { [key: string]: JsonValue },
  projectRef: string,
  session: GatewaySession
): Promise<JsonObject> {
  let readable: ReadableNoteThreads | undefined;
  try {
    readable = readableNoteThreads(await services.projects.get(projectRef), session.userId);
  } catch {
    readable = undefined;
  }
  switch (readable) {
    case 'all':
      break;
    case 'published':
      query.publishedToSF = true;
      break;
    case 'unpublished':
      query.publishedToSF = { $ne: true };
      break;
    case undefined:
      query._id = NO_DOC_ID;
      break;
  }
  return query;
}

/** N1: `{ projectRef, status: 'todo', 'verseRef.bookNum', 'verseRef.chapterNum' }`, from the translate editor. */
function chapterNoteThreadsQuery(services: SFQueryServices): QueryRegistryEntry<ChapterNoteThreadsArgs> {
  return {
    name: 'open-note-threads-of-chapter',
    collection: NOTE_THREAD_COLLECTION,
    actions: ['query-subscribe'],
    // The built query has the filter of the threads the user may read.
    extraIsSafe: true,
    match: (query: JsonObject): ChapterNoteThreadsArgs | undefined => {
      const fields: Fields<'projectRef' | 'status' | 'verseRef.bookNum' | 'verseRef.chapterNum', never> | undefined =
        fieldsOf(query, ['projectRef', 'status', 'verseRef.bookNum', 'verseRef.chapterNum']);
      const projectRef: string | undefined = accept(projectIdValue, fields?.required('projectRef'));
      const bookNum: number | undefined = accept(bookNumValue, fields?.required('verseRef.bookNum'));
      const chapterNum: number | undefined = accept(chapterNumValue, fields?.required('verseRef.chapterNum'));
      if (
        projectRef == null ||
        bookNum == null ||
        chapterNum == null ||
        accept(literal('todo'), fields?.required('status')) == null
      ) {
        return undefined;
      }
      return { projectRef: projectRef, bookNum: bookNum, chapterNum: chapterNum };
    },
    authorize: (args: ChapterNoteThreadsArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      authorizeNoteThreads(services, args.projectRef, session),
    build: (args: ChapterNoteThreadsArgs, session: GatewaySession): Promise<JsonObject> =>
      withReadableNoteThreadFilter(
        services,
        {
          projectRef: args.projectRef,
          status: 'todo',
          'verseRef.bookNum': args.bookNum,
          'verseRef.chapterNum': args.chapterNum
        },
        args.projectRef,
        session
      )
  };
}

/** N2: `{ projectRef, biblicalTermId: { $ne: null } }`, the note threads of the Biblical Terms panel. */
function biblicalTermNoteThreadsQuery(services: SFQueryServices): QueryRegistryEntry<ProjectArgs> {
  return {
    name: 'biblical-term-note-threads',
    collection: NOTE_THREAD_COLLECTION,
    actions: ['query-subscribe'],
    // The built query has the filter of the threads the user may read.
    extraIsSafe: true,
    match: (query: JsonObject): ProjectArgs | undefined => {
      const fields: Fields<'projectRef' | 'biblicalTermId', never> | undefined = fieldsOf(query, [
        'projectRef',
        'biblicalTermId'
      ]);
      const projectRef: string | undefined = accept(projectIdValue, fields?.required('projectRef'));
      const notNull: null | undefined = singleField(fields?.required('biblicalTermId'), '$ne', literal(null));
      return projectRef == null || notNull !== null ? undefined : { projectRef: projectRef };
    },
    authorize: (args: ProjectArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      authorizeNoteThreads(services, args.projectRef, session),
    build: (args: ProjectArgs, session: GatewaySession): Promise<JsonObject> =>
      withReadableNoteThreadFilter(
        services,
        { projectRef: args.projectRef, biblicalTermId: { $ne: null } },
        args.projectRef,
        session
      )
  };
}

// Biblical Terms

/** BBBCCCVVV references count verses of a book from book number × this. */
const REFERENCES_PER_BOOK = 1_000_000;

/** The largest book number of a BBBCCCVVV reference. */
const MAX_REFERENCE_BOOK = 999;

/**
 * B1: `{ projectRef, references: { $elemMatch: { $gte: start, $lt: end } } }`, the terms with a reference in a book:
 * `start` is the book's first BBBCCCVVV reference (book number × 1,000,000) and `end` the next book's.
 */
function bookBiblicalTermsQuery(services: SFQueryServices): QueryRegistryEntry<BookBiblicalTermsArgs> {
  return {
    name: 'biblical-terms-of-book',
    collection: BIBLICAL_TERM_COLLECTION,
    actions: ['query-subscribe'],
    // Reading a term needs only the view right that authorizing the query needs, whatever the term.
    extraIsSafe: true,
    match: (query: JsonObject): BookBiblicalTermsArgs | undefined => {
      const fields: Fields<'projectRef' | 'references', never> | undefined = fieldsOf(query, [
        'projectRef',
        'references'
      ]);
      const projectRef: string | undefined = accept(projectIdValue, fields?.required('projectRef'));
      const range: Fields<'$gte' | '$lt', never> | undefined = fieldsOf(
        singleField(fields?.required('references'), '$elemMatch', anyValue),
        ['$gte', '$lt']
      );
      const start: number | undefined = accept(
        integerValue({ min: REFERENCES_PER_BOOK, max: MAX_REFERENCE_BOOK * REFERENCES_PER_BOOK }),
        range?.required('$gte')
      );
      if (projectRef == null || start == null || start % REFERENCES_PER_BOOK !== 0) {
        return undefined;
      }
      if (range?.required('$lt') !== start + REFERENCES_PER_BOOK) {
        return undefined;
      }
      return { projectRef: projectRef, bookNum: start / REFERENCES_PER_BOOK };
    },
    authorize: (args: BookBiblicalTermsArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      authorizeSafely(services, session, (context: SFAccessContext): Promise<PolicyDecision> =>
        mayReadEveryDocInProject(BIBLICAL_TERMS_POLICY, args.projectRef, context)
      ),
    build: async (args: BookBiblicalTermsArgs): Promise<JsonObject> => {
      const start: number = args.bookNum * REFERENCES_PER_BOOK;
      return {
        projectRef: args.projectRef,
        references: { $elemMatch: { $gte: start, $lt: start + REFERENCES_PER_BOOK } }
      };
    }
  };
}

// Chapter audio

/** Matches `{ projectRef }` exactly. */
function matchProjectQuery(query: JsonObject): ProjectArgs | undefined {
  const projectRef: string | undefined = singleField(query, 'projectRef', projectIdValue);
  return projectRef == null ? undefined : { projectRef: projectRef };
}

/** A1: `{ projectRef }`, all of a project's chapter audio. */
function chapterAudioQuery(services: SFQueryServices): QueryRegistryEntry<ProjectArgs> {
  return {
    name: 'text-audio-of-project',
    collection: TEXT_AUDIO_COLLECTION,
    actions: ['query-subscribe'],
    // Reading chapter audio needs only the view right that authorizing the query needs (TextAudioPolicy).
    extraIsSafe: true,
    match: matchProjectQuery,
    authorize: (args: ProjectArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      authorizeSafely(services, session, async (context: SFAccessContext): Promise<PolicyDecision> =>
        hasRightsInAll(
          await loadProject(args.projectRef, context),
          session.userId,
          [SFProjectDomain.TextAudio],
          Operation.View,
          null
        )
      ),
    build: async (args: ProjectArgs): Promise<JsonObject> => ({ projectRef: args.projectRef })
  };
}

// Training data

/**
 * T1: `{ projectRef, deleted: false }`, a project's training data files, and T2: `{ projectRef }`, the same including
 * deleted ones (draft history entries, and every caller before 2026-04-30).
 */
function trainingDataQuery(services: SFQueryServices, includeDeleted: boolean): QueryRegistryEntry<ProjectArgs> {
  return {
    name: includeDeleted ? 'training-data-of-project-with-deleted' : 'training-data-of-project',
    collection: TRAINING_DATA_COLLECTION,
    actions: ['query-subscribe'],
    // With the view right (or as a Serval administrator) a user may read every training data doc of the project.
    extraIsSafe: true,
    match: (query: JsonObject): ProjectArgs | undefined => {
      if (includeDeleted) {
        return matchProjectQuery(query);
      }
      const fields: Fields<'projectRef' | 'deleted', never> | undefined = fieldsOf(query, ['projectRef', 'deleted']);
      const projectRef: string | undefined = accept(projectIdValue, fields?.required('projectRef'));
      return projectRef == null || fields?.required('deleted') !== false ? undefined : { projectRef: projectRef };
    },
    // TrainingDataPolicy also allows Serval administrators, whether or not the project exists, as the server does.
    authorize: (args: ProjectArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      authorizeSafely(services, session, (context: SFAccessContext): Promise<PolicyDecision> =>
        mayReadEveryDocInProject(TRAINING_DATA_POLICY, args.projectRef, context)
      ),
    build: async (args: ProjectArgs): Promise<JsonObject> => {
      const query: { [key: string]: JsonValue } = { projectRef: args.projectRef };
      if (!includeDeleted) {
        query.deleted = false;
      }
      return query;
    }
  };
}
