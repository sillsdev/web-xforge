```grit
language js

pattern migrateMethodCalls() {
  `this.$serviceName.$methodName($args)` as $methodCall where {
    $serviceName <: r"^projectService|realtimeService|userService$",
    $methodName <: r"^subscribe|getProfile|getUserConfig|getText|getNoteThread|getBiblicalTerm|get|getCurrentUser$",
    $methodCall <: within class_declaration($body, $name),
    if ($args <: .) {
      $methodCall => `this.$serviceName.$methodName(new DocSubscription("$name"))`
    } else {
      $methodCall => `this.$serviceName.$methodName($args, new DocSubscription("$name"))`
    }
  }
}

pattern addImports() {
  `new $importClass($_)` where {
    $importClass <: `DocSubscription`,
    $importSource = `'xforge-common/models/realtime-doc'`,
    $importClass <: ensure_import_from($importSource)
  }
}

sequential {
  bubble file($body) where $body <: contains migrateMethodCalls(),
  bubble file($body) where $body <: maybe contains addImports()
}
```
