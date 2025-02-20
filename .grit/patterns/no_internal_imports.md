---
level: error
---

# No internal imports (such as from rxjs/internal)

Imports should not be from directories marked as internal

```grit
language js

`import $anything from "$path"` where $path <: r".*/internal/.*"
```

## Basic example

```ts
import { Observable } from "rxjs/internal/Observable";
```

```ts
import { Observable } from "rxjs/internal/Observable";
```

## Negative example

```ts
import { Observable } from "rxjs";
```
