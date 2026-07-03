import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPOS_DIR } from '../config.js';
import * as hg from '../hg.js';
import {
  createProjectDir,
  projectInfo,
  PT_ROLE_TO_USER_ROLE,
  setProjectUsers,
  USER_ROLE_TO_PT_ROLE,
  writeBook,
  type PtdaProjectUser
} from '../ptda-tool.js';
import { state } from '../state.js';
import { BOOK_TEMPLATES } from '../templates.js';
import type { MockProject, MockProjectMember, MockUser } from '../types.js';
import { createUser } from './ops-users.js';

export interface CreateProjectSpec {
  shortName: string;
  fullName?: string;
  ptId?: string;
  languageLdml?: string;
  languageIso?: string;
  languageName?: string;
  projectType?: string;
  baseProjectPtId?: string;
  members?: MockProjectMember[];
  /** USFM book codes with canned templates (e.g. ["RUT", "JON"]) … */
  templateBooks?: string[];
  /** … and/or inline books. */
  books?: { bookCode: string; usfm: string }[];
  registered?: boolean;
}

export function repoDir(ptId: string): string {
  return path.join(REPOS_DIR, ptId);
}

/**
 * Builds the ProjectUserAccess user list for the given members. Project files must be written by
 * an Administrator (ParatextData enforces this), so when no member is a pt_administrator a
 * synthetic "Mock Administrator" entry is added to the project file only (not to the registry
 * member list).
 */
function projectUsers(members: MockProjectMember[]): PtdaProjectUser[] {
  const users: PtdaProjectUser[] = members.map(member => {
    const user: MockUser | undefined = state.findUserByPtUserId(member.ptUserId);
    return {
      name: user?.paratext?.ptUsername ?? member.ptUserId,
      role: PT_ROLE_TO_USER_ROLE[member.role] ?? 'Observer'
    };
  });
  if (!users.some(user => user.role === 'Administrator')) {
    users.unshift({ name: 'Mock Administrator', role: 'Administrator' });
  }
  return users;
}

export async function createProject(spec: CreateProjectSpec): Promise<MockProject> {
  const ptId = spec.ptId ?? crypto.randomBytes(20).toString('hex');
  if (state.projects.has(ptId)) throw new Error(`project ${ptId} already exists`);
  const project: MockProject = {
    ptId,
    shortName: spec.shortName,
    fullName: spec.fullName ?? spec.shortName,
    languageLdml: spec.languageLdml ?? 'en',
    languageIso: spec.languageIso ?? 'en',
    languageName: spec.languageName ?? 'English',
    projectType: spec.projectType ?? 'Standard',
    baseProjectPtId: spec.baseProjectPtId,
    members: spec.members ?? [],
    registered: spec.registered ?? true,
    licenseExpired: false
  };

  const books = [
    ...(spec.templateBooks ?? []).map(code => {
      const template = BOOK_TEMPLATES[code];
      if (!template) throw new Error(`no template for book ${code}`);
      return { bookCode: code, usfm: template.usfm };
    }),
    ...(spec.books ?? [])
  ];
  // ParatextData (via ParatextProjectTool) writes Settings.xml, ProjectUserAccess.xml and the
  // book files, so their content and naming match a real Paratext project exactly.
  await createProjectDir({
    ptId,
    shortName: project.shortName,
    fullName: project.fullName,
    languageTag: project.languageLdml,
    languageName: project.languageName,
    users: projectUsers(project.members),
    books
  });
  await hg.init(repoDir(ptId));
  await hg.commitAll(repoDir(ptId), 'Initial project creation (mock)', 'mock-services');

  state.projects.set(ptId, project);
  state.save();
  return project;
}

export interface ImportProjectSpec {
  /** Absolute path of an existing Paratext project directory on this machine. */
  dir: string;
  registered?: boolean;
}

/**
 * Imports an existing local Paratext project directory (e.g. a real test project) as a mock
 * project: copies it into the repos dir under its own Guid, registers it in the mock registry
 * state, and creates linked mock users for its members so any of them can log in immediately.
 */
