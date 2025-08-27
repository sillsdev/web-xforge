---
level: error
---

# No misused mock patterns outside of mocks

`something.something(anything())` is wrong unless it's inside a `when` or `verify` call.

```grit
`$functionCall()` where $functionCall <: and {
  or {
    `anyOfClass`,
    `anyFunction`,
    `anyNumber`,
    `anyString`,
    `anything`
  },
  and {
    not within `when($_)`,
    not within `verify($_)`,
  }
}

```

## Positive example

```ts
console.log(anything());
```

```ts
console.log(anything());
```

## Negative example using when()

```ts
when(something.something(anything())).thenReturn(somethingElse);
```

## Negative example using verify()

```ts
verify(something.something(anything())).once();
```
