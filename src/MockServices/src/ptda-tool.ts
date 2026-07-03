import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { REPOS_DIR } from './config.js';
import type { PtRole } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Wrapper around src/ParatextProjectTool — a dotnet console tool that creates and modifies
 * Paratext project directories through ParatextData itself (same library + version as the SF
 * backend). Using it instead of hand-written Settings.xml/ProjectUserAccess.xml/book files means
 * mock projects are byte-faithful to what Paratext produces, including file naming
 * (08RUT<ShortName>.SFM), BooksPresent bookkeeping and role strings.
 *
 * The tool is a hard dependency of project create/modify operations. It is built on demand (once
 * per process) with `dotnet build`; override the dotnet executable with MOCK_DOTNET_EXE.
 */

const DOTNET_EXE = process.env.MOCK_DOTNET_EXE ?? 'dotnet';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolProjectDir = path.resolve(packageRoot, '..', 'ParatextProjectTool');
const toolDll = path.join(toolProjectDir, 'bin', 'Release', 'net10.0', 'ParatextProjectTool.dll');

/** Paratext project user as the tool reports and accepts it (role = ParatextData UserRoles name). */
export interface PtdaProjectUser {
  name: string;
  role: 'Administrator' | 'TeamMember' | 'Consultant' | 'Observer' | 'None';
}

/** Project metadata as reported by every tool command. */
export interface PtdaProjectInfo {
  id: string;
  shortName: string;
  fullName: string;
  languageTag: string | null;
  languageName: string;
  books: string[];
  users: PtdaProjectUser[];
}

/** Registry-level PT roles → ParatextData UserRoles names (the strings in ProjectUserAccess.xml). */
export const PT_ROLE_TO_USER_ROLE: Record<PtRole, PtdaProjectUser['role']> = {
  pt_administrator: 'Administrator',
  pt_translator: 'TeamMember',
  pt_consultant: 'Consultant',
  pt_observer: 'Observer',
  pt_read: 'Observer',
  pt_write_note: 'Observer'
};

/** ParatextData UserRoles names → registry-level PT roles (for importing existing projects). */
export const USER_ROLE_TO_PT_ROLE: Record<string, PtRole | undefined> = {
  Administrator: 'pt_administrator',
  TeamMember: 'pt_translator',
  Consultant: 'pt_consultant',
  Observer: 'pt_observer'
};

let buildPromise: Promise<void> | undefined;

/** Builds the tool once per process (subsequent dotnet builds are incremental no-ops anyway). */
function ensureToolBuilt(): Promise<void> {
  buildPromise ??= (async () => {
    if (!fs.existsSync(toolProjectDir)) {
      throw new Error(`ParatextProjectTool not found at ${toolProjectDir}`);
    }
    console.log('[mock/ptda] building ParatextProjectTool (dotnet build -c Release)…');
    try {
      await execFileAsync(DOTNET_EXE, ['build', '-c', 'Release', toolProjectDir], {
        maxBuffer: 64 * 1024 * 1024
      });
    } catch (error) {
      buildPromise = undefined;
      throw new Error(
        `failed to build ParatextProjectTool (is the dotnet SDK installed? set MOCK_DOTNET_EXE to override): ${String(
          error instanceof Error ? error.message : error
        )}`
      );
    }
    console.log('[mock/ptda] ParatextProjectTool ready');
  })();
  return buildPromise;
}

async function runTool(args: string[]): Promise<PtdaProjectInfo> {
  await ensureToolBuilt();
  try {
    const { stdout } = await execFileAsync(DOTNET_EXE, [toolDll, ...args], {
      maxBuffer: 64 * 1024 * 1024
    });
    return JSON.parse(stdout) as PtdaProjectInfo;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    throw new Error(`ParatextProjectTool ${args[0]} failed: ${stderr.trim() || String(error)}`);
  }
}

function userArgs(users: PtdaProjectUser[]): string[] {
  return users.flatMap(user => ['--user', `${user.name}=${user.role}`]);
}

/** Writes each book's USFM to a temp file and returns the --book arguments plus a cleanup fn. */
function bookArgs(books: { bookCode: string; usfm: string }[]): { args: string[]; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-mock-usfm-'));
  const args = books.flatMap(book => {
    const file = path.join(tempDir, `${book.bookCode}.usfm`);
    fs.writeFileSync(file, book.usfm);
    return ['--book', `${book.bookCode}=${file}`];
  });
  return { args: args, cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }) };
}

export async function createProjectDir(spec: {
  ptId: string;
  shortName: string;
  fullName: string;
  languageTag: string;
  languageName: string;
  users: PtdaProjectUser[];
  books: { bookCode: string; usfm: string }[];
}): Promise<PtdaProjectInfo> {
  const books = bookArgs(spec.books);
  try {
    return await runTool([
      'create-project',
      '--projects-dir',
      REPOS_DIR,
      '--id',
      spec.ptId,
      '--short-name',
      spec.shortName,
      '--full-name',
      spec.fullName,
      '--language',
      spec.languageTag,
      '--language-name',
      spec.languageName,
      ...userArgs(spec.users),
      ...books.args
    ]);
  } finally {
    books.cleanup();
  }
}

export async function writeBook(ptId: string, bookCode: string, usfm: string): Promise<PtdaProjectInfo> {
  const books = bookArgs([{ bookCode: bookCode, usfm: usfm }]);
  try {
    return await runTool(['write-book', '--projects-dir', REPOS_DIR, '--id', ptId, ...books.args]);
  } finally {
    books.cleanup();
  }
}

export async function setProjectUsers(ptId: string, users: PtdaProjectUser[]): Promise<PtdaProjectInfo> {
  return await runTool(['set-users', '--projects-dir', REPOS_DIR, '--id', ptId, ...userArgs(users)]);
}

export async function projectInfo(ptId: string): Promise<PtdaProjectInfo> {
  return await runTool(['project-info', '--projects-dir', REPOS_DIR, '--id', ptId]);
}
