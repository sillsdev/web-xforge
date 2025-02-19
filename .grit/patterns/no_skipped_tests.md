---
level: error
---

# No skipped tests (no fdescribe or fit)

fit() and fdescribe() should not be checked into version control

```grit
language js

or {
  `fdescribe($test)` => `describe($test)`,
  `fit($test)` => `it($test)`
}
```

## Basic example

```ts
fdescribe("MyComponent", () => {
  fit("should do something", () => {});
});
```

```ts
describe("MyComponent", () => {
  it("should do something", () => {});
});
```
