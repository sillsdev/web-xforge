import { ListQueryRegistry, QueryRegistry } from '../../common/gateway/authorization';
import { GatewayDataSource } from '../../common/gateway/gateway-data-source';
import { ProjectAccessCache } from './project-access';
import { adminQueries } from './queries/admin-queries';
import { existenceQueries } from './queries/existence-queries';
import { projectDataQueries } from './queries/project-data-queries';
import { questionQueries } from './queries/question-queries';
import { UserProfileCache } from './user-profile-cache';

/**
 * The query registry of Scripture Forge's gateway: one entry for each query shape the Scripture Forge client sends
 * (see the files in ./queries). A query of any other shape is not supported. Each entry's authorization and built query
 * are decided with the access context of the session that sends the query, made from these process-wide services.
 *
 * Not registered: `biblical_terms { projectRef }` (all of a project's terms), which the Biblical Terms panel sent
 * before 2026-01-03, when it started to query one book at a time (B1). Clients that old are not expected to still be
 * in use. The other shape not registered, H1, is described in admin-queries.ts.
 */
export function createSFQueryRegistry(services: {
  projects: ProjectAccessCache;
  profiles: UserProfileCache;
  data: GatewayDataSource;
}): QueryRegistry {
  return new ListQueryRegistry([
    ...existenceQueries(services),
    ...questionQueries(services),
    ...projectDataQueries(services),
    ...adminQueries()
  ]);
}
