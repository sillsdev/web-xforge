---
level: warn
---

# Then resolve instead of returning a promise

```grit
`$someMethod.thenReturn(Promise.resolve($resolution))` => `$someMethod.thenResolve($resolution)`
```

## Then resolve positive example

```ts
someMethod.thenReturn(Promise.resolve(someValue));
```

```ts
someMethod.thenResolve(someValue);
```

## Then resolve negative example

```ts
someMethod.thenReturn(someValue);
```
