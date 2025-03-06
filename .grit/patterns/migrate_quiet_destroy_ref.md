---
tags: [archived_migration]
---

# Migrate `DestroyRef` to `QuietDestroyRef`

- Replaces injection of `DestroyRef` with `QuietDestroyRef`
- Ensures the import of `QuietDestroyRef` from `'xforge-common/utils'`

This migration will probably not be useful into the future, but is checked in to document how the migration was done,
and as a reference for future migrations. It's conceivable that a similar migration might be done in the future.

```grit
language js

pattern ensureQuietDestroyRefImport() {
  `destroyRef: $class` where {
    $class <: `QuietDestroyRef`,
    $source = `'xforge-common/utils'`,
    $class <: ensure_import_from($source)
  }
}

pattern changeClass() {
  `$anything: $class` where {
    $class <: `DestroyRef`,
    $class => `QuietDestroyRef`
  }
}

sequential {
  bubble file($body) where $body <: contains changeClass(),
  bubble file($body) where $body <: contains ensureQuietDestroyRefImport()
}
```

## Example

Before

```typescript
import { DestroyRef, Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SFUserProjectsService } from "xforge-common/user-projects.service";
import { ParatextProject } from "../../../../core/models/paratext-project";
import { ParatextService, SelectableProject } from "../../../../core/paratext.service";

@Injectable({
  providedIn: "root"
})
export class EditorTabAddResourceDialogService {
  // Cache values until page refresh
  private projects?: ParatextProject[];
  private resources?: SelectableProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly destroyRef: DestroyRef
  ) {
    this.userProjectsService.projectDocs$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async projects => {
      if (projects == null) return;
      this.projects = await this.paratextService.getProjects();
    });
  }

  async getProjects(): Promise<ParatextProject[] | undefined> {
    if (!this.projects) {
      this.projects = await this.paratextService.getProjects();
    }
    return this.projects;
  }

  async getResources(): Promise<SelectableProject[] | undefined> {
    if (!this.resources) {
      this.resources = await this.paratextService.getResources();
    }
    return this.resources;
  }
}
```

After

```typescript
import { DestroyRef, Injectable } from "@angular/core";
import { QuietDestroyRef } from "xforge-common/utils";

import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SFUserProjectsService } from "xforge-common/user-projects.service";
import { ParatextProject } from "../../../../core/models/paratext-project";
import { ParatextService, SelectableProject } from "../../../../core/paratext.service";

@Injectable({
  providedIn: "root"
})
export class EditorTabAddResourceDialogService {
  // Cache values until page refresh
  private projects?: ParatextProject[];
  private resources?: SelectableProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly destroyRef: QuietDestroyRef
  ) {
    this.userProjectsService.projectDocs$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async projects => {
      if (projects == null) return;
      this.projects = await this.paratextService.getProjects();
    });
  }

  async getProjects(): Promise<ParatextProject[] | undefined> {
    if (!this.projects) {
      this.projects = await this.paratextService.getProjects();
    }
    return this.projects;
  }

  async getResources(): Promise<SelectableProject[] | undefined> {
    if (!this.resources) {
      this.resources = await this.paratextService.getResources();
    }
    return this.resources;
  }
}
```
