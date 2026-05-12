# Code review guidelines

This document describes what to look for when performing a code review. It is mostly intended for AI agents, but is also relevant for human reviewers.

## Architecture

Code should be reviewed in context of the software [architecture](doc/architecture.md) and the new code's place in it.

## Code rules

Code should follow the rules outlined in [Code rules](doc/code-rules.md).

## Naming things

- Pay particular attention to how accurate and precise the names of methods, variables, and other named entities are. Suggest better names when you see opportunities for improvement. Good names are very important for code readability and maintainability.

## Updates to localization files

- Front-end strings that can be seen by community checkers should be put in `checking_en.json`, even if non community checkers might see them.
- Front-end strings that can never be seen by community checkers should be put in `non_checking_en.json`.
- New strings only need to be added to the English localization files; other localization files shouldn't be updated.
- Localization files are updated from Crowdin by a script that opens a PR with the title "Update all translation files from Crowdin". When reviewing a PR with this title, pay particular attention to the variables and tags in the source string, and the translated string, to make sure they are correctly preserved from the source string.
- Updates to strings while keeping the same localization key are allowed, but significant changes to a string should use a new key, otherwise existing translations will continue to show the old string.
- Strings that use variables should not be changed to different variables, otherwise errors will occur when the existing translations use the old variables. Instead, create a new localization key.

## Data Models

- Ensure data models are synchronized across all three portions of the application: Angular Frontend, C# Backend, and RealtimeServer.

## Testing

- Tests are not mandatory for all code changes, but are mandatory for data migrations.
