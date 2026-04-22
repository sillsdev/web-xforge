# Instructions for AI

This document contains information and instructions for AI.

## Architecture

See the software [architecture](doc/architecture.md) overview.

## Code rules

Follow all rules in [Code rules](doc/code-rules.md) and [Code rules for AI](doc/code-rules-ai.md).

## Code review

Instructions for what to look for when performing a code review can be found in [REVIEW.md](REVIEW.md).

## dev container

The software and a backing database can be run using the [dev container](.devcontainer).

## Running commands

- If you run frontend tests, run them in the `src/SIL.XForge.Scripture/ClientApp` directory with a command such as `npm run test:headless -- --watch=false --include '**/text.component.spec.ts' --include '**/settings.component.spec.ts'`
- If you need to run all frontend tests, you can run them in the `src/SIL.XForge.Scripture/ClientApp` directory with command `npm run test:headless -- --watch=false`
