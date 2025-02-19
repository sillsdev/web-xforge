This is a .txt file, not a .md file, so Grit won't try to treat it as a pattern

See https://docs.grit.io/guides/config for documentation

Run `grit list` to see available patterns, especially locally defined ones.

Run `grit check` to run patterns (appears to only run those with a defined level, like error or warn)

Run `grit apply <name of pattern>` to apply a pattern (name comes from the markdown file)

Run `grit patterns test` to verify the patterns are correct

The documentation on the linked page states:
If a subheading has a single code block, it represents a test case that should be matched by the pattern. You don't need
to provide a transformed example.

This appears to be incorrect; experimentally it represents a case that *should not* be matched by the pattern. Grit is
intended to migrate code, but you can also write patterns that merely match code without transforming it. This results
in writing a before/after block that is identical, which *looks like* it means nothing should happen, but in reality
appears to mean it should be matched but not transformed.
