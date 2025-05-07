# Architecture Overview

This repository contains three interconnected applications:

1. Frontend (Angular) that runs in a browser, at src/SIL.XForge.Scripture/ClientApp
2. Backend (dotnet) that runs on a server, at src/SIL.XForge and src/SIL.XForge.Scripture
3. RealtimeServer (Node) that runs on a server, at src/RealtimeServer

# Data exchange between the three interconnected applications

- Data models must be defined in all 3 applications and stay in sync.
- An example Backend data model can be seen at src/SIL.XForge.Scripture/Models/SFProject.cs
- Frontend and RealtimeServer both use the same data model files. An example can be seen at src/RealtimeServer/scriptureforge/models/sf-project.ts
- Frontend uses src/SIL.XForge.Scripture/ClientApp/src/xforge-common/realtime.service.ts to read and write data. This Realtime document data is stored in IndexedDB and is also automatically kept up to date with the data in RealtimeServer when Frontend has an Internet connection. If Frontend is offline, it continues reading and writing realtime documents using realtime.service.ts, and later data is synced with RealtimeService when Frontend regains an Internet connection.
- Realtime documents should not be modified directly. Instead, submit ops to modify the realtime documents.
- RealtimeServer uses ShareDB to merge ops from multiple Frontend clients. Frontend clients synchronize with RealtimeServer and present a live view of the changes from other clients as they work.
- Frontend also uses JSON-RPC to communicate with Backend, such as seen on Backend at src/SIL.XForge.Scripture/Controllers/SFProjectsRpcController.cs.
- User permissions should be checked in all of Frontend, Backend, and RealtimeServer, using the rights service whenever possible, rather than checking the user role. See project-rights.ts, sf-project-rights.ts, and SFProjectRights.cs.
- Follow existing patterns for validation schemas.

# Frontend

- Most Frontend tasks should work on a mobile phone. In other words, on a device with a narrow and short screen.
- Most editing and reviewing tasks should work while offline. Changing some settings may require being online.
- Feature flags (feature-flag.service.ts) can control functionality rollout.
- Error handling with ErrorReportingService
- Keep related files together in feature folders
- Follow existing naming conventions

# Frontend localization

- Use TranslocoModule for translations
- Put UI strings in checking_en.json if ANY user might see them
- Only put strings in non_checking_en.json if community checkers will NEVER see them
- Localizations that a Community Checker user might see should be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/checking_en.json. Only localizations that a Community Checker user will not see can be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/non_checking_en.json.
- Even if something is a system-wide feature that isn't specific to community checking functionality, it should still be placed in checking_en.json if a community checking user would POSSIBLY see it.

# Testing

- Write unit tests for new components and services
- Follow existing patterns for mocking dependencies
- Use TestEnvironment pattern from existing tests
- Test both online and offline scenarios
- Test permission boundaries

# Code comments

- DO NOT REMOVE COMMENTS ALREADY IN THE CODE. You can add to or edit existing comments, but do not removing the existing comments.
- Do not insert new comments into the code where method calls already make it clear.
- Do not add method comments unless the method would be unclear to an experienced developer.
- Do put comments into the code to make it more clear what is going on if it would not be obvious to an experienced developer.
- Do put comments into the code if the intent is not clear from the code.
- All classes should have a comment to briefly explain why it is there and what its purpose is in the overall system, even if it seems obvious.
- Please do not fail to add a comment to any classes that are created. All classes should have a comment.

# TypeScript language

- Use explicit true/false/null/undefined rather than truthy/falsy
- Never rely on JavaScript's truthy or falsy. Instead, work with actual true, false, null, and undefined values, rather than relying on their interpretation as truthy or falsy. For example, if `count` might be null, or undefined, or zero, don't write code like `if (count)` or `const foo:string = someVariable ? 'a' : 'b'`. Instead, inspect for the null, undefined, or zero rather than letting the value be interpreted as truthy for falsy. For example, use`if (count == null)` or `const foo:string = someVariable != null 'a' : 'b'` or `if (count > 0)`.
- Specify types where not obvious, such as when declaring variables and arguments, and for function return types.
- Use `@if {}` syntax rather than `*ngIf` syntax.

# Code

- All code that you write should be able to pass eslint linting tests for TypeScript, or csharpier for C#.
- Don't merely write code for the local context, but make changes that are good overall considering the architecture of the application and structure of the files and classes.
