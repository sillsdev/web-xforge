---
tags: [archived_migration]
---

# Migrate from SubscriptionDisposable to takeUntilDestroyed

- Handles classes that directly extend `SubscriptionDisposable` and those that extend DataLoadingComponent
- maps from `this.subscribe(thing, callback)` to `thing.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(callback)`
- Removes `SubscriptionDisposable` or `DataLoadingComponent` from the class definition
- Adds the `destroyRef` property to the constructor
- Ensures the import of `takeUntilDestroyed` from `@angular/core/rxjs-interop` and `QuietDestroyRef` from `'xforge-common/utils'`
- Removes `super()` and `super.method()` calls
- Removes the import of `SubscriptionDisposable` from the file

This migration will probably not be useful in the future, but is checked in to document how the migration was done,
and as a reference for future migrations.

```grit
language js

pattern ensureDestroyRefImport() {
  `destroyRef: $class` where {
    $class <: `QuietDestroyRef`,
    $source = `'xforge-common/utils'`,
    $class <: ensure_import_from($source)
  }
}

pattern ensureTakeUntilDestroyedImport() {
  `$functionCall($_)` where {
    $functionCall <: `takeUntilDestroyed`,
    $source = `'@angular/core/rxjs-interop'`,
    $functionCall <: ensure_import_from($source)
  }
}

pattern mapSubscriptions() {
  or {
    `this.subscribe( $thing, $callback )` => `$thing.pipe(takeUntilDestroyed(this.destroyRef)).subscribe( $callback )`,
    `this.subscribe( $thing )` => `$thing.pipe(takeUntilDestroyed(this.destroyRef)).subscribe()`
  }
}

pattern removeExtends() {
  maybe or {
      `class $className extends SubscriptionDisposable { $classBody }` => `class $className { $classBody }`,
      `class $className extends SubscriptionDisposable implements $interfaces { $classBody }` => `class $className implements $interfaces { $classBody }`
  }
}

pattern addProperty() {
  maybe `constructor( $args ){  $body }` => `constructor( $args, private destroyRef: QuietDestroyRef ){$body}` where {
    $body <: within classSubscriptionDisposable(),
    $args <: not contains `QuietDestroyRef`
  }
}

pattern removeSubscriptionDisposableImport() {
  maybe `import { SubscriptionDisposable } from $anywhere;` => .
}

pattern classSubscriptionDisposable() {
  or {
    `class $className extends SubscriptionDisposable { $classBody }`,
    `class $className extends SubscriptionDisposable implements $interfaces { $classBody }`,
    `class $className extends DataLoadingComponent { $classBody }`,
    `class $className extends DataLoadingComponent implements $interfaces { $classBody }`,
  }
}

pattern removeSuper() {
  maybe or { `super();`, `super.$method();` } as $super where {
    $super <: within classSubscriptionDisposable()
  } => .
}

sequential {
  bubble file($body) where $body <: contains removeSuper(),
  bubble file($body) where $body <: contains addProperty(),
  bubble file($body) where $body <: contains mapSubscriptions(),
  bubble file($body) where $body <: contains ensureTakeUntilDestroyedImport(),
  bubble file($body) where $body <: contains ensureDestroyRefImport(),
  bubble file($body) where $body <: contains removeSubscriptionDisposableImport(),
  bubble file($body) where $body <: contains removeExtends(),
}
```

## Example

Before:

