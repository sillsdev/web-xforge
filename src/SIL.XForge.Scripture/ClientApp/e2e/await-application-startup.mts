#!/usr/bin/env -S deno run --allow-net

// This script polls to check whether the application has started at localhost:5000, and exits when it has started up,
// or exits with a failure if it hasn't started in 5 minutes.

const pollUrl = 'http://localhost:5000/projects';
const pollInterval = 1000;
const timeout = 5 * 60_000;

setTimeout(() => {
  console.log('Failed to start in ', timeout, ' milliseconds. Exiting.')
  Deno.exit(1);
}, timeout);

const startTime = Date.now();
function elapsedTime() {
  const currentTIme = Date.now();
  const elapsed = currentTIme - startTime;
  const minutes = Math.floor(elapsed / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1000)
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
}

async function check() {
  try {
    const response = await fetch(pollUrl, {
      headers: { 'Accept': 'text/html' }
    });
    if (response.ok) {
      console.log(elapsedTime(), 'Startup check passed. Exiting.')
      Deno.exit(0);
    } else {
      console.log(elapsedTime(), 'Startup check failed: ', response.status, response.statusText)
    } } catch (error) {
      console.log(elapsedTime(), 'Startup check failed: '+ error.message)
  }
}

setTimeout(check, 0);
setInterval(check, pollInterval);