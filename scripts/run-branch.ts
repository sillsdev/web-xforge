#!/usr/bin/env -S deno run --allow-run --allow-write --allow-env=HOME --allow-read

// Script to switch branches and run SF with a clean state.
// Note that this script is created for testing SF, and local work will be stashed or discarded!
// Usage: scripts/run-branch.ts <branch-name>
// Example: scripts/run-branch.ts origin/task/sf-1234

import { parseArgs } from 'jsr:@std/cli/parse-args';
import * as path from 'jsr:@std/path';

const PROGRAM_NAME = 'run-branch';

let logFile: any = null;
let logFilePath: string = '';

/** Main entry point */
async function main(): Promise<void> {
  try {
    const args = parseArgs(Deno.args, {
      boolean: ['help', 'repair']
    });

    if (args.help === true || args._.length === 0) {
      showHelp();
      Deno.exit(0);
    }

    if (args._.length !== 1) {
      logError('Expected exactly one argument: branch name');
      showHelp();
      Deno.exit(1);
    }

    const branchName = String(args._[0]);
    const shouldRepair = args.repair === true;

    await setupLogging();

    setupSignalHandlers();

    log(`Repair mode: ${shouldRepair ? 'enabled' : 'disabled'}`);
    await environment_info();
    await kill_sf();
    await prepare_to_leave_branch();
    await clean();
    if (shouldRepair) {
      await repair();
      await prepare_to_leave_branch();
    }
    await switch_branch(branchName);
    await update_dependencies();
    await run_sf();

    log('Press Ctrl+C to exit.');
    // Keep the script alive until Ctrl+C
    await new Promise(() => {}); // Never resolves
  } catch (e) {
    logError(`Fatal error: ${(e as Error).message}`);
    if (e instanceof Error && e.stack != null) {
      logError(e.stack);
    }
    Deno.exit(1);
  }
}

/** Set up logging to a temporary file */
async function setupLogging(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `run-branch-${timestamp}-`;
  const suffix = '.txt';
  logFilePath = await Deno.makeTempFile({ prefix, suffix });

  logFile = await Deno.open(logFilePath, {
    write: true,
    create: true,
    truncate: true
  });

  log(`Logging to: ${logFilePath}`);
}

/** Set up signal handlers for graceful shutdown */
function setupSignalHandlers(): void {
  Deno.addSignalListener('SIGINT', async () => {
    log('Received SIGINT. Cleaning up and exiting.');
    await kill_sf();
    log('Finished.');
    if (logFile != null) {
      logFile.close();
    }
    console.log(`Log file: ${logFilePath}`);
    Deno.exit(0);
  });
}

// ANSI color codes
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

type LogStyle = {
  bold?: boolean;
  color?: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
};

function logHeader(message: string): void {
  log(message, { bold: true });
}

/** Log a message to console and file */
function log(message: string, style?: LogStyle): void {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} ${PROGRAM_NAME}: ${message}`;

  // Apply styling for console output
  let consoleMessage = formattedMessage;
  if (style != null) {
    let prefix = '';
    if (style.bold === true) {
      prefix += ANSI.bold;
    }
    if (style.color != null) {
      prefix += ANSI[style.color];
    }
    if (prefix.length > 0) {
      consoleMessage = `${prefix}${formattedMessage}${ANSI.reset}`;
    }
  }
  console.log(consoleMessage);

  // Write plain text to log file (no ANSI codes)
  if (logFile != null) {
    const encoder = new TextEncoder();
    logFile.writeSync(encoder.encode(formattedMessage + '\n'));
  }
}

/** Log an error message */
function logError(message: string): void {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} ${PROGRAM_NAME}: ERROR: ${message}`;
  console.error(formattedMessage);

  if (logFile != null) {
    const encoder = new TextEncoder();
    logFile.writeSync(encoder.encode(formattedMessage + '\n'));
  }
}

/** Get the repository root directory */
function getRepoRoot(): string {
  const scriptPath = path.fromFileUrl(import.meta.url);
  return path.dirname(path.dirname(scriptPath));
}

