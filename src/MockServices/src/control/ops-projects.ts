import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPOS_DIR } from '../config.js';
import * as hg from '../hg.js';
import { state } from '../state.js';
import { BOOK_TEMPLATES, bookFileName, settingsXml } from '../templates.js';
import type { MockProject, MockProjectMember } from '../types.js';

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

  const dir = repoDir(ptId);
  await hg.init(dir);
  fs.writeFileSync(path.join(dir, 'Settings.xml'), settingsXml(project));
  const books = [
    ...(spec.templateBooks ?? []).map(code => {
      const template = BOOK_TEMPLATES[code];
      if (!template) throw new Error(`no template for book ${code}`);
      return { bookCode: code, usfm: template.usfm };
    }),
    ...(spec.books ?? [])
  ];
  for (const book of books) {
    fs.writeFileSync(path.join(dir, bookFileName(book.bookCode)), book.usfm);
  }
  await hg.commitAll(dir, 'Initial project creation (mock)', 'mock-services');

  state.projects.set(ptId, project);
  state.save();
  return project;
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
    fs.writeFileSync(path.join(dir, bookFileName(change.bookCode)), change.usfm);
  }
  for (const file of change.files ?? []) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  await hg.commitAll(dir, change.message ?? 'Edit made in Paratext (mock)', change.user ?? 'mock-paratext-user');
  return { tipId: await hg.tipId(dir) };
}

export function setMembers(ptId: string, members: MockProjectMember[]): MockProject {
  const project = state.projects.get(ptId);
  if (!project) throw new Error(`unknown project ${ptId}`);
  project.members = members;
  state.save();
  return project;
}
