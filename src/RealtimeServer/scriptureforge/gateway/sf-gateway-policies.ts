import ShareDB from 'sharedb';
import {
  ConnectionAuthorizers,
  GatewayPolicies,
  GatewaySession,
  QueryRegistry,
  WriteHook
} from '../../common/gateway/authorization';
import { DataSourceBackend, ShareDbDataSource } from '../../common/gateway/gateway-data-source';
import { PresenceIdBindings } from './presence-bindings';
import { observeProjectAccessChanges, ProjectAccessCache } from './project-access';
import { ReadGrants } from './read-grants';
import { SFEgressAuthorizer } from './sf-egress-authorizer';
import { SFGatewayServices, SFInboundAuthorizer } from './sf-inbound-authorizer';
import { createSFQueryRegistry } from './sf-query-registry';
import { SFWriteHook } from './sf-write-hook';
import { observeUserProfileChanges, UserProfileCache } from './user-profile-cache';

/**
 * Scripture Forge's gateway policies: the collection policies (SF_COLLECTION_POLICIES) applied to inbound requests,
 * queries, writes and everything ShareDB sends to clients.
 */
export class SFGatewayPolicies implements GatewayPolicies {
  readonly queryRegistry: QueryRegistry;
  readonly writeHook: WriteHook;

  constructor(private readonly services: SFGatewayServices) {
    this.queryRegistry = createSFQueryRegistry(services);
    this.writeHook = new SFWriteHook(services);
  }

  createConnectionAuthorizers(session: GatewaySession): ConnectionAuthorizers {
    // The inbound authorizer records the read decisions it makes for requests with a version, whose replies carry no
    // snapshot for the egress authorizer to decide on, so that the ops that follow are decided as of those decisions.
    const grants = new ReadGrants(this.services.projects);
    return {
      inbound: new SFInboundAuthorizer(session, this.services, grants),
      egress: new SFEgressAuthorizer(session, this.services, grants)
    };
  }
}

/**
 * Makes the policies for a backend, with process-wide caches that the backend's own middleware keeps current: a
 * project's cached access is dropped when an op changes its membership or permissions, and a user's cached profile
 * when their user doc changes. Call once per backend.
 */
export function createSFGatewayPolicies(backend: ShareDB & DataSourceBackend): SFGatewayPolicies {
  const data: ShareDbDataSource = new ShareDbDataSource(backend);
  const projects: ProjectAccessCache = new ProjectAccessCache(data);
  const profiles: UserProfileCache = new UserProfileCache(data);
  observeProjectAccessChanges(backend, projects);
  observeUserProfileChanges(backend, profiles);
  return new SFGatewayPolicies({
    projects: projects,
    profiles: profiles,
    data: data,
    presenceIds: new PresenceIdBindings()
  });
}
