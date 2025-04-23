# Architecture Overview

This repository contains three interconnected applications:

1. Frontend (Angular) that runs in a browser, at src/SIL.XForge.Scripture/ClientApp
2. Backend (dotnet) that runs on a server, at src/SIL.XForge and src/SIL.XForge.Scripture
3. RealtimeServer (Node) that runs on a server, at src/RealtimeServer

# Key Architectural Patterns

- Data models must be defined in all 3 applications to stay in sync
- Frontend uses RealtimeService (ShareDB) for real-time data sync, which is defined at src/SIL.XForge.Scripture/ClientApp/src/xforge-common/realtime.service.ts
- Frontend also sometimes uses JSON-RPC to communicate with Backend.
- Frontend works offline and uses IndexedDB for storage.
- User permissions should be checked on both frontend and backend, using the rights service whenever possible, rather than checking the user role. See project-rights.ts, sf-project-rights.ts, and SFProjectRights.cs.

# Frontend Guidelines

- Use standalone Angular components with typed inputs/outputs
- Feature flags (feature-flag.service.ts) can control functionality rollout.
- Put UI strings in checking_en.json if ANY user might see them
- Only put strings in non_checking_en.json if community checkers will NEVER see them
- Use TranslocoModule for translations
- Prefix async calls that aren't awaited with 'void'
- Use explicit true/false/null/undefined rather than truthy/falsy
- Use `@if {}` syntax rather than `*ngIf` syntax.

# Data Layer Guidelines

- Define interfaces/models in all 3 applications
- Use RealtimeService for CRUD operations
- Follow existing patterns for validation schemas

# Testing Guidelines

- Write unit tests for new components and services
- Follow existing patterns for mocking dependencies
- Use TestEnvironment pattern from existing tests
- Test both online and offline scenarios
- Test permission boundaries

# Common Patterns to Follow

- Permission checking in services
- Error handling with ErrorReportingService
- Offline-first data access
- Type-safe data models

# File Organization

- Keep related files together in feature folders
- Follow existing naming conventions

DO NOT REMOVE COMMENTS ALREADY IN THE CODE. You can add to or edit existing comments, but do not removing the existing comments.
Do not insert new comments into the code where method calls already make it clear.
Do not add method comments unless the method would be unclear to an experienced developer.
Do put comments into the code to make it more clear what is going on if it would not be obvious to an experienced developer.
Do put comments into the code if the intent is not clear from the code.
All classes should have a comment to briefly explain why it is there and what its purpose is in the overall system, even if it seems obvious.
Please do not fail to add a comment to any classes that are created. All classes should have a comment.

Never rely on JavaScript's truthy or falsy. Instead, work with actual true, false, null, and undefined values, rather than relying on their interpretation as truthy or falsy. For example, if `someVariable` might be null, or undefined, or zero, don't write code like `if (someVariable)` or `const foo:string = someVariable ? 'a' : 'b'` or `if (count)`. Instead, inspect for the null, undefined, or zero rather than letting the value be interpreted as truthy for falsy. For example, use`if (someVariable == null)` or `const foo:string = someVariable != null 'a' : 'b'` or `if (count > 0)`.

Specify types where not obvious, such as when declaring variables and arguments, and for function return types.

If you do not have access to a file that you need, stop and ask me.

All code that you write should be able to pass eslint linting tests for TypeScript, or csharpier for C#.

Don't merely write code for the local context, but make changes that are good overall considering the architecture of the application and structure of the files and classes.

The frontend works offline, reading and writing data to and from IndexedDB using src/SIL.XForge.Scripture/ClientApp/src/xforge-common/realtime.service.ts. Do not modify realtime documents directly; instead, submit operations to the realtime documents. Realtime document data is automatically kept up to date with the data on the server when the frontend has an Internet connection. Most of data reading and writing from the frontend should happen by reading Realtime documents and submitting ops to Realtime documents to write to them, with occasional usage of JSON-RPC, such as seen on the C# backend at src/SIL.XForge.Scripture/Controllers/SFProjectsRpcController.cs.

Data models are defined in each of the 3 applications, and should stay in sync.

Localizations that a Community Checker user might see should be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/checking_en.json. Only localizations that a Community Checker user will not see can be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/non_checking_en.json.
Even if something is a system-wide feature that isn't specific to community checking functionality, it should still be placed in checking_en.json if a community checking user would POSSIBLY see it.
