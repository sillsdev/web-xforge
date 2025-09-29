#!/usr/bin/env -S deno run --allow-net

// This script polls to check whether the application has started at localhost:5000, and exits when it has started up,
// or exits with a failure if it hasn't started in 5 minutes.

const programName = "await-application-startup";
const pollUrl = "http://localhost:5000/projects";
const pollInterval = 1000;
const quietPeriodSec = 50_000;
const timeout = 5 * 60_000;

const startTime = Date.now();

function output(message: string) {
  console.log(programName + ": " + message);
}

setTimeout(() => {
  output(`Failed to start in ${timeout} milliseconds. Exiting.`);
  Deno.exit(1);
}, timeout);

function elapsedTime() {
  const currentTime = Date.now();
  const elapsed = currentTime - startTime;
  const minutes = Math.floor(elapsed / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function check() {
  const elapsedSec: number = Date.now() - startTime;
  const isQuietPeriod: boolean = elapsedSec < quietPeriodSec;

  try {
    const response = await fetch(pollUrl, {
      headers: { Accept: "text/html" }
    });
    if (response.ok) {
      if (isQuietPeriod) {
        console.log(); // New line after dots
      }
      output(`${elapsedTime()} Startup check passed. Exiting.`);
      Deno.exit(0);
    } else {
      if (isQuietPeriod) {
        Deno.stdout.writeSync(new TextEncoder().encode("."));
      } else {
        output(`${elapsedTime()} Startup check failed: ${response.status} ${response.statusText}`);
      }
    }
  } catch (error) {
    if (isQuietPeriod) {
      Deno.stdout.writeSync(new TextEncoder().encode("."));
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    output(`${elapsedTime()} Startup check failed: ${message}`);
  }
}

setTimeout(check, 0);
setInterval(check, pollInterval);
