# Architecture Overview

This repository contains three interconnected applications:

1. Frontend (Angular) that runs in a browser, at src/SIL.XForge.Scripture/ClientApp
2. Backend (dotnet) that runs on a server, at src/SIL.XForge and src/SIL.XForge.Scripture
3. RealtimeServer (Node) that runs on a server, at src/SIL.XForge/Realtime

# Key Architectural Patterns

- Data models must be defined in all 3 applications to stay in sync
- Frontend uses RealtimeService (ShareDB) for real-time data sync
- Frontend works offline by default using local storage
- Traditional REST endpoints are sometimes used
- Feature flags control functionality rollout
- User permissions checked on both frontend and backend

# Frontend Guidelines

- Use standalone Angular components with typed inputs/outputs
- Follow existing pattern for feature flags in feature-flag.service.ts
- Put UI strings in checking_en.json if ANY user might see them
- Only put strings in non_checking_en.json if community checkers will NEVER see them
- Use TranslocoModule for translations
- Prefix async calls that aren't awaited with 'void'
- Use explicit true/false/null/undefined rather than truthy/falsy

# Data Layer Guidelines

- Define interfaces/models in all 3 applications
- Use RealtimeService for CRUD operations
- Follow existing patterns for validation schemas
- Check permissions in both frontend and backend
- Use ShareDB queries for filtering data

# Testing Guidelines

- Write unit tests for new components and services
- Follow existing patterns for mocking dependencies
- Use TestEnvironment pattern from existing tests
- Test both online and offline scenarios
- Test permission boundaries

# Common Patterns to Follow

- Feature flags for new functionality
- Permission checking in services
- Error handling with ErrorReportingService
- Offline-first data access
- Type-safe data models

# File Organization

- Keep related files together in feature folders
- Follow existing naming conventions

# MongoDB Schema Validation Guidelines

- Use MongoDB BSON types in validation schemas ('bool' not 'boolean', etc)
- Follow existing patterns for indexes and validation rules
- Add validation schemas for new collections

# Realtime Server Guidelines

- Define migrations for schema changes in the appropriate service
- Follow existing patterns for DocService implementations
- Initialize collections with proper indexes and validation
- Test migrations with both empty and existing data
- Do not refer to collection names using string literals, but instead use FooDoc.COLLECTION.

# Migration Guidelines

- Add migrations for any schema changes
- Test migrations on both empty and populated databases
- Follow existing patterns in \*-migrations.ts files
- Consider data validation before and after migration
- Before writing a data migration, first look at the existing migrations in RealtimeServer, and understand how they are designed.

# Collection Management

- Define clear validation rules using MongoDB schemas
- Collection indexes are defined via DocService.indexPaths

# Type Safety Guidelines

- Use RealtimeDoc types for ShareDB documents

# Realtime Data Guidelines

- Clean up query subscriptions with dispose() when component is destroyed

# Service Guidelines

- Inject UserService for current user information rather than accessing through RealtimeService

Do not remove existing comments from code. You can add to existing comments, but do not removing the existing comments.
Do not insert new comments into the code where method calls already make it clear.
Do not add method comments unless the method would be unclear to an experienced developer.
Do put comments into the code to make it more clear what is going on if it would not be obvious to an experienced developer.
Do put comments into the code if the intent is not clear from the code.
All classes should have a comment to briefly explain why it is there and what its purpose is in the overall system, even if it seems obvious.
Please do not fail to add a comment to any classes that are created. All classes should have a comment.

Never rely on JavaScript's truthy or falsy. Instead, work with actual true, false, null, and undefined values, rather than relying on their interpretation as truthy or falsy.

Specify types where possible, such as when declaring variables and arguments, and for function return types.

If an async method is being called, but not awaited or returned, prefix the call with `void `.

If you do not have access to a file that you need, stop and ask me.

All code that you write should be able to pass eslint linting tests for TypeScript, or csharpier for C#.

Don't merely write code for the local context, but make changes that are good overall considering the architecture of the application and structure of the files and classes.

Our frontend works offline, reading and writing data to and from a local store using src/SIL.XForge.Scripture/ClientApp/src/xforge-common/realtime.service.ts. This data is automatically kept up to date with the data on the server when the frontend has an Internet connection. Most of data reading and writing from the frontend should happen in this way, with occasional usage of web RPC, such as seen on the C# backend at src/SIL.XForge.Scripture/Controllers/SFProjectsRpcController.cs.

Data models are defined in each of the 3 applications, and should stay in sync.

Localizations that a Community Checker user might see should be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/checking_en.json. Only localizations that a Community Checker user will not see can be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/non_checking_en.json.
Even if something is a system-wide feature that isn't specific to community checking functionality, it should still be placed in checking_en.json if a community checking user would POSSIBLY see it.
