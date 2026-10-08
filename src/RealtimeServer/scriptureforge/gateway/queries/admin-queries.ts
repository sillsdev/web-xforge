import {
  GatewaySession,
  QueryAuthorization,
  QueryRegistryEntry,
  registerQuery,
  RegisteredQuery
} from '../../../common/gateway/authorization';
import { arrayOf, Fields, literal, stringValue } from '../../../common/gateway/decoder';
import { JsonObject, JsonValue } from '../../../common/gateway/json';
import { USERS_COLLECTION } from '../../../common/models/user';
import { SF_PROJECT_PROFILES_COLLECTION, SF_PROJECTS_COLLECTION } from '../../models/sf-project';
import { isServalAdmin, isSystemAdmin } from '../sf-access-context';
import {
  accept,
  anyValue,
  AUTHORIZED,
  fieldsOf,
  pageSizeValue,
  projectIdValue,
  refused,
  searchConditions,
  searchTermOf,
  singleField,
  skipValue,
  unpagedCount,
  unpagedCountValue
} from './query-support';

/**
 * The fetched (`qf`) queries of the administration pages: the system administrator's project list (P1, P1c), the
 * projects of the listed users (P2) and user list (U1, U1c), and the Serval administrator's project list (S1, S1c)
 * and project lookup by Paratext id (S2).
 *
 * Paged lists come in pairs: the page, with `$skip` and `$limit`, and the unpaged count, with neither but with
 * `$count: { applySkipLimit: false }`. A search adds `$or` with one case-insensitive regular expression per searched
 * field, made of the search text escaped with lodash's escapeRegExp. Only such escaped text is accepted, so the
 * expressions the database runs match literal text.
 *
 * Each list is allowed only to the administrators who may read every doc of its collection (system administrators
 * read every project and user; Serval administrators every project profile), so its count reveals nothing more.
 *
 * Not registered: `sf_projects { paratextId }` (H1), how the Serval administration page looked projects up before
 * 2026-02-05, now `sf_projects_profile` (S2). The server refuses it to Serval administrators who are not also system
 * administrators, so supporting it would allow more than the server does, for clients too old to still be in use.
 */

/** The fields the system administrator searches projects by. */
const PROJECT_SEARCH_FIELDS: readonly string[] = ['name', 'shortName'];
/** The fields the system administrator searches users by. */
const USER_SEARCH_FIELDS: readonly string[] = ['name', 'email', 'displayName'];

/** The user search wraps the escaped search text in this, so that it matches anywhere in the field. */
const USER_SEARCH_WILDCARD = '.*';

/** The most project ids P2 may name: a page of 100 users, each a member of many projects. */
const MAX_PROJECT_IDS = 10_000;

/** The longest Paratext id accepted. Real ones are 40 (projects) or 16 (resources) hex characters. */
const MAX_PARATEXT_ID_LENGTH = 128;

/** The field the Serval administrator's "custom Serval config" toggle filters on. */
const SERVAL_CONFIG_FIELD = 'translateConfig.draftConfig.servalConfig';

/** A page of a list: how many results to skip and how many to give. */
interface Page {
  readonly skip: number;
  readonly limit: number;
}

/** The arguments of a list query, paged or counted. */
interface ListArgs {
  /** The escaped search text, or undefined when the list is not searched. */
  readonly searchTerm: string | undefined;
  /** The page, or undefined for the count of the whole list. */
  readonly page: Page | undefined;
}

/** The arguments of a Serval administrator's project list, paged or counted. */
interface ServalProjectListArgs extends ListArgs {
  /** Whether only projects with a custom Serval config are listed. */
  readonly customServalConfigOnly: boolean;
}

/** The arguments of P2, projects by id. */
interface ProjectIdsArgs {
  readonly projectIds: readonly string[];
}

/** The arguments of S2, a project profile by Paratext id. */
interface ParatextIdArgs {
  readonly paratextId: string;
}

