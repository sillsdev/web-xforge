---
level: error
---

# Bare verify

`verify(something);` is incomplete; it should be like `verify(something).once();`

```grit
`verify($_);` where {
  $filename <: r".*\.spec\.ts$"
}
```

## Verify positive example

```ts
// @filename: some.spec.ts
verify(something);
```

```ts
// @filename: some.spec.ts
verify(something);
```

## Verify negative example

```ts
// @filename: some.spec.ts
verify(something).then(somethingElse);
```
