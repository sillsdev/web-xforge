# Remove non-null assertion

Removes all non-null assertions, without regard to whether they're needed or not. One use for this is to remove all
non-null assertions from certain files and then only add them back in where they're needed.

```grit
function removeExclamation($expression) js {
  return $expression.text.slice(0, $expression.text.length - 1);
}

non_null_expression() as $thing where {
  $thing => removeExclamation($thing)
}
```
