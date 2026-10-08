import { GatewaySession } from '../../common/gateway/authorization';
import { GatewayDataSource } from '../../common/gateway/gateway-data-source';
import { SystemRole } from '../../common/models/system-role';
import { ProjectAccessSource } from './project-access';
import { UserProfileCache } from './user-profile-cache';

/**
 * What Scripture Forge's gateway policies decide with: who is asking (from the verified access token), and where to
 * read projects and docs from. The caches are shared by every connection; the session is the connection's own.
 */
export interface SFAccessContext {
  readonly session: GatewaySession;
  readonly projects: ProjectAccessSource;
  readonly profiles: UserProfileCache;
  readonly data: GatewayDataSource;
}

/** Whether the session's token gives the system administrator role. */
export function isSystemAdmin(session: GatewaySession): boolean {
  return session.systemRoles.includes(SystemRole.SystemAdmin);
}

/** Whether the session's token gives the Serval administrator role. */
export function isServalAdmin(session: GatewaySession): boolean {
  return session.systemRoles.includes(SystemRole.ServalAdmin);
}
