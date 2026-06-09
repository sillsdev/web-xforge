# Code rules for AI

This document describes code rules that AI should follow when writing code. The rules in this file should _not_ be used when reviewing human-written code.

Follow all rules in [code-rules.md](code-rules.md) in addition to the below.

## Frontend

- Follow MVVM design, where domain objects and business logic are in Models, templates represent information to the user in Views, and ViewModels transform and bridge data between Models and Views.
- Component templates should be in separate .html files, rather than specified inline in the component decorator.
- Component template stylesheets should be in separate .scss files, rather than specified inline in the component decorator.
- Avoid hard-coding colors in SCSS files when styling components. Instead, use existing CSS variables or create an Angular Material theme file and import it into src/SIL.XForge.Scripture/ClientApp/src/material-styles.scss

# Frontend styling

- Avoid making up and using hard-coded or new color values. Where feasible, use color values from [Material Design](https://material.angular.dev/guide/theming-your-components). For example, `--mat-sys-surface` and `--mat-sys-on-primary`. If you can't get close to what you want from Material Design colors, you can use a defined color in `_variables.scss` or `material-styles.scss`. Follow patterns in existing `_foo-theme.scss` files.

# Frontend user interface

- Use Sentence case for user interface elements, per Material Design. Do not use Title Case for user interface elements. For example, use "Project settings" rather than "Project Settings".

## Frontend testing

- Write unit tests for new components and services
- Do not put helper functions outside of TestEnvironment classes; helper functions or setup functions should be in the TestEnvironment class. For example, do not put a helper function, like `createRows()` as a top-level function in a .spec.ts file, or as a function in a `describe()` block. Instead, make the helper function as a method in the TestEnvironment class, like `TestEnvironment.createRows()`.
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
- Do not use the `!` non-null assertion operator. For example, do not write `foo!.baz()`. If you need to dereference `foo`, first prove to the type system that `foo` is not null either by using a type guard or checking for null. You may use the `!` non-null assertion operator in spec test files.
- Do not use the `as` type assertion operator. For example, do not write `const foo: SomeType = someValue as SomeType`. If you need to treat `someValue` as `SomeType`, first prove to the type system that `someValue` is of type `SomeType` such as by using a type guard. You may use the `as` type assertion operator in spec test files.
- Do not use object property shorthand when creating objects. For example, do not write `const obj = { foo, bar };`. Instead, write `const obj = { foo: foo, bar: bar };`.
- Do not reorder existing fields and methods to comply with this, but when creating new fields and methods in TypeScript classes, use this order:
  1. public static fields
  2. @Input, @Output, and @ViewChild fields
  3. public instance fields
  4. non-public static and instance fields
  5. constructor
  6. getters and setters
  7. ngOnInit
  8. public static and instance methods
  9. non-public static and instance methods
- If an object literal is intended to match a specific type, enforce the type at the point the object literal is created by using one of these patterns: (1) assign it to a typed variable (`const x: SomeType = { ... }`); (2) apply `satisfies` (`const x = { ... } satisfies SomeType`); or (3) return it from a function or callback with an explicit return type (without first assigning it to an untyped variable). This helps flag extra properties that are no longer in the intended type.

## Angular templates

- Use `@if {}` syntax rather than `*ngIf` syntax.

# C# language

- Do not use the `!` null-forgiving operator. Instead, check for null and cause a specific outcome if it is null, or make use of the `NotNullWhen` attribute. You may use the `!` null-forgiving operator in test files.

## Code

- All code that you write should be able to pass eslint linting tests for TypeScript, or csharpier for C#.
- It is better to write code that is verbose and understandable than terse and concise.
- It is better to explicitly check for and handle problems, or prevent problems from happening, than to assume problems will not happen.
- Corner-cases happen. They should be handled in code.
- Please don't change existing code without good justification. Existing code largely works and changing it will cause work for code review. Leave existing code as is when possible.
- Avoid magic numbers where not obvious. Use a named constant for the value instead, which can be defined right before usage.
- Don't write useless comments. For example, for field `translationEngineId`, comment "The translation engine ID." adds no additional information than the name of the field already says.

## Tests

- If a unit test is more than 20 lines long, then place a line with "// SUT" before the line that causes the code being tested to be exercised.
