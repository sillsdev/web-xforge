---
level: error
---

# Bare when

`when(something)` is is incomplete; it should be like `when(something).then(somethingElse)`

```grit
`when($_);`
```

## When example

```ts
when(something);
```

```ts
when(something);
```

## When negative example

```ts
when(something).then(somethingElse);
```