export function adminQueries(): RegisteredQuery[] {
  return [
    registerQuery(systemAdminList('projects-list', SF_PROJECTS_COLLECTION, PROJECT_SEARCH_FIELDS, '', false)),
    registerQuery(systemAdminList('projects-list-count', SF_PROJECTS_COLLECTION, PROJECT_SEARCH_FIELDS, '', true)),
    registerQuery(projectsByIdQuery()),
    registerQuery(systemAdminList('users-list', USERS_COLLECTION, USER_SEARCH_FIELDS, USER_SEARCH_WILDCARD, false)),
    registerQuery(
      systemAdminList('users-list-count', USERS_COLLECTION, USER_SEARCH_FIELDS, USER_SEARCH_WILDCARD, true)
    ),
    registerQuery(servalProjectList(false)),
    registerQuery(servalProjectList(true)),
    registerQuery(projectProfileByParatextIdQuery())
  ];
}

async function authorizeSystemAdmin(_args: unknown, session: GatewaySession): Promise<QueryAuthorization> {
  return isSystemAdmin(session) ? AUTHORIZED : refused('only system administrators may run this query');
}

async function authorizeServalAdmin(_args: unknown, session: GatewaySession): Promise<QueryAuthorization> {
  return isServalAdmin(session) ? AUTHORIZED : refused('only Serval administrators may run this query');
}

/**
 * Reads the parts every list query has: the optional search, `$sort: { name: 1 }`, and either the page (`$skip`,
 * `$limit`) or the unpaged count. `fields` must hold exactly these keys besides the ones the caller reads itself.
 */
function matchList(
  fields: Fields<string, string>,
  searchFields: readonly string[],
  wildcard: string,
  isCount: boolean
): ListArgs | undefined {
  let searchTerm: string | undefined;
  if (fields.has('$or')) {
    searchTerm = searchTermOf(fields.optional('$or'), searchFields, wildcard, wildcard);
    if (searchTerm == null) {
      return undefined;
    }
  }
  if (singleField(fields.required('$sort'), 'name', literal(1)) == null) {
    return undefined;
  }
  if (isCount) {
    return accept(unpagedCountValue, fields.required('$count')) == null
      ? undefined
      : { searchTerm: searchTerm, page: undefined };
  }
  const skip: number | undefined = accept(skipValue, fields.required('$skip'));
  const limit: number | undefined = accept(pageSizeValue, fields.required('$limit'));
  if (skip == null || limit == null) {
    return undefined;
  }
  return { searchTerm: searchTerm, page: { skip: skip, limit: limit } };
}

/** The keys a list query has besides its own filters. */
function listKeys(isCount: boolean): string[] {
  return isCount ? ['$sort', '$count'] : ['$sort', '$skip', '$limit'];
}

/** Builds the parts every list query has (see matchList) into `query`. */
function buildList(
  query: { [key: string]: JsonValue },
  args: ListArgs,
  searchFields: readonly string[],
  wildcard: string
): JsonObject {
  if (args.searchTerm != null) {
    query.$or = searchConditions(searchFields, `${wildcard}${args.searchTerm}${wildcard}`);
  }
  query.$sort = { name: 1 };
  if (args.page == null) {
    query.$count = unpagedCount();
  } else {
    query.$skip = args.page.skip;
    query.$limit = args.page.limit;
  }
  return query;
}

/**
 * P1/P1c: `{ [$or], $sort: { name: 1 }, $skip, $limit }` and its count, the system administrator's project list
 * (`sf_projects`). U1/U1c: the same for the user list (`users`), whose search text is wrapped in `.*`.
 */
function systemAdminList(
  name: string,
  collection: string,
  searchFields: readonly string[],
  wildcard: string,
  isCount: boolean
): QueryRegistryEntry<ListArgs> {
  return {
    name: name,
    collection: collection,
    actions: ['query-fetch'],
    // System administrators read every project and user.
    extraIsSafe: true,
    match: (query: JsonObject): ListArgs | undefined => {
      const fields: Fields<string, string> | undefined = fieldsOf(query, listKeys(isCount), ['$or']);
      return fields == null ? undefined : matchList(fields, searchFields, wildcard, isCount);
    },
    authorize: authorizeSystemAdmin,
    build: async (args: ListArgs): Promise<JsonObject> => buildList({}, args, searchFields, wildcard)
  };
}

