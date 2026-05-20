#!/usr/bin/env -S deno run --allow-run=git --allow-write

interface CliOptions {
  baseSha: string;
  headSha: string;
  findingsPath: string;
  commentPath: string;
}

type FindingCategory = 'introduced' | 'existing_new_script';

interface Finding {
  lockfilePath: string;
  category: FindingCategory;
  packageName: string;
  versions: string[];
  packageKeys: string[];
}

interface LockfilePackage {
  name?: unknown;
  version?: unknown;
  hasInstallScript?: unknown;
}

interface LockfileJson {
  name?: unknown;
  packages?: Record<string, LockfilePackage>;
}

interface ScriptInfo {
  versions: Set<string>;
  packageKeys: Set<string>;
}

interface Snapshot {
  allNames: Set<string>;
  hasScriptByName: Map<string, ScriptInfo>;
}

const MARKER: string = '<!-- monitor-npm-hasInstallScript -->';
const MAX_DIFF_LINES: number = 30;

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

function parseArgs(args: string[]): CliOptions {
  if (args.includes('--help')) {
    console.log(
      'Usage: monitor-npm-has-install-script.mts --base-sha SHA --head-sha SHA --findings-path PATH --comment-path PATH'
    );
    Deno.exit(0);
  }

  const values: Record<string, string> = {};
  const allowed: Set<string> = new Set(['base-sha', 'head-sha', 'findings-path', 'comment-path']);

  for (let i = 0; i < args.length; i += 1) {
    const arg: string = args[i];
    if (arg.startsWith('--') === false) {
      fail(`Unexpected argument: ${arg}`);
    }

    const key: string = arg.slice(2);
    if (allowed.has(key) === false) {
      fail(`Unsupported argument: --${key}`);
    }

    const value: string | undefined = args[i + 1];
    if (value == null || value.startsWith('--')) {
      fail(`Missing value for --${key}`);
    }

    values[key] = value;
    i += 1;
  }

  const requiredKeys: string[] = ['base-sha', 'head-sha', 'findings-path', 'comment-path'];
  for (const requiredKey of requiredKeys) {
    if (values[requiredKey] == null || values[requiredKey] === '') {
      fail(`Missing required argument: --${requiredKey}`);
    }
  }

  const result: CliOptions = {
    baseSha: values['base-sha'],
    headSha: values['head-sha'],
    findingsPath: values['findings-path'],
    commentPath: values['comment-path']
  };
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function normalizePackageName(packageKey: string, pkg: LockfilePackage, rootName: string): string {
  // Prefer explicit package metadata when available.
  if (typeof pkg.name === 'string' && pkg.name.trim() !== '') {
    return pkg.name;
  }

  // The empty key represents the root package entry in lockfile "packages".
  if (packageKey === '') {
    return rootName;
  }

  // For entries like ".../node_modules/<name>", keep only "<name>".
  const marker: string = 'node_modules/';
  const markerIndex: number = packageKey.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return packageKey.slice(markerIndex + marker.length);
  }

  // Fallback for any other path-like key shape.
  // In well-formed npm lockfiles this should still produce a name segment, but malformed or odd keys
  // (for example "/" or "node_modules/" with nothing after it) can resolve to an empty string.
  // Returning "" results in being skipped by the caller.
  const segments: string[] = packageKey.split('/');
  // The nullish-coalescing fallback is defensive in case array indexing yields undefined.
  return segments[segments.length - 1] ?? '';
}

function categorySortWeight(category: FindingCategory): number {
  if (category === 'introduced') {
    return 0;
  }
  return 1;
}

function categoryLabel(category: FindingCategory): string {
  if (category === 'introduced') {
    return 'Introduced package with install script';
  }
  return 'Existing package now has install script';
}

function toPackageJsonPath(lockfilePath: string): string | undefined {
  if (lockfilePath.endsWith('package-lock.json') === false) {
    return undefined;
  }
  return `${lockfilePath.slice(0, -'package-lock.json'.length)}package.json`;
}

function toLines(text: string): string[] {
  const normalized: string = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (normalized === '') {
    return [];
  }
  return normalized.split('\n');
}

async function runGit(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const output = await new Deno.Command('git', {
    args,
    stdout: 'piped',
    stderr: 'piped'
  }).output();

  const decoder: TextDecoder = new TextDecoder();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr)
  };
}

