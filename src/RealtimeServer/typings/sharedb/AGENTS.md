# Declaring types for third-party code

A declaration in `typings/` should describe what the library does, not the minimum that
makes our code compile.

- Read the library's implementation and its call sites before writing the
  declaration. Say what you found.
- Use the named types already in those typings. Do not invent a structural type
  like `{ v: number }` for something that already has a name.
- Follow the conventions of the neighbouring declarations.
- Do not write `any`, mark a parameter optional, or add a union member unless you
  found the line that produces that case. "It might be null" is not a reason.
- Where the answer is a convention the library does not enforce, say so in a
  comment rather than widening the type.
