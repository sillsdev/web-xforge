```grit
language js

pattern ensureQuietDestroyRefImport() {
  `destroyRef: $class` where {
    $class <: `QuietDestroyRef`,
    $source = `'xforge-common/utils'`,
    $class <: ensure_import_from($source)
  }
}

pattern changeClass() {
  `$anything: $class` where {
    $class <: `DestroyRef`,
    $class => `QuietDestroyRef`
  }
}

sequential {
  bubble file($body) where $body <: contains changeClass(),
  bubble file($body) where $body <: contains ensureQuietDestroyRefImport()
}
```