```typescript
import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import { SFProjectProfileDoc } from "../app/core/models/sf-project-profile-doc";
import { SFProjectService } from "../app/core/sf-project.service";
import { compareProjectsForSorting } from "../app/shared/utils";
import { environment } from "../environments/environment";
import { AuthService, LoginResult } from "./auth.service";
import { UserDoc } from "./models/user-doc";
import { SubscriptionDisposable } from "./subscription-disposable";
import { UserService } from "./user.service";

/** Service that maintains an up-to-date set of SF project docs that the current user has access to. */
@Injectable({
  providedIn: "root"
})
export class SFUserProjectsService extends SubscriptionDisposable {
  private projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  private _projectDocs$ = new BehaviorSubject<SFProjectProfileDoc[] | undefined>(undefined);

  constructor(
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly authService: AuthService
  ) {
    super();
    this.setup();
  }

  /** List of SF project docs the user is on. Or undefined if the information is not yet available. */
  get projectDocs$(): Observable<SFProjectProfileDoc[] | undefined> {
    return this._projectDocs$;
  }

  private async setup(): Promise<void> {
    this.subscribe(this.authService.loggedInState$, async (state: LoginResult) => {
      if (!state.loggedIn) {
        return;
      }
      const userDoc = await this.userService.getCurrentUser();
      this.updateProjectList(userDoc);
      this.subscribe(userDoc.remoteChanges$, () => this.updateProjectList(userDoc));
    });
  }

  /** Updates our provided set of SF project docs for the current user based on the userdoc's list of SF projects the
   * user is on. */
  private async updateProjectList(userDoc: UserDoc): Promise<void> {
    const currentProjectIds = userDoc.data!.sites[environment.siteId].projects;

    let removedProjectsCount = 0;
    for (const [id, projectDoc] of this.projectDocs) {
      if (!currentProjectIds.includes(id)) {
        removedProjectsCount++;
        projectDoc.dispose();
        this.projectDocs.delete(id);
      }
    }

    const docFetchPromises: Promise<SFProjectProfileDoc>[] = [];
    for (const id of currentProjectIds) {
      if (!this.projectDocs.has(id)) {
        docFetchPromises.push(this.projectService.getProfile(id));
      }
    }

    if (removedProjectsCount === 0 && docFetchPromises.length === 0) {
      if (currentProjectIds.length === 0) {
        // Provide an initial empty set of projects if the user has no projects.
        this._projectDocs$.next([]);
      }
      return;
    }

    for (const newProjectDoc of await Promise.all(docFetchPromises)) {
      this.projectDocs.set(newProjectDoc.id, newProjectDoc);
    }
    const projects = Array.from(this.projectDocs.values()).sort((a, b) =>
      a.data == null || b.data == null ? 0 : compareProjectsForSorting(a.data, b.data)
    );
    this._projectDocs$.next(projects);
  }
}
```

After:

```typescript
import { Injectable } from "@angular/core";
import { QuietDestroyRef } from "xforge-common/utils";

import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { BehaviorSubject, Observable } from "rxjs";
import { SFProjectProfileDoc } from "../app/core/models/sf-project-profile-doc";
import { SFProjectService } from "../app/core/sf-project.service";
import { compareProjectsForSorting } from "../app/shared/utils";
import { environment } from "../environments/environment";
import { AuthService, LoginResult } from "./auth.service";
import { UserDoc } from "./models/user-doc";
import { UserService } from "./user.service";

/** Service that maintains an up-to-date set of SF project docs that the current user has access to. */
@Injectable({
  providedIn: "root"
})
export class SFUserProjectsService {
  private projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  private _projectDocs$ = new BehaviorSubject<SFProjectProfileDoc[] | undefined>(undefined);

  constructor(
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly authService: AuthService,
    private destroyRef: QuietDestroyRef
  ) {
    this.setup();
  }

  /** List of SF project docs the user is on. Or undefined if the information is not yet available. */
  get projectDocs$(): Observable<SFProjectProfileDoc[] | undefined> {
    return this._projectDocs$;
  }

  private async setup(): Promise<void> {
    this.authService.loggedInState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (state: LoginResult) => {
      if (!state.loggedIn) {
        return;
      }
      const userDoc = await this.userService.getCurrentUser();
      this.updateProjectList(userDoc);
      userDoc.remoteChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateProjectList(userDoc));
    });
  }

  /** Updates our provided set of SF project docs for the current user based on the userdoc's list of SF projects the
   * user is on. */
  private async updateProjectList(userDoc: UserDoc): Promise<void> {
    const currentProjectIds = userDoc.data!.sites[environment.siteId].projects;

    let removedProjectsCount = 0;
    for (const [id, projectDoc] of this.projectDocs) {
      if (!currentProjectIds.includes(id)) {
        removedProjectsCount++;
        projectDoc.dispose();
        this.projectDocs.delete(id);
      }
    }

    const docFetchPromises: Promise<SFProjectProfileDoc>[] = [];
    for (const id of currentProjectIds) {
      if (!this.projectDocs.has(id)) {
        docFetchPromises.push(this.projectService.getProfile(id));
      }
    }

    if (removedProjectsCount === 0 && docFetchPromises.length === 0) {
      if (currentProjectIds.length === 0) {
        // Provide an initial empty set of projects if the user has no projects.
        this._projectDocs$.next([]);
      }
      return;
    }

    for (const newProjectDoc of await Promise.all(docFetchPromises)) {
      this.projectDocs.set(newProjectDoc.id, newProjectDoc);
    }
    const projects = Array.from(this.projectDocs.values()).sort((a, b) =>
      a.data == null || b.data == null ? 0 : compareProjectsForSorting(a.data, b.data)
    );
    this._projectDocs$.next(projects);
  }
}
```
