# Remove non-null assertion

Removes all non-null assertions, without regard to whether they're needed or not. One use for this is to remove all
non-null assertions from certain files and then only add them back in where they're needed.

```grit
language js

non_null_expression() as $nonNullAssertion where {
  $nonNullAssertion <: contains or { member_expression(), identifier() } as $expression,
  $nonNullAssertion => $expression
}
```
