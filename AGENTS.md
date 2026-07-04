# Instructions for AI

This document contains information and instructions for AI.

## Architecture

See the software [architecture](doc/architecture.md) overview.

## Rules for writing code

When writing code, follow all rules in [Code rules](doc/code-rules.md) and [Code rules for AI](doc/code-rules-ai.md).

## Code review

Instructions for what to look for when performing a code review can be found in [REVIEW.md](REVIEW.md).

## dev container

The software and a backing database can be run using the [dev container](.devcontainer).

## Local mock services

External dependencies (Auth0, Paratext registry, Paratext send/receive archives, DBL resources)
can be replaced with local mocks: start [src/MockServices](src/MockServices) (`npm start`) and run
the backend with `SF_MOCK_SERVICES=true`. Log in without credentials by POSTing
`{"authId":"oauth2|paratext|mock-admin"}` to `http://localhost:5100/_control/next-login` and then
clicking Log In. Scenarios (projects, Paratext-side edits, failure injection) are scripted via
the control API — see [src/MockServices/README.md](src/MockServices/README.md). Test projects are
created and modified through real ParatextData via [src/ParatextProjectTool](src/ParatextProjectTool)
(create/commit ops and `import-project` for existing local Paratext project directories), so they
can be connected, synced, and edited on either the Paratext or Scripture Forge side. Serval runs
for real, locally, with its echo engine (`npm run serval` in src/MockServices), so pre-translation
draft generation also works end to end.

## Running commands

- If you run frontend tests, run them in the `src/SIL.XForge.Scripture/ClientApp` directory with a command such as `npm run test:headless -- --watch=false --include '**/text.component.spec.ts' --include '**/settings.component.spec.ts'`
- If you need to run all frontend tests, you can run them in the `src/SIL.XForge.Scripture/ClientApp` directory with command `npm run test:headless -- --watch=false`
- If you run backend dotnet tests, run them in the repository root directory with a command such as `dotnet test`.
