---
level: error
---

# Missed opportunity to use nullish assignment

```grit
language js

`if ($expression == null) {
    $expression = $value;
}` => `$expression ??= $value;`
```
