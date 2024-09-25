## Commit message guidelines

For the first line (summary) of the commit message:

- Include the issue number at the beginning, when applicable
  - If it’s a followup change for an issue, use the format SF-1234b
  - Multiple issues can be listed if needed
- [Use imperative mood](https://cbea.ms/git-commit/#imperative) (i.e. start commit with a verb like “Fix”, not “Fixed”)
- Explain what what changed, not how it changed
  - The summary should explain what happens from a user's perspective, not what you did to fix a bug
- Contextualize the change, even at the cost of being less specific
  - It's more important to make clear the type of change (bug fix, feature), and what the impact is, than to be specific but miss the context.
  - A good example of this is `SF-2892 Fix error when Serval admin enables drafting (#2637)`. The summary doesn't have enough room to state what the error was, but makes clear what context it exists in. Further details can be included in the body of a commit message if needed.
- Hotfixes should should be prefixed with `hotfix: ` followed by the original summary

## Merging pull requests

- In nearly all cases, squash and merge should be used
- The commit message should end with the PR number in parentheses (in most situations GitHub does this by default)
- Clean up the commit message so any irrelevant information is removed (e.g. messages from fixup commits)
