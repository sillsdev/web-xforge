# Code review guidelines (mostly intended for AI agents, but also relevant for human reviewers)

## Naming things

- Pay particular attention to how accurate and precise the names of methods, variables, and other named entities are. Suggest better names when you see opportunities for improvement. Good names are very important for code readability and maintainability.

## Updates to localization files

- Front-end strings that can be seen by community checkers should be put in `checking_en.json`, even if non community checkers might see them.
- Front-end strings that can never be seen by community checkers should be put in `non_checking_en.json`.
- New strings only need to be added to the English localization files. A separate process will update the translation files, and fallback to English will be used in the meantime. Unnecessary changes should be avoided.
- Updates to strings while keeping the same localization key are allowed, but significant changes to a string should use a new key, otherwise existing translations will continue to show the old string.
- Strings that use variables should not be changed to different variables, otherwise errors will occur when the existing translations use the old variables. Instead, create a new localization key.

## Data Models

- Ensure data models are synchronized across all three portions of the application: Angular Frontend, C# Backend, and RealtimeServer.

## Testing

- Tests are not mandatory for all code changes, but are mandatory for data migrations.
