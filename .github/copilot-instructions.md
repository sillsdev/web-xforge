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
- Follow MVVM design, where domain objects and business logic are in Models, templates represent information to the user in Views, and ViewModels transform and bridge data between Models and Views.
- Component templates should be in separate .html files, rather than specified inline in the component decorator.
- Component template stylesheets should be in separate .scss files, rather than specified inline in the component decorator.
- Avoid hard-coding colors in SCSS files when styling components. Instead, use existing CSS variables or create an Angular Material theme file and import it into src/SIL.XForge.Scripture/ClientApp/src/material-styles.scss

# Frontend localization

- Use TranslocoModule for translations
- Put UI strings in checking_en.json if ANY user might see them
- Only put strings in non_checking_en.json if community checkers will NEVER see them
- Localizations that a Community Checker user might see should be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/checking_en.json. Only localizations that a Community Checker user will not see can be created or edited in src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/non_checking_en.json.
- Even if something is a system-wide feature that isn't specific to community checking functionality, it should still be placed in checking_en.json if a community checking user would POSSIBLY see it.

# Frontend testing

- Write unit tests for new components and services
- Follow existing patterns for mocking dependencies
- Use TestEnvironment pattern from existing tests. Use the TestEnvironment class pattern rather than using a `beforeEach`. Do not put helper functions outside of TestEnvironment classes; helper functions or setup functions should be in the TestEnvironment class.
- Test both online and offline scenarios
- Test permission boundaries
- When a TestEnvironment class is being given many optional arguments, prefer using object destructuring with default values, and the argument type definition specified inline rather than as an interface. For example,
  ```typescript
  class TestEnvironment {
    constructor({
      someRequired,
      someOptional = 'abc',
    }: {
      someRequired: string;
      someOptional?: string;
    }) {
      ...
    }
  }
  ```
  Example using `= {}` when all items are optional:
  ```typescript
  class TestEnvironment {
    constructor({
      someOptional = 'abc',
    }: {
      someOptional?: string;
    } = {}) {
      ...
    }
  }
  ```

# Code comments

- DO NOT REMOVE COMMENTS ALREADY IN THE CODE. You can add to or edit existing comments, but do not removing the existing comments.
- Do not insert new comments into the code where method calls already make it clear.
- Do not add method comments unless the method would be unclear to an experienced developer.
- Do put comments into the code to make it more clear what is going on if it would not be obvious to an experienced developer.
- Do put comments into the code if the intent is not clear from the code.
- All classes and interfaces should have a comment to briefly explain why it is there and what its purpose is in the overall system, even if it seems obvious.
- Please do not fail to add a comment to any classes or interfaces that are created. All classes and interfaces should have a comment.

# TypeScript language

- Use explicit true/false/null/undefined rather than truthy/falsy
- Never rely on JavaScript's truthy or falsy. Instead, work with actual true, false, null, and undefined values, rather than relying on their interpretation as truthy or falsy. For example, if `count` might be null, or undefined, or zero, don't write code like `if (count)` or `const foo:string = someVariable ? 'a' : 'b'`. Instead, inspect for the null, undefined, or zero rather than letting the value be interpreted as truthy for falsy. For example, use `if (count == null)` or `const foo:string = someVariable != null 'a' : 'b'` or `if (count > 0)`.
- Specify types when declaring variables, arguments, and for function return types. For example, don't write
  `const projectId = this.determineProjectId();` or
  `const buildEvents = eventsSorted.filter(...);` or
  `const buildEvent = buildEvents[0];`. Instead, write
  `const projectId: string | undefined = this.determineProjectId();` and
  `const buildEvents: EventMetric[] = eventsSorted.filter(...);` and
  `const buildEvent: EventMetric | undefined = buildEvents[0];`.
- Use `@if {}` syntax rather than `*ngIf` syntax.
- Although interacting with existing code and APIs may necessitate the use of `null`, when writing new code, prefer using `undefined` rather than `null`.
- Fields that are of type Subject or BehaviorSubject should have names that end with a `$`.

# Code

- All code that you write should be able to pass eslint linting tests for TypeScript, or csharpier for C#.
- Don't merely write code for the local context, but make changes that are good overall considering the architecture of the application and structure of the files and classes.
- It is better to write code that is verbose and understandable than terse and concise.
- It is better to explicitly check for and handle problems, or prevent problems from happening, than to assume problems will not happen.
- Corner-cases happen. They should be handled in code.
- Please don't change existing code without good justification. Existing code largely works and changing it will cause work for code review. Leave existing code as is when possible.

# Frontend code

- Pay attention to available types and type guards in src/SIL.XForge.Scripture/ClientApp/src/type-utils.ts.

# Running commands

- If you run frontend tests, run them in the `src/SIL.XForge.Scripture/ClientApp` directory with a command such as `npm run test:headless -- --watch=false --include '**/text.component.spec.ts' --include '**/settings.component.spec.ts'`
- If you need to run all frontend tests, you can run them in the `src/SIL.XForge.Scripture/ClientApp` directory with command `npm run test:headless -- --watch=false`