export async function importProject(
  spec: ImportProjectSpec
): Promise<{ project: MockProject; createdUsers: MockUser[] }> {
  if (!spec.dir) throw new Error('dir is required');
  if (!fs.existsSync(path.join(spec.dir, 'Settings.xml'))) {
    throw new Error(`${spec.dir} is not a Paratext project directory (no Settings.xml)`);
  }
  const guidMatch = fs.readFileSync(path.join(spec.dir, 'Settings.xml'), 'utf8').match(/<Guid>([0-9a-f]{40})<\/Guid>/);
  if (!guidMatch) throw new Error(`${spec.dir}/Settings.xml has no 40-hex <Guid>`);
  const ptId = guidMatch[1];
  if (state.projects.has(ptId)) throw new Error(`project ${ptId} already exists`);

  // Copy the project in (excluding any .hg dir — the mock repo gets a fresh history).
  fs.cpSync(spec.dir, repoDir(ptId), {
    recursive: true,
    filter: source => path.basename(source) !== '.hg'
  });

  const info = await projectInfo(ptId);
  const createdUsers: MockUser[] = [];
  const members: MockProjectMember[] = [];
  for (const projectUser of info.users) {
    const role = USER_ROLE_TO_PT_ROLE[projectUser.role];
    if (role === undefined) continue; // e.g. role None — present in the file but not a member
    let user = state.findUserByPtUsername(projectUser.name);
    if (user === undefined) {
      const slug = projectUser.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      user = createUser({
        email: `${slug}@mock.local`,
        name: projectUser.name,
        authId: `oauth2|paratext|${slug}`,
        paratext: { ptUserId: `pt-user-${slug}`, ptUsername: projectUser.name }
      });
      createdUsers.push(user);
    }
    members.push({ ptUserId: user.paratext?.ptUserId ?? `pt-user-${projectUser.name}`, role });
  }

  const project: MockProject = {
    ptId,
    shortName: info.shortName,
    fullName: info.fullName,
    languageLdml: info.languageTag ?? 'en',
    languageIso: (info.languageTag ?? 'en').split('-')[0],
    languageName: info.languageName,
    projectType: 'Standard',
    members,
    registered: spec.registered ?? true,
    licenseExpired: false
  };

  await hg.init(repoDir(ptId));
  await hg.commitAll(repoDir(ptId), `Imported from ${spec.dir} (mock)`, 'mock-services');

  state.projects.set(ptId, project);
  state.save();
  return { project, createdUsers };
}

/** Simulates an edit made in Paratext: write files into the server-side repo and commit. */
export async function commitToProject(
  ptId: string,
  change: {
    bookCode?: string;
    usfm?: string;
    files?: { path: string; content: string }[];
    message?: string;
    user?: string;
  }
): Promise<{ tipId: string }> {
  const project = state.projects.get(ptId);
  if (!project) throw new Error(`unknown project ${ptId}`);
  const dir = repoDir(ptId);
  if (change.bookCode !== undefined && change.usfm !== undefined) {
    // Book writes go through ParatextData so file naming and BooksPresent stay correct.
    await writeBook(ptId, change.bookCode, change.usfm);
  }
  for (const file of change.files ?? []) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  await hg.commitAll(dir, change.message ?? 'Edit made in Paratext (mock)', change.user ?? 'mock-paratext-user');
  return { tipId: await hg.tipId(dir) };
}

export async function setMembers(ptId: string, members: MockProjectMember[]): Promise<MockProject> {
  const project = state.projects.get(ptId);
  if (!project) throw new Error(`unknown project ${ptId}`);
  project.members = members;
  // Keep the repo's ProjectUserAccess.xml in sync with the registry-side member list.
  await setProjectUsers(ptId, projectUsers(members));
  await hg.commitAll(repoDir(ptId), 'Project members changed (mock)', 'mock-services');
  state.save();
  return project;
}
