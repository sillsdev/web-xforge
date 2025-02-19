---
level: warn
---

Imports can safely be made directly from `lodash-es` instead of `lodash-es/...`.

# Lodash import from main

```grit
language js

`import $value from "$path";` => `import { $value } from "lodash-es";` where {
  $path <: r"lodash-es/.*"
}
```

## Basic example

Before

```ts
import merge from "lodash-es/merge";
import { merge } from "lodash-es";
```

After

```ts
import { merge } from "lodash-es";
import { merge } from "lodash-es";
```
