---
level: error
---

# mat-error only inside mat-form-field

`mat-error` has no styles of its own; the rule that colors it comes from MatFormField's stylesheet,
which Angular only loads once a `mat-form-field` has been instantiated. A `mat-error` outside a
`mat-form-field` therefore renders in the default text color unless a form field happens to have
rendered earlier in the session. Use a plain element with `class="error-text"` instead (or
`class="offline-text"` for offline notices).

Note: Grit parses .html files as JSX, so this is a `js` pattern rather than an `html` one.

```grit
language js

`<mat-error $...>$...</mat-error>` as $error where {
  $error <: not within `<mat-form-field $...>$...</mat-form-field>`
}
```

## Bare mat-error is matched (but there is no single auto-fix; choose error-text or offline-text)

```html
<mat-card-actions>
  <mat-error>Failed to fetch projects</mat-error>
</mat-card-actions>
```

```html
<mat-card-actions>
  <mat-error>Failed to fetch projects</mat-error>
</mat-card-actions>
```

## mat-error inside mat-form-field is fine

```html
<mat-form-field>
  <input matInput type="text" />
  @if (control.hasError("required")) {
  <mat-error>Required</mat-error>
  }
</mat-form-field>
```
