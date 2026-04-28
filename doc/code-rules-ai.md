# Code rules for AI

This document describes code rules that AI should follow when writing code. The rules in this file should _not_ be used when reviewing human-written code.

Follow all rules in [code-rules.md](code-rules.md) in addition to the below.

## Frontend

- Follow MVVM design, where domain objects and business logic are in Models, templates represent information to the user in Views, and ViewModels transform and bridge data between Models and Views.
- Component templates should be in separate .html files, rather than specified inline in the component decorator.
- Component template stylesheets should be in separate .scss files, rather than specified inline in the component decorator.
- Avoid hard-coding colors in SCSS files when styling components. Instead, use existing CSS variables or create an Angular Material theme file and import it into src/SIL.XForge.Scripture/ClientApp/src/material-styles.scss

## Frontend testing

- Write unit tests for new components and services
- Do not put helper functions outside of TestEnvironment classes; helper functions or setup functions should be in the TestEnvironment class.
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

## Code comments

- Do not remove comments already in the code if they are still relevant.
- Do not insert new comments into the code where method calls already make it clear.
- Do not add method comments unless the method would be unclear to an experienced developer.
- Do put comments into the code to make it more clear, if the code would not be obvious to an experienced developer.
- Do put comments into the code if the intent is not clear from the code.
- Use good argument and variable names that explain themselves without needing a comment. Well named arguments or variables are better than unclearly named arguments or variables with a comment.

## TypeScript language

- When doing null checks, prefer using `== null` or `!= null` rather than writing `if (value)` or `if (!value)` to better express intent. If guarding for empty strings or other falsy values is necessary, prefer to explicitly check for those as well, such as `if (value == null || value === '')` rather than just `if (!value)`.
- Specify types when declaring variables, arguments, and for function return types, if it's not completely obvious. For example, don't write
  `const projectId = this.determineProjectId();` or
  `const buildEvents = eventsSorted.filter(...);` or
  `const buildEvent = buildEvents[0];`. Instead, write
  `const projectId: string | undefined = this.determineProjectId();` and
  `const buildEvents: EventMetric[] = eventsSorted.filter(...);` and
  `const buildEvent: EventMetric | undefined = buildEvents[0];`.
- Prefer to use `null` to express a deliberate absence of a value, and `undefined` to express a value that has not been set yet.

## Angular templates

- Use `@if {}` syntax rather than `*ngIf` syntax.

## Code

- All code that you write should be able to pass eslint linting tests for TypeScript, or csharpier for C#.
- It is better to write code that is verbose and understandable than terse and concise.
- It is better to explicitly check for and handle problems, or prevent problems from happening, than to assume problems will not happen.
- Corner-cases happen. They should be handled in code.
- Please don't change existing code without good justification. Existing code largely works and changing it will cause work for code review. Leave existing code as is when possible.

## Tests

- If a unit test is more than 20 lines long, then place a line with "// SUT" before the line that causes the code being tested to be exercised.