/** Run a command and log its output */
async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; background?: boolean } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cwd = options.cwd ?? getRepoRoot();
  const cmdString = `${command} ${args.join(' ')}`;
  log(`Running: ${cmdString} (in ${cwd})`);

  if (options.background === true) {
    const cmd = new Deno.Command(command, {
      args,
      cwd,
      stdout: 'piped',
      stderr: 'piped',
      stdin: 'null'
    });

    const process = cmd.spawn();
    log(`Started background process: ${cmdString}`);

    // Stream stdout to both console and log file
    (async () => {
      const reader = process.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          // Write to console
          Deno.stdout.writeSync(new TextEncoder().encode(text));
          // Write to log file
          if (logFile != null) {
            logFile.writeSync(new TextEncoder().encode(text));
          }
        }
      } catch (e) {
        logError(`Error reading stdout from background process: ${(e as Error).message}`);
      }
    })();

    // Stream stderr to both console and log file
    (async () => {
      const reader = process.stderr.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          // Write to console stderr
          Deno.stderr.writeSync(new TextEncoder().encode(text));
          // Write to log file
          if (logFile != null) {
            logFile.writeSync(new TextEncoder().encode(text));
          }
        }
      } catch (e) {
        logError(`Error reading stderr from background process: ${(e as Error).message}`);
      }
    })();

    // Return immediately for background processes
    return { code: 0, stdout: '', stderr: '' };
  }

  const cmd = new Deno.Command(command, {
    args,
    cwd,
    stdout: 'piped',
    stderr: 'piped'
  });

  const output = await cmd.output();
  const decoder = new TextDecoder();
  const stdout = decoder.decode(output.stdout);
  const stderr = decoder.decode(output.stderr);

  if (stdout.length > 0) {
    log(`stdout: ${stdout.trim()}`);
  }
  if (stderr.length > 0) {
    log(`stderr: ${stderr.trim()}`);
  }

  return { code: output.code, stdout, stderr };
}

async function environment_info(): Promise<void> {
  logHeader('Environment information:');

  // Show machine info
  try {
    const homeDir = Deno.env.get('HOME') ?? '';
    const machineInfoPath = `${homeDir}/machine-info.txt`;
    await runCommand('cat', [machineInfoPath]);
  } catch {
    log('Problem reading machine-info.txt');
  }

  try {
    await runCommand('lsb_release', ['-a']);
  } catch {
    log('Problem getting LSB release info');
  }

  try {
    const mongodVersionResult = await runCommand('mongod', ['--version']);
    if (mongodVersionResult.code !== 0) {
      logError('Querying mongod version had an error. Problem with AVX?');
    }
  } catch {
    log('Problem getting MongoDB version');
  }

  try {
    await runCommand('systemctl', ['status', 'mongod.service', '--no-pager']);
  } catch {
    log('Problem getting MongoDB service status');
  }

  try {
    await runCommand('sh', ['-c', 'lscpu | grep avx']);
  } catch {
    log('Problem checking CPU AVX support');
  }

  try {
    await runCommand('node', ['--version']);
  } catch {
    log('Problem getting Node.js version');
  }

  try {
    await runCommand('npm', ['--version']);
  } catch {
    log('Problem getting npm version');
  }
}