async function runGitOrThrow(args: string[]): Promise<string> {
  const result = await runGit(args);
  if (result.code !== 0) {
    const stderr: string = result.stderr.trim();
    throw new Error(`git ${args.join(' ')} failed${stderr === '' ? '' : `: ${stderr}`}`);
  }
  return result.stdout;
}

async function gitPathExists(sha: string, path: string): Promise<boolean> {
  const result = await runGit(['cat-file', '-e', `${sha}:${path}`]);
  return result.code === 0;
}

async function listLockfilesAtSha(sha: string): Promise<string[]> {
  const output: string = await runGitOrThrow(['ls-tree', '--name-only', '--full-tree', '-r', sha]);
  return (
    output
      .split('\n')
      .map(line => line.trim())
      // Match package-lock.json at repo root or any subdirectory, and only that exact filename.
      // `(^|\/)` matches either the start of a string or a forward slash character.
      .filter(line => line !== '' && /(^|\/)package-lock\.json$/.test(line))
  );
}

async function readGitFile(sha: string, path: string): Promise<string | undefined> {
  if ((await gitPathExists(sha, path)) === false) {
    return undefined;
  }
  return await runGitOrThrow(['show', `${sha}:${path}`]);
}

function parseSnapshot(lockfileText: string, lockfilePath: string, sha: string): Snapshot {
  let parsed: LockfileJson;
  try {
    parsed = JSON.parse(lockfileText) as LockfileJson;
  } catch (error) {
    throw new Error(`Failed to parse JSON for ${lockfilePath} at ${sha}: ${(error as Error).message}`);
  }

  const rootName: string = typeof parsed.name === 'string' ? parsed.name : '';
  const packages: Record<string, LockfilePackage> =
    isObject(parsed.packages) === true ? (parsed.packages as Record<string, LockfilePackage>) : {};

  const allNames: Set<string> = new Set<string>();
  // For each package name with hasInstallScript=true, collect all seen versions and lockfile keys.
  // This lets us merge repeated occurrences of the same package name in different lockfile paths.
  const hasScriptByName: Map<string, ScriptInfo> = new Map<string, ScriptInfo>();

  for (const [packageKey, pkg] of Object.entries(packages)) {
    if (isObject(pkg) === false) {
      continue;
    }

    const packageName: string = normalizePackageName(packageKey, pkg as LockfilePackage, rootName);
    if (packageName !== '') {
      allNames.add(packageName);
    }

    if (pkg.hasInstallScript === true && packageName !== '') {
      // Multiple entries can share the same package name. Reuse the existing accumulator when present,
      // otherwise start a new one.
      const existing: ScriptInfo | undefined = hasScriptByName.get(packageName);
      const scriptInfo: ScriptInfo =
        existing == null
          ? {
              versions: new Set<string>(),
              packageKeys: new Set<string>()
            }
          : existing;

      // Keep growing the same record for this package name as we encounter additional entries.
      // Set handles de-duplication for repeated versions/keys.
      if (typeof pkg.version === 'string' && pkg.version !== '') {
        scriptInfo.versions.add(pkg.version);
      }
      scriptInfo.packageKeys.add(packageKey);

      hasScriptByName.set(packageName, scriptInfo);
    }
  }

  return { allNames, hasScriptByName };
}

function findNewInstallScriptUsage(baseSnapshot: Snapshot, headSnapshot: Snapshot, lockfilePath: string): Finding[] {
  const findings: Finding[] = [];
  const packageNames: string[] = [...headSnapshot.hasScriptByName.keys()].sort();

  for (const packageName of packageNames) {
    const scriptInfo: ScriptInfo | undefined = headSnapshot.hasScriptByName.get(packageName);
    if (scriptInfo == null) {
      continue;
    }

    let category: FindingCategory | undefined;
    if (baseSnapshot.allNames.has(packageName) === false) {
      category = 'introduced';
    } else if (baseSnapshot.hasScriptByName.has(packageName) === false) {
      category = 'existing_new_script';
    }

    if (category != null) {
      findings.push({
        lockfilePath,
        category,
        packageName,
        versions: [...scriptInfo.versions].sort(),
        packageKeys: [...scriptInfo.packageKeys].sort()
      });
    }
  }

  return findings;
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left: Finding, right: Finding) => {
    if (left.lockfilePath !== right.lockfilePath) {
      return left.lockfilePath.localeCompare(right.lockfilePath);
    }

    const categoryWeightDiff: number = categorySortWeight(left.category) - categorySortWeight(right.category);
    if (categoryWeightDiff !== 0) {
      return categoryWeightDiff;
    }

    return left.packageName.localeCompare(right.packageName);
  });
}

