---
tags: [precommit]
level: warn
---

# Import from xforge-common, not from ../xforge-common

Imports from `xforge-common` should be absolute, not relative

```grit
language js

`import $thing from '$anywhere';` where {
  $anywhere <: r".*\.\./(xforge-common/.*)"($path) => `$path`
}
```

## Basic example

```ts
import { UICommonModule } from "../../xforge-common/ui-common.module";
```

```ts
import { UICommonModule } from "xforge-common/ui-common.module";
```