/** Kill SF processes. */
async function kill_sf(): Promise<void> {
  logHeader('Killing SF processes...');

  // Kill dotnet backend
  try {
    await runCommand('pkill', ['SIL.XForge.Scr']);
  } catch {
    // Ignore errors - process might not be running
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Kill RealtimeServer (Node process on port 5002)
  try {
    await runCommand('pkill', ['--signal', 'TERM', '--full', '--', 'node .* --port 5002']);
  } catch {
    // Ignore errors - process might not be running
  }
}

/** Clean the workspace */
async function clean(): Promise<void> {
  logHeader('Cleaning workspace...');

  const repoRoot = getRepoRoot();
  const realtimeServerPath = path.join(repoRoot, 'src', 'RealtimeServer');
  const realtimeLibPath = path.join(realtimeServerPath, 'lib');

  // Remove RealtimeServer lib
  try {
    await Deno.remove(realtimeLibPath, { recursive: true });
    log(`Deleted ${realtimeLibPath}`);
  } catch (e) {
    log(`Could not delete ${realtimeLibPath}: ${(e as Error).message}`);
  }

  // Find and remove obj directories
  log('Removing obj directories...');
  let result = await runCommand('sh', ['-c', 'find test src -name obj -print0 | xargs -0 rm -vrf'], {
    cwd: repoRoot
  });
  if (result.code !== 0) {
    logError('Failed to remove obj directories.');
  }

  // Run dotnet clean
  log('Running dotnet clean...');
  result = await runCommand('dotnet', ['clean'], { cwd: repoRoot });
  if (result.code !== 0) {
    logError('dotnet clean failed.');
  }
}

/** Update dependencies. */
async function update_dependencies(): Promise<void> {
  logHeader('Updating dependencies...');

  const repoRoot = getRepoRoot();
  const realtimeServerPath = path.join(repoRoot, 'src', 'RealtimeServer');
  const clientAppPath = path.join(repoRoot, 'src', 'SIL.XForge.Scripture', 'ClientApp');

  // Restore dotnet tools
  log('Restoring dotnet tools...');
  let result = await runCommand('dotnet', ['tool', 'restore'], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error('dotnet tool restore failed.');
  }

  // npm ci in RealtimeServer
  log('Running npm ci in RealtimeServer...');
  result = await runCommand('npm', ['ci'], { cwd: realtimeServerPath });
  if (result.code !== 0) {
    throw new Error('npm ci in RealtimeServer failed');
  }

  // npm ci in ClientApp
  log('Running npm ci in ClientApp...');
  result = await runCommand('npm', ['ci'], { cwd: clientAppPath });
  if (result.code !== 0) {
    throw new Error('npm ci in ClientApp failed');
  }

  log('Running dotnet restore...');
  result = await runCommand('dotnet', ['restore'], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error('dotnet restore failed');
  }
}

/** Prepare to leave the current branch. */
async function prepare_to_leave_branch(): Promise<void> {
  logHeader('Preparing to leave current branch...');

  // Check if there are any changes to stash
  const statusResult = await runCommand('git', ['status', '--porcelain']);
  if (statusResult.stdout.trim().length > 0) {
    log('Changes detected, stashing...');
    const stashResult = await runCommand('git', [
      'stash',
      'push',
      '--include-untracked',
      '--message',
      `Auto-stash from ${PROGRAM_NAME}`
    ]);
    if (stashResult.code !== 0) {
      throw new Error('Failed to stash changes');
    }
    log('Changes stashed.');
  } else {
    log('No changes to stash.');
  }
}

/** Switch to the specified branch */
async function switch_branch(branchName: string): Promise<void> {
  logHeader(`Switching to branch: ${branchName}...`);

  const fetchResult = await runCommand('git', ['fetch', '--all']);
  if (fetchResult.code !== 0) {
    throw new Error('git fetch failed');
  }

  const checkoutResult = await runCommand('git', ['checkout', branchName]);
  if (checkoutResult.code !== 0) {
    throw new Error(`Failed to checkout ${branchName}`);
  }

  if (!branchName.startsWith('origin/')) {
    // For local branches, check if we need to update from upstream. No doubt this could be written less bluntly.
    const upstreamResult = await runCommand('git', ['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`]);
    if (upstreamResult.code === 0 && upstreamResult.stdout.trim().length > 0) {
      const upstream = upstreamResult.stdout.trim();
      const currentCommitIdResult = await runCommand('git', ['rev-parse', 'HEAD']);
      if (currentCommitIdResult.code !== 0) {
        throw new Error(`Failed to get current commit ID for branch ${branchName}.`);
      }
      const currentCommitId = currentCommitIdResult.stdout.trim();
      log(
        `Local branch has upstream "${upstream}". Resetting local branch to match upstream. Note that this discards any work leading up to local commit ${currentCommitId}.`
      );
      const resetResult = await runCommand('git', ['reset', '--hard', upstream]);
      if (resetResult.code !== 0) {
        throw new Error(`Failed to reset local branch ${branchName} to upstream ${upstream}.`);
      }
    } else {
      throw new Error(`Requested branch ${branchName} has no remote branch.`);
    }
  }
}

/** Repair */
async function repair(): Promise<void> {
  logHeader('Running repair ...');

  const repoRoot = getRepoRoot();
  const clientAppPath = path.join(repoRoot, 'src', 'SIL.XForge.Scripture', 'ClientApp');
  const nodeModulesPath = path.join(clientAppPath, 'node_modules');
  const realtimeServerPath = path.join(repoRoot, 'src', 'RealtimeServer');
  const realtimeNodeModulesPath = path.join(realtimeServerPath, 'node_modules');
  const sfBinPath = path.join(repoRoot, 'src', 'SIL.XForge.Scripture', 'bin');

  // Delete ClientApp node_modules
  try {
    await Deno.remove(nodeModulesPath, { recursive: true });
    log(`Deleted ${nodeModulesPath}`);
  } catch (e) {
    log(`Could not delete ${nodeModulesPath}: ${(e as Error).message}`);
  }

  // Delete RealtimeServer node_modules
  try {
    await Deno.remove(realtimeNodeModulesPath, { recursive: true });
    log(`Deleted ${realtimeNodeModulesPath}`);
  } catch (e) {
    log(`Could not delete ${realtimeNodeModulesPath}: ${(e as Error).message}`);
  }

  // Delete SF bin directory
  try {
    await Deno.remove(sfBinPath, { recursive: true });
    log(`Deleted ${sfBinPath}`);
  } catch (e) {
    log(`Could not delete ${sfBinPath}: ${(e as Error).message}`);
  }

  // Check for upgradable apt packages
  log('Checking for upgradable apt packages...');
  try {
    const aptResult = await runCommand('apt', ['list', '--upgradable']);
    if (aptResult.stdout.trim().length > 0) {
      const lines = aptResult.stdout.trim().split('\n');
      // First line is usually "Listing..." so check if there's more
      if (lines.length > 1) {
        const packageCount = lines.length - 1; // Subtract the "Listing..." header
        log(
          `There are ${packageCount} pending apt package upgrades. Consider running: sudo apt update && sudo apt upgrade`
        );
      } else {
        log('No upgradable apt packages.');
      }
    }
  } catch (e) {
    log(`Could not check apt packages: ${(e as Error).message}`);
  }

  // Check for warning file
  const homeDir = Deno.env.get('HOME');
  if (homeDir == null) throw new Error('HOME environment variable not set');
  const warningFilePath = path.join(homeDir, 'Desktop', 'warning-not-provisioned.txt');
  let canaryExists = false;
  try {
    const fileInfo = await Deno.stat(warningFilePath);
    canaryExists = fileInfo.isFile === true;
  } catch {
    log('No warning-not-provisioned.txt file found.');
  }
  if (canaryExists) {
    throw new Error(
      `${warningFilePath} exists. System may not be provisioned. Examine this file for more information.`
    );
  }

  // Run ansible playbook on origin/master
  log('Running ansible-playbook for provisioning...');
  // Check if there are any changes to stash
  const statusResult = await runCommand('git', ['status', '--porcelain', '--ignored']);
  if (statusResult.stdout.trim().length > 0) {
    log('Changes (possibly ignored files) detected. Stashing...');
    const stashResult = await runCommand('git', [
      'stash',
      'push',
      '--all',
      '--message',
      `Auto-stash (including ignored files) from ${PROGRAM_NAME}`
    ]);
    if (stashResult.code !== 0) {
      throw new Error('Failed to stash changes');
    }
    log('Changes stashed.');
  } else {
    log('No changes to stash.');
  }

  // Run ansible playbook
  await switch_branch('origin/master');
  const deployPath = path.join(repoRoot, 'deploy');
  log('Running ansible-playbook dev-server.playbook.yml...');
  const playbookResult = await runCommand(
    'ansible-playbook',
    ['dev-server.playbook.yml', '--limit', 'localhost', '--diff'],
    { cwd: deployPath }
  );

  if (playbookResult.code !== 0) {
    throw new Error('Ansible playbook failed.');
  } else {
    log('Ansible playbook completed successfully.');
  }

  log('Repair complete.');
}

/** Run SF. */
async function run_sf(): Promise<void> {
  logHeader('Starting SF...');

  const repoRoot = getRepoRoot();
  const backendPath = path.join(repoRoot, 'src', 'SIL.XForge.Scripture');
  runCommand('dotnet', ['run'], { cwd: backendPath, background: true });
  await Promise.resolve();
}

/** Show help message */
function showHelp(): void {
  console.log(`
Usage: ${PROGRAM_NAME} [options] <branch-name>

Switch to an updated branch and run SF with a clean state.
Note that this script is created for testing SF, and local work will be stashed or discarded!

Arguments:
  branch-name    The git branch to switch to (e.g., origin/task/sf-1234)

Options:
  --repair       More aggressively clean and apply updates
  --help         Show this help message

Example:
  scripts/run-branch.ts origin/task/sf-1234
  scripts/run-branch.ts task/sf-1234
  scripts/run-branch.ts --repair origin/task/sf-1234

`);
}

await main();