async function appendPackageJsonDiffs(
  lines: string[],
  findings: Finding[],
  baseSha: string,
  headSha: string
): Promise<void> {
  const lockfiles: string[] = [...new Set(findings.map(finding => finding.lockfilePath))].sort();

  let headingAdded: boolean = false;
  for (const lockfilePath of lockfiles) {
    const packageJsonPath: string | undefined = toPackageJsonPath(lockfilePath);
    if (packageJsonPath == null) {
      continue;
    }

    const existsInEitherSha: boolean =
      (await gitPathExists(baseSha, packageJsonPath)) || (await gitPathExists(headSha, packageJsonPath));
    if (existsInEitherSha === false) {
      continue;
    }

    const diffText: string = await runGitOrThrow(['diff', '--unified=3', baseSha, headSha, '--', packageJsonPath]);
    const diffLines: string[] = toLines(diffText);
    if (diffLines.length === 0) {
      continue;
    }

    if (headingAdded === false) {
      lines.push('');
      lines.push('Relevant package.json diff snippets:');
      headingAdded = true;
    }

    lines.push('');
    lines.push(`<details><summary>${packageJsonPath}</summary>`);
    lines.push('');
    lines.push('```diff');
    const displayedLines: string[] = diffLines.slice(0, MAX_DIFF_LINES);
    lines.push(...displayedLines);
    if (diffLines.length > MAX_DIFF_LINES) {
      lines.push('... (truncated)');
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
  }
}

async function buildComment(findings: Finding[], baseSha: string, headSha: string): Promise<string> {
  const sortedFindings: Finding[] = sortFindings(findings);
  const lines: string[] = [MARKER];

  if (sortedFindings.length === 0) {
    lines.push('No new npm install scripts detected.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('**Warning:** New npm install script detected.');
  lines.push('');
  lines.push('Detected packages:');

  let previousLockfile: string | undefined;
  let previousCategory: FindingCategory | undefined;

  for (const finding of sortedFindings) {
    if (finding.lockfilePath !== previousLockfile) {
      if (previousLockfile != null) {
        lines.push('');
      }
      lines.push(`- **${finding.lockfilePath}**`);
      previousLockfile = finding.lockfilePath;
      previousCategory = undefined;
    }

    if (finding.category !== previousCategory) {
      lines.push(`  - ${categoryLabel(finding.category)}:`);
      previousCategory = finding.category;
    }

    const versionsText: string = finding.versions.length > 0 ? finding.versions.join(', ') : 'unknown version';
    const packageKeysText: string = finding.packageKeys.length > 0 ? ` (${finding.packageKeys.join(', ')})` : '';
    lines.push(`    - ${finding.packageName} (${versionsText})${packageKeysText}`);
  }

  await appendPackageJsonDiffs(lines, sortedFindings, baseSha, headSha);
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options: CliOptions = parseArgs(Deno.args);

  const baseLockfiles: string[] = await listLockfilesAtSha(options.baseSha);
  const headLockfiles: string[] = await listLockfilesAtSha(options.headSha);
  const lockfilePaths: string[] = [...new Set([...baseLockfiles, ...headLockfiles])].sort();

  const findings: Finding[] = [];

  for (const lockfilePath of lockfilePaths) {
    const baseLockfile: string = (await readGitFile(options.baseSha, lockfilePath)) ?? '{"packages":{}}\n';
    const headLockfile: string | undefined = await readGitFile(options.headSha, lockfilePath);

    if (headLockfile == null) {
      continue;
    }

    const baseSnapshot: Snapshot = parseSnapshot(baseLockfile, lockfilePath, options.baseSha);
    const headSnapshot: Snapshot = parseSnapshot(headLockfile, lockfilePath, options.headSha);

    findings.push(...findNewInstallScriptUsage(baseSnapshot, headSnapshot, lockfilePath));
  }

  const sortedFindings: Finding[] = sortFindings(findings);
  const findingsContent: string =
    sortedFindings.length === 0
      ? ''
      : `${sortedFindings
          .map(
            finding =>
              `${finding.lockfilePath}\t${finding.category}\t${finding.packageName}\t${finding.versions.join(', ')}\t${finding.packageKeys.join(', ')}`
          )
          .join('\n')}\n`;

  await Deno.writeTextFile(options.findingsPath, findingsContent);

  const comment: string = await buildComment(sortedFindings, options.baseSha, options.headSha);
  await Deno.writeTextFile(options.commentPath, comment);
}

await main();