/** P2: `{ _id: { $in: projectIds } }`, the projects of the users the system administrator's user list shows. */
function projectsByIdQuery(): QueryRegistryEntry<ProjectIdsArgs> {
  return {
    name: 'projects-by-id',
    collection: SF_PROJECTS_COLLECTION,
    actions: ['query-fetch'],
    // System administrators read every project.
    extraIsSafe: true,
    match: (query: JsonObject): ProjectIdsArgs | undefined => {
      const projectIds: readonly string[] | undefined = singleField(
        singleField(query, '_id', anyValue),
        '$in',
        arrayOf(projectIdValue, { minLength: 1, maxLength: MAX_PROJECT_IDS })
      );
      return projectIds == null ? undefined : { projectIds: projectIds };
    },
    authorize: authorizeSystemAdmin,
    build: async (args: ProjectIdsArgs): Promise<JsonObject> => ({ _id: { $in: Array.from(args.projectIds) } })
  };
}

/**
 * S1/S1c: `{ [$or], resourceConfig: null, $sort: { name: 1 }, $skip, $limit,
 * ['translateConfig.draftConfig.servalConfig': { $ne: null }] }` and its count, the Serval administrator's project
 * list (`sf_projects_profile`), without resources and, with the toggle on, only projects with a custom Serval config.
 */
function servalProjectList(isCount: boolean): QueryRegistryEntry<ServalProjectListArgs> {
  return {
    name: isCount ? 'serval-projects-list-count' : 'serval-projects-list',
    collection: SF_PROJECT_PROFILES_COLLECTION,
    actions: ['query-fetch'],
    // Serval administrators read every project profile.
    extraIsSafe: true,
    match: (query: JsonObject): ServalProjectListArgs | undefined => {
      const fields: Fields<string, string> | undefined = fieldsOf(
        query,
        [...listKeys(isCount), 'resourceConfig'],
        ['$or', SERVAL_CONFIG_FIELD]
      );
      if (fields == null || fields.required('resourceConfig') !== null) {
        return undefined;
      }
      const customServalConfigOnly: boolean = fields.has(SERVAL_CONFIG_FIELD);
      if (customServalConfigOnly && singleField(fields.optional(SERVAL_CONFIG_FIELD), '$ne', literal(null)) !== null) {
        return undefined;
      }
      const list: ListArgs | undefined = matchList(fields, PROJECT_SEARCH_FIELDS, '', isCount);
      return list == null
        ? undefined
        : { searchTerm: list.searchTerm, page: list.page, customServalConfigOnly: customServalConfigOnly };
    },
    authorize: authorizeServalAdmin,
    build: async (args: ServalProjectListArgs): Promise<JsonObject> => {
      const query: { [key: string]: JsonValue } = { resourceConfig: null };
      if (args.customServalConfigOnly) {
        query[SERVAL_CONFIG_FIELD] = { $ne: null };
      }
      return buildList(query, args, PROJECT_SEARCH_FIELDS, '');
    }
  };
}

/** S2: `{ paratextId }`, a project profile by its Paratext id, for the onboarding request page. */
function projectProfileByParatextIdQuery(): QueryRegistryEntry<ParatextIdArgs> {
  return {
    name: 'project-profile-by-paratext-id',
    collection: SF_PROJECT_PROFILES_COLLECTION,
    actions: ['query-fetch'],
    // Serval administrators read every project profile.
    extraIsSafe: true,
    match: (query: JsonObject): ParatextIdArgs | undefined => {
      // The id comes from a form a user filled in and the client does not check it, so any short string is taken.
      const paratextId: string | undefined = singleField(
        query,
        'paratextId',
        stringValue({ minLength: 1, maxLength: MAX_PARATEXT_ID_LENGTH })
      );
      return paratextId == null ? undefined : { paratextId: paratextId };
    },
    authorize: authorizeServalAdmin,
    build: async (args: ParatextIdArgs): Promise<JsonObject> => ({ paratextId: args.paratextId })
  };
}
