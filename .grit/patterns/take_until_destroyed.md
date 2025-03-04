```grit
language js

pattern ensureDestroyRefImport() {
  `destroyRef: $class` where {
    $class <: `QuietDestroyRef`,
    $source = `'xforge-common/utils'`,
    $class <: ensure_import_from($source)
  }
}

pattern ensureTakeUntilDestroyedImport() {
  `$functionCall($_)` where {
    $functionCall <: `takeUntilDestroyed`,
    $source = `'@angular/core/rxjs-interop'`,
    $functionCall <: ensure_import_from($source)
  }
}

pattern mapSubscriptions() {
  `this.subscribe( $thing, $callback )` => `$thing.pipe(takeUntilDestroyed(this.destroyRef)).subscribe( $callback )`
}

pattern removeExtends() {
  maybe or {
      `class $className extends SubscriptionDisposable { $classBody }` => `class $className { $classBody }`,
      `class $className extends SubscriptionDisposable implements $interfaces { $classBody }` => `class $className implements $interfaces { $classBody }`
  }
}

pattern addProperty() {
  maybe `constructor( $args ){  $body }` => `constructor( $args, private destroyRef: QuietDestroyRef ){$body}` where {
    $body <: within classSubscriptionDisposable(),
    $args <: not contains `QuietDestroyRef`
  }
}

pattern removeSubscriptionDisposableImport() {
  maybe `import { SubscriptionDisposable } from $anywhere;` => .
}

pattern classSubscriptionDisposable() {
  or {
    `class $className extends SubscriptionDisposable { $classBody }`,
    `class $className extends SubscriptionDisposable implements $interfaces { $classBody }`,
    `class $className extends DataLoadingComponent { $classBody }`,
    `class $className extends DataLoadingComponent implements $interfaces { $classBody }`,
  }
}

pattern removeSuper() {
  maybe or { `super();`, `super.$method();` } as $super where {
    $super <: within classSubscriptionDisposable()
  } => .
}

sequential {
  bubble file($body) where $body <: contains removeSuper(),
  bubble file($body) where $body <: contains addProperty(),
  bubble file($body) where $body <: contains mapSubscriptions(),
  bubble file($body) where $body <: contains ensureTakeUntilDestroyedImport(),
  bubble file($body) where $body <: contains ensureDestroyRefImport(),
  bubble file($body) where $body <: contains removeSubscriptionDisposableImport(),
  bubble file($body) where $body <: contains removeExtends(),
}
```
