# Code rules for humans and AI

This document describes code rules that both humans and AI should follow.

## Data exchange between the three interconnected applications

For more information, see the [architecture](architecture.md) overview.

- Data models must be defined in all 3 applications and stay in sync.
- Realtime documents should not be modified directly. Instead, submit ops to modify the realtime documents.
- User permissions should be checked in all of Frontend, Backend, and RealtimeServer, using the rights service whenever possible, rather than checking the user role. See project-rights.ts, sf-project-rights.ts, and SFProjectRights.cs.
- Follow existing patterns for validation schemas.

## Frontend

- Most Frontend tasks should work on a mobile phone. In other words, on a device with a narrow and short screen.
- Most editing and reviewing tasks should work while offline. Although changing some settings may require being online; for example, making changes to a SFProjectDoc uses RPC calls.
- Keep related files together in feature folders
- Follow existing naming conventions

## Frontend localization

- Put UI strings in checking_en.json if ANY user might see them.
- Only put strings in non_checking_en.json if community checkers will NEVER see them.
- Localizations that a Community Checker user might see should be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/checking_en.json. Only localizations that a Community Checker user will not see can be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/non_checking_en.json.
- Even if something is a system-wide feature that isn't specific to community checking functionality, it should still be placed in checking_en.json if a community checking user would POSSIBLY see it.

## Frontend testing

- Follow existing patterns for mocking dependencies
- Use TestEnvironment pattern from existing tests. Use the TestEnvironment class pattern rather than using a `beforeEach`.

## Code comments

- All classes and interfaces should have a comment to briefly explain why it is there and what its purpose is in the overall system, even if it seems obvious.
- Please do not fail to add a comment to any classes or interfaces that are created. All classes and interfaces should have a comment.

## TypeScript language

- Observables (including subclasses such as Subject or BehaviorSubject) should have names that end with a `$`.

## Code

- Don't merely write code for the local context, but make changes that are good overall considering the architecture of the application and structure of the files and classes.

## Frontend code

- Pay attention to available types and type guards in src/SIL.XForge.Scripture/ClientApp/src/type-utils.ts.
