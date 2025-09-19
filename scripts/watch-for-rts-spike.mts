#!/usr/bin/env -S deno run --allow-run="ps,pgrep,kill"

// Monitors a Node.js process for high resident memory usage and, once a threshold is exceeded, repeatedly
// sends SIGUSR2 signals at a configured interval so the target process can perform diagnostic actions.
// Designed to help capture data around sudden RealtimeServer memory spikes.
// SF dotnet should be running with environment `SF_SIGUSR2_ACTION=resourceUsage`, as
// interpreted by `src/RealtimeServer/common/diagnostics.ts`.
// This runs on the SF server, but more investigation would be needed to run on a Windows machine.

// @ts-ignore Deno provides this module resolution at runtime.
import { parseArgs } from "jsr:@std/cli/parse-args";

// Help IDE.
declare const Deno: any;

interface CliOptions {
  thresholdMib: number;
  intervalSeconds: number;
}

/** Watches for the RealtimeServer process and while its RSS is above a threshold sends SIGUSR2 with exponential backoff. */
class RtsMon {
  private currentIntervalSeconds: number;

  constructor(private readonly options: CliOptions) {
    this.currentIntervalSeconds = options.intervalSeconds;
  }

  async monitor(): Promise<void> {
    Program.log(
      `Monitoring RealtimeServer resource usage. Threshold: ${this.options.thresholdMib} MiB. Starting interval: ${this.options.intervalSeconds} s`
    );
    while (true) {
      await this.delay();
      const pid: number | undefined = await this.findRealtimeServerPid();
      if (pid == null) {
        Program.log(`RealtimeServer not found. Waiting for it to start.`);
        this.resetDelay();
        continue;
      }

      const memoryUsageMB: number | undefined = await this.readRssMib(pid);
      if (memoryUsageMB == null) {
        this.resetDelay();
        continue;
      }

      const aboveThreshold: boolean = memoryUsageMB >= this.options.thresholdMib;
      if (aboveThreshold === true) {
        await this.sendSignal(pid);
        this.currentIntervalSeconds *= 2;
        Program.log(
          `RSS ${memoryUsageMB.toFixed(1)}MB >= threshold (${this.options.thresholdMib} MiB). Increasing interval to ${
            this.currentIntervalSeconds
          } s`
        );
      } else {
        if (this.currentIntervalSeconds > this.options.intervalSeconds) {
          // Memory usage came back down below the threshold since last check. Collect one more report.
          await this.sendSignal(pid);
        }
        Program.log(`RSS ${memoryUsageMB.toFixed(1)} MiB (below threshold ${this.options.thresholdMib} MiB).`);
        this.resetDelay();
      }
    }
  }

  private async delay(): Promise<void> {
    const ms = this.currentIntervalSeconds * 1000;
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private resetDelay(): void {
    this.currentIntervalSeconds = this.options.intervalSeconds;
  }

  private async sendSignal(pid: number): Promise<void> {
    try {
      await this.runCommand("kill", ["-SIGUSR2", String(pid)]);
      Program.log(`Sent SIGUSR2 to pid ${pid}`);
    } catch (e) {
      Program.logError(`Failed to send SIGUSR2 to pid ${pid}: ${(e as Error).message}`);
    }
  }

  private async readRssMib(pid: number): Promise<number | undefined> {
    try {
      const { code, stdout } = await this.runCommand("ps", ["--quick-pid", String(pid), "--no-headers", "-o", "rss"]);
      if (code !== 0) return undefined;
      const text: string = new TextDecoder().decode(stdout).trim();
      const kib: number = Number.parseInt(text, 10);
      if (Number.isNaN(kib)) return undefined;
      return kib / 1024; // convert to MiB
    } catch {
      return undefined;
    }
  }

  private async findRealtimeServerPid(): Promise<number | undefined> {
    try {
      const { code, stdout } = await this.runCommand("pgrep", ["--full", "--", "node .* --port 5002"]);
      if (code !== 0) return undefined;
      const text: string = new TextDecoder().decode(stdout).trim();
      const lines: string[] = text.split(/\n+/);
      if (lines.length === 0) return undefined;
      const pid: number = Number.parseInt(lines[0], 10);
      if (Number.isNaN(pid)) return undefined;
      if (lines.length > 1) {
        Program.log(`Warning: Multiple RealtimeServer processes found. Picking one of them.`);
      }
      return pid;
    } catch {
      return undefined;
    }
  }
  private async runCommand(
    cmd: string,
    args: string[]
  ): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    const command = new Deno.Command(cmd, { args });
    return await command.output();
  }
}

/** Handles running the program. */
class Program {
  static programName: string = "rtsmon";

  async main(): Promise<void> {
    try {
      const options: CliOptions = this.parse(Deno.args);
      const watcher: RtsMon = new RtsMon(options);
      Deno.addSignalListener("SIGINT", () => {
        Program.log("Received SIGINT. Exiting.");
        Deno.exit(0);
      });
      await watcher.monitor();
    } catch (e) {
      Program.logError((e as Error).message);
      Deno.exit(1);
    }
  }

  static log(message: string): void {
    const timestamp: string = new Date().toISOString();
    console.log(`${timestamp} ${Program.programName}: ${message}`);
  }

  static logError(message: string): void {
    const timestamp: string = new Date().toISOString();
    console.error(`${timestamp} ${Program.programName}: ${message}`);
  }

  private parse(args: string[]): CliOptions {
    const parseOptions = {
      boolean: ["help"],
      default: { "threshold-mib": 1.5 * 1024, "interval-seconds": 10 }
    };
    const parsed = parseArgs(args, parseOptions);
    const allowed: Set<string> = new Set(["threshold-mib", "interval-seconds", "help", "_"]);
    for (const key of Object.keys(parsed)) {
      if (allowed.has(key) === false) {
        Program.logError(`Unexpected argument: ${key}`);
        Deno.exit(1);
      }
    }
    if (parsed._.length > 0) {
      Program.logError(`Unexpected arguments: ${parsed._.join(", ")}`);
      Deno.exit(1);
    }
    if (parsed.help === true) {
      Program.log(`Usage: watch-for-rts-spike.mts [--threshold-mib N] [--interval-seconds N]`);
      Program.log(`Defaults: ${JSON.stringify(parseOptions.default)}`);
      Deno.exit(0);
    }
    if (Array.isArray(parsed._) && parsed._.length > 0) {
      Program.logError(`Unexpected positional arguments: ${parsed._.join(", ")}`);
      Deno.exit(1);
    }

    const thresholdMib: number = this.toNumber(parsed["threshold-mib"], "threshold-mib");
    const intervalSeconds: number = this.toNumber(parsed["interval-seconds"], "interval-seconds");
    return { thresholdMib, intervalSeconds };
  }

  private toNumber(value: unknown, name: string): number {
    if (typeof value === "number") return value;
    throw new Error(`${name} must be a number`);
  }
}

await new Program().main();
