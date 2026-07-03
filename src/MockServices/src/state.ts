import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, REPOS_DIR, RESOURCES_DIR } from './config.js';
import type {
  AuthCodeRecord,
  ChaosRule,
  MockProject,
  MockResource,
  MockUser,
  RefreshTokenRecord
} from './types.js';

const snapshotPath = path.join(DATA_DIR, 'state.json');

export class MockState {
  /** Keyed by authId. */
  users = new Map<string, MockUser>();
  /** Keyed by ptId. */
  projects = new Map<string, MockProject>();
  /** Keyed by DBL id. */
  resources = new Map<string, MockResource>();
  /** Keyed by token string. */
  refreshTokens = new Map<string, RefreshTokenRecord>();
  /** Keyed by code string. */
  authCodes = new Map<string, AuthCodeRecord>();
  chaosRules: ChaosRule[] = [];
  /** One-shot: authId that the next /authorize call logs in when no login_hint is given. */
  nextLoginAuthId?: string;
  seedName?: string;

  findUserByEmail(email: string): MockUser | undefined {
    return [...this.users.values()].find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserByPtUserId(ptUserId: string): MockUser | undefined {
    return [...this.users.values()].find(u => u.paratext?.ptUserId === ptUserId);
  }

  findUserByPtUsername(ptUsername: string): MockUser | undefined {
    return [...this.users.values()].find(u => u.paratext?.ptUsername === ptUsername);
  }

  /** Wipes all in-memory state and everything on disk (repos, resources, snapshot). */
  clear(): void {
    this.users.clear();
    this.projects.clear();
    this.resources.clear();
    this.refreshTokens.clear();
    this.authCodes.clear();
    this.chaosRules = [];
    this.nextLoginAuthId = undefined;
    this.seedName = undefined;
    for (const dir of [REPOS_DIR, RESOURCES_DIR]) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.rmSync(snapshotPath, { force: true });
  }

  /** Persists users/projects/resources/tokens (not repos — those live on disk already). */
  save(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = {
      seedName: this.seedName,
      users: [...this.users.values()],
      projects: [...this.projects.values()],
      resources: [...this.resources.values()],
      refreshTokens: [...this.refreshTokens.values()]
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  }

  /** Returns true if a snapshot existed and was loaded. */
  load(): boolean {
    if (!fs.existsSync(snapshotPath)) return false;
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    this.seedName = snapshot.seedName;
    this.users = new Map((snapshot.users as MockUser[]).map(u => [u.authId, u]));
    this.projects = new Map((snapshot.projects as MockProject[]).map(p => [p.ptId, p]));
    this.resources = new Map((snapshot.resources as MockResource[]).map(r => [r.id, r]));
    this.refreshTokens = new Map(
      (snapshot.refreshTokens as RefreshTokenRecord[]).map(t => [t.token, t])
    );
    return true;
  }

  /** Debug/assertion dump for GET /_control/state. */
  dump(): object {
    return {
      seedName: this.seedName,
      users: [...this.users.values()],
      projects: [...this.projects.values()],
      resources: [...this.resources.values()],
      refreshTokens: [...this.refreshTokens.values()].map(t => ({
        ...t,
        token: `${t.token.slice(0, 8)}…`
      })),
      chaosRules: this.chaosRules
    };
  }
}

export const state = new MockState();
