import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { HG_EXE } from './config.js';

const execFileAsync = promisify(execFile);

const EMPTY_TIP = '0'.repeat(40);

async function hg(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(HG_EXE, ['-R', repoDir, ...args], {
    maxBuffer: 256 * 1024 * 1024
  });
  return stdout;
}

export async function init(repoDir: string): Promise<void> {
  fs.mkdirSync(repoDir, { recursive: true });
  await execFileAsync(HG_EXE, ['init', repoDir]);
}

/** Commits all changes (including added/removed files). */
export async function commitAll(repoDir: string, message: string, user: string): Promise<void> {
  await hg(repoDir, ['commit', '-A', '-m', message, '-u', user]);
}

/** Tip changeset id, or 40 zeros for an empty repository. */
export async function tipId(repoDir: string): Promise<string> {
  const out = (await hg(repoDir, ['log', '-l', '1', '-T', '{node}'])).trim();
  return out === '' ? EMPTY_TIP : out;
}

/** All changeset ids, newest first. */
export async function revisionHistory(repoDir: string): Promise<string[]> {
  const out = await hg(repoDir, ['log', '-T', '{node}\n']);
  return out.split('\n').filter(line => line !== '');
}

/**
 * Creates a bundle of changesets not present in the given base revisions (all changesets when no
 * bases are given) and returns its bytes. Returns an empty buffer when there is nothing to send.
 */
export async function bundle(repoDir: string, type: string, bases: string[]): Promise<Buffer> {
  const bundleFile = path.join(os.tmpdir(), `sf-mock-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const args = ['bundle', '-t', type];
  if (bases.length === 0) {
    args.push('--all');
  } else {
    for (const base of bases) args.push('--base', base);
  }
  args.push(bundleFile);
  try {
    await hg(repoDir, args);
    return fs.readFileSync(bundleFile);
  } catch (error) {
    // Exit code 1 with "no changes found" means the client is up to date.
    if (error instanceof Error && /no changes found/.test(String((error as { stderr?: string; stdout?: string }).stderr ?? '') + String((error as { stdout?: string }).stdout ?? ''))) {
      return Buffer.alloc(0);
    }
    throw error;
  } finally {
    fs.rmSync(bundleFile, { force: true });
  }
}

/** Applies a bundle pushed by a client and updates the working directory. Throws on rejection. */
export async function unbundle(repoDir: string, bundleBytes: Buffer): Promise<void> {
  const bundleFile = path.join(os.tmpdir(), `sf-mock-unbundle-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(bundleFile, bundleBytes);
  try {
    await hg(repoDir, ['unbundle', bundleFile]);
    await hg(repoDir, ['update', '-C', 'tip']);
  } finally {
    fs.rmSync(bundleFile, { force: true });
  }
}
