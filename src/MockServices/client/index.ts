/**
 * Typed client for the mock-services control API (spec §6), for E2E tests, agents, and scripts.
 * Transport-only: all behavior lives in the mock server.
 */

export type PtRole =
  | 'pt_administrator'
  | 'pt_consultant'
  | 'pt_translator'
  | 'pt_observer'
  | 'pt_read'
  | 'pt_write_note';

export interface CreateUserRequest {
  email: string;
  name: string;
  authId?: string;
  connection?: 'Username-Password-Authentication' | 'paratext' | 'Transparent-Authentication';
  username?: string;
  password?: string;
  sfRole?: string;
  xfUserId?: string;
  picture?: string;
  paratext?: { ptUsername: string; ptUserId?: string };
}

export interface CreateProjectRequest {
  shortName: string;
  fullName?: string;
  ptId?: string;
  languageLdml?: string;
  languageIso?: string;
  languageName?: string;
  projectType?: string;
  baseProjectPtId?: string;
  members?: { ptUserId: string; role: PtRole }[];
  templateBooks?: string[];
  books?: { bookCode: string; usfm: string }[];
  registered?: boolean;
}

export interface CommitRequest {
  bookCode?: string;
  usfm?: string;
  files?: { path: string; content: string }[];
  message?: string;
  user?: string;
}

export interface CreateResourceRequest {
  name: string;
  fullname?: string;
  id?: string;
  revision?: number;
  languageCode?: string;
  languageLDMLId?: string;
  languageName?: string;
  permittedUsers?: string[];
  templateBooks?: string[];
}

export interface ChaosRequest {
  service: 'auth0' | 'registry' | 'archives' | 'dbl';
  endpoint?: string;
  mode: 'fail500' | 'fail429' | 'hang' | 'slow' | 'authExpired';
  remaining?: number;
}

export class MockServicesClient {
  constructor(private readonly baseUrl: string = 'http://localhost:5100') {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/_control${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(`control API ${method} ${path}: ${json.error ?? response.status}`);
    return json;
  }

  /** Wipes all state and repos, then applies the named seed. */
  reset(seed = 'default'): Promise<{ ok: boolean; seed: string }> {
    return this.call('POST', `/reset?seed=${encodeURIComponent(seed)}`);
  }

  createUser(user: CreateUserRequest): Promise<{ authId: string }> {
    return this.call('POST', '/users', user);
  }

  createProject(project: CreateProjectRequest): Promise<{ ptId: string; shortName: string }> {
    return this.call('POST', '/projects', project);
  }

  /** Simulates an edit made in Paratext: commits into the server-side hg repo. */
  commit(ptId: string, change: CommitRequest): Promise<{ tipId: string }> {
    return this.call('POST', `/projects/${ptId}/commit`, change);
  }

  setMembers(ptId: string, members: { ptUserId: string; role: PtRole }[]): Promise<unknown> {
    return this.call('PATCH', `/projects/${ptId}/members`, { members });
  }

  updateProject(
    ptId: string,
    patch: { registered?: boolean; licenseExpired?: boolean; lockedBy?: string | null }
  ): Promise<unknown> {
    return this.call('PATCH', `/projects/${ptId}`, patch);
  }

  createResource(resource: CreateResourceRequest): Promise<{ id: string }> {
    return this.call('POST', '/resources', resource);
  }

  /** The next /authorize call without a login_hint logs in as this user (one-shot). */
  setNextLogin(authId: string | undefined): Promise<unknown> {
    return this.call('POST', '/next-login', { authId });
  }

  addChaos(rule: ChaosRequest): Promise<unknown> {
    return this.call('POST', '/chaos', rule);
  }

  clearChaos(): Promise<unknown> {
    return this.call('DELETE', '/chaos');
  }

  revokeTokens(filter: { authId?: string; kind?: 'auth0' | 'paratext' } = {}): Promise<{ revoked: number }> {
    return this.call('POST', '/tokens/revoke', filter);
  }

  state(): Promise<Record<string, unknown>> {
    return this.call('GET', '/state');
  }
}
