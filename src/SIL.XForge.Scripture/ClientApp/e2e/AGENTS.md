# Instructions for AI working on the e2e tests

Setup and philosophy is described in [README.md](README.md).

## Running

- Unattended runs can use the `pre_merge_ci` preset, which is headless and does not `pauseOnFailure`.
- e2e tests running concurrently locally, on other workstations, or on the CI use the same users, and delete each
  other's projects and users.
- A full run takes roughly half an hour.

## Write for what happens, not for what should happen

Reading the code and reasoning about what must be happening can result in confident and wrong understanding
of behaviour. Find out and prove what happens through experimentation. A scratch script that drives the real
servers settles these questions in a few minutes. Write code to handle a case once you have seen it.

## Scratch scripts

- Put throwaway scripts under this directory, not in `/tmp`, to avoid downloading a different Playwright.
- Import `e2e-globals.ts` before `e2e-utils.ts`. They are circular through `presets.ts`.
- `deno test` needs `--no-check` here, because Deno picks up the Angular `tsconfig.json`, which is not written for Deno.

## Logs

- A trace zip holds `trace.trace` (actions and console, JSONL) and `trace.network`.
- Tests that call `getNewBrowserForSideWork()` do their work in a second browser that is not traced, and on failure
  `e2e.mts` screenshots its own page, not the failing one.
- The Auth0 `sil-appbuilder` tenant produces logs.
