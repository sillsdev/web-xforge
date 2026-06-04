# Spec: Partial Book Drafting (SF-3817)

Allows users to train and/or draft specific chapters of a book, rather than whole books only.

---

## Overview

A new multi-step wizard (`NewDraftComponent`) replaces the existing `DraftGenerationStepsComponent` stepper for
configuring and launching AI drafts. The new wizard supports chapter-level selection for eligible books. The old
stepper is kept and continues to work; the new wizard is gated behind an experimental feature flag.

After the user clicks "Generate Draft" in `DraftGenerationComponent`, the feature flag determines which path is
taken:

- **Flag off (default):** existing behavior — show `DraftGenerationStepsComponent` inline
- **Flag on:** navigate to `/projects/:projectId/draft-generation/new-draft`

After a successful build launch, the wizard navigates back to `DraftGenerationComponent`.

---

## Feature Flag & Experimental Features

### Restore ExperimentalFeaturesService

The `ExperimentalFeaturesService` and `ExperimentalFeaturesDialogComponent` were built in commit
`151ad279c` and then removed before the PR merged. Restore them from that commit:

- `src/SIL.XForge.Scripture/ClientApp/src/xforge-common/experimental-features/experimental-features.service.ts`
- `src/SIL.XForge.Scripture/ClientApp/src/xforge-common/experimental-features/experimental-features-dialog.component.ts`
- `src/SIL.XForge.Scripture/ClientApp/src/xforge-common/experimental-features/experimental-features-dialog.component.html`
- `src/SIL.XForge.Scripture/ClientApp/src/xforge-common/experimental-features/experimental-features-dialog.component.scss`
- `src/SIL.XForge.Scripture/ClientApp/src/xforge-common/experimental-features/experimental-features-dialog.component.spec.ts`

Also restore any supporting changes from that commit (app.component, menu entry, i18n strings).

### Add the feature flag

Add a new `FeatureFlagFromStorage` entry to `FeatureFlagService` (next sequential ID after the current
highest):

```typescript
readonly partialBookDrafting: FeatureFlag = new FeatureFlagFromStorage(
  'PartialBookDrafting',
  'Partial book drafting',
  20,
  new StaticFeatureFlagStore(false)
);
```

### Register in ExperimentalFeaturesService

Add an entry to `experimentalFeatures` array in `ExperimentalFeaturesService`:

```typescript
{
  name: 'Draft specific chapters',
  description: 'Choose which chapters to draft, so that your existing translations of other chapters in the same book can be used to train the language model and improve draft quality.',
  available: () =>
    this.doesUserHaveRoleOnAnyProject(SFProjectRole.ParatextAdministrator) ||
    this.doesUserHaveRoleOnAnyProject(SFProjectRole.ParatextTranslator),
  featureFlag: this.featureFlagService.partialBookDrafting
}
```

The `available` check limits visibility to project administrators and translators, matching the roles that have access to the draft generation feature.

### Wire up the gate

Update `DraftGenerationComponent.generateDraftClicked()` to check the flag:

- If `featureFlags.partialBookDrafting.enabled`: navigate to `new-draft` route
- Else: set `currentPage = 'steps'` (existing behavior)

---

## Wizard Steps

### Pre-step: Pending Updates (blocking interstitial)

Shown **before** any wizard step if any project involved in drafting (drafting source, training sources, target)
has a pending Paratext update (`hasUpdate && isConnected`).

- Full-screen interstitial, replaces the wizard entirely until dismissed
- Lists each affected project with a sync button per project (links to `/projects/:projectId/sync`)
- Primary CTA: **"Sync projects with changes"** (or similar) — opens sync page
- Secondary CTA: **"Continue without syncing"** — dismisses the interstitial and proceeds to Step 1
- If no projects have pending updates, skip this step entirely

The pending-update check uses project data loaded during init. It is part of the init flow but displayed at the
component level, not inside `NewDraftLogicHandler`.

---

### Step 1: Source Project Setup

Displays the current draft source configuration by **embedding the existing `ConfirmSourcesComponent`**
directly. Do not re-implement its UI. `ConfirmSourcesComponent` reads from `ActivatedProjectService` and
`TrainingDataService` directly, so no inputs are needed.

The wizard template wraps the embedded component with the additional elements Step 1 requires:

**Contents (in order):**

- `<app-confirm-sources>` — the existing component showing drafting source, training sources, target, and
  training data files
- **Copyright banners** from all source projects — placed below the `ConfirmSourcesComponent`, near the
  navigation buttons (use the same `CopyrightBannerComponent` pattern)
- A link/button: **"Change source configuration"** — navigates to the configure-sources settings page (exits
  the wizard entirely), placed below the component

This step is **read-only**. No inline editing of source projects.

---

### Step 2: Books to Draft

User selects which books (and optionally chapters) to draft from the drafting source project.

**Book selection:**

- `BookMultiSelectComponent` showing books available in the drafting source (books with content, non-extra-material)
- Default selection on first visit: none selected

**Chapter range input (eligible books only):**

A book is eligible for partial chapter selection if:

1. The drafting source has ≥ 12 chapters with content (> 10% completion) for that book
2. The target project has ≥ 1 chapter with content for that book

For each eligible selected book, show beneath the book entry:

- Text input pre-populated with the **default chapter selection**
- Default: chapters present in source but NOT in target (i.e., untranslated chapters). If this set is empty
  (all source chapters are already in target), default to all source chapters.
- Hint text after the input showing available range (e.g., `Available: 1–28`)
- Inline validation error below the input for invalid input (e.g., `"Invalid chapter range: 5-3"`,
  `"Chapters 29-30 not available in source"`)
- Example format hint: `(e.g. 1-5, 8, 11-13)`

**State management:**

- On book selection change, call `NewDraftLogicHandler.selectDraftingBooks()`
- After `selectDraftingBooks()`, populate each eligible book's chapter input by reading
  `selectedDraftingScriptureRange$.getValue().books.get(bookId)?.toString()`. The logic handler sets the
  default chapter selection; the component reads it back as a string to display in the input.
- On chapter input blur/change, call `NewDraftLogicHandler.trySelectDraftingChapters()`. If it returns a
  string, display it as the validation error. If it returns `true`, clear the error.
- Non-eligible selected books have all their available source chapters included automatically (no input shown).

---

### Step 3: Training Data

User selects training data sources. Three sections:

**Section 1: Target project training books**

A book is shown in the training list if the target project has **at least one chapter with content that is not
being drafted**. Concretely: `availableTargetTrainingScriptureRange` (which is the target project's chapters
with content minus the selected drafting chapters) must have at least one chapter for that book.

This means a book being partially drafted can still appear here. Example: if the user drafts Luke 1–10 and
the target has Luke 11–28 with content, Luke appears in the training list with chapters 11–28 available. The
book is only excluded entirely if all of its available target chapters are being drafted.

- `BookMultiSelectComponent` driven by `availableTargetTrainingScriptureRange$`
- Chapter range input for eligible books:
  - Eligible if: the book was offered for partial drafting on Step 2 (i.e., meets the ≥12 source chapters AND
    ≥1 target chapter criteria) AND `availableTargetTrainingScriptureRange` has ≥1 chapter remaining for that
    book after removing drafted chapters
  - Default: all available (non-drafted) chapters of the book
  - Hint: `Available: <non-drafted chapters with content>`
- **NLLB notice:** If both the target language and the drafting source language are in the NLLB (detected via
  `NllbLanguageService.isNllbLanguageAsync()` on each project's `writingSystem.tag`), show an info banner at
  the top of this section explaining that training data is optional

**Section 2: Training source books (one per training source project)**

- One `BookMultiSelectComponent` per training source project, headed with the source project name
- Book-level only — no chapter range inputs
- Available books: books that exist in both the training source and the target's available training range
- Matches existing behavior from old stepper

**Section 3: Training data files**

- Read-only list of uploaded training data files (same as what `ConfirmSourcesComponent` shows today)

---

### Step 4: Confirm & Generate

Summary and launch.

**Contents:**

- Summary of selected draft books (with chapter ranges where applicable)
- Summary of selected training books
- Email notification toggle (`sendEmailOnBuildFinished`)
- Developer options section (visible only when `featureFlags.showDeveloperTools.enabled`):
  - Fast training toggle (`fastTraining`)
  - Use echo toggle (`useEcho`)
- **"Generate Draft"** primary button
  - Disabled when offline (show notice per existing behavior)
  - On click: assembles `BuildConfig`, calls `startBuildOrGetActiveBuild`, then navigates back to
    `DraftGenerationComponent`

Note: copyright banners are on **Step 1**, not Step 4.

---

## Error / Abort States

If `NewDraftLogicHandler` enters `status$ = 'abort'`, the wizard shows a blocking error screen:

- **`no_access`**: "The following projects could not be accessed: [project names]. Check that you have access
  and try again." + "Go back" button → navigates to `DraftGenerationComponent`
- **Multiple drafting sources** (`draftingSources.length !== 1`): The wizard requires exactly one drafting
  source. Show the abort screen with a message indicating the configuration is unsupported, and a "Go back"
  button. Do not attempt to continue or silently fall back.
- **Other init failures**: Generic error message + "Go back" button

---

## `NewDraftLogicHandler`

Stays narrowly focused on book/chapter selection state. Does **not** handle NLLB detection, copyright banners,
pending update checks, developer settings, or email toggles — those are handled at the component level.

**Rename:** `ProgressServiceThatGivesChapterLevelInfo` → `DraftProgressService` (or similar — the existing
name has a FIXME comment).

**Fix for training book persistence TODO:**

Currently, `loadPreviouslySelectedTrainingBooks()` estimates the target project's training book selection from
the source training book selections. This is incorrect.

Fix: include the **target project** as an entry in `BuildConfig.TrainingScriptureRanges` when submitting the
build, alongside source project entries. The backend ignores it (it filters sources by `s.IsSource`, and the
target project is registered as a target corpus, not a source — so this entry is safely ignored at the Serval
layer). But it **is** saved to `DraftConfig.LastSelectedTrainingScriptureRanges` by the backend
(`MachineApiService` line ~2741).

On restore, look up the target project's entry in `lastSelectedTrainingScriptureRanges` by project ID directly,
rather than estimating from source books.

---

## `BuildConfig` Assembly

When the user clicks "Generate Draft":

```
TranslationScriptureRanges:
  - { projectId: draftingSource.projectRef, scriptureRange: selectedDraftingScriptureRange.toString() }
    (chapter-level for the drafting source, e.g. "LUK1-13")

TrainingScriptureRanges:
  - One entry per training source project (book-level only):
    { projectId: source.projectRef, scriptureRange: selectedTrainingSourceBooks[source.projectRef].join(';') }
    e.g. "GEN;LUK"
  - One entry for the target project (chapter-level):
    { projectId: targetProjectId, scriptureRange: selectedTargetTrainingScriptureRange.toString() }
    e.g. "GEN;LUK1" — used both for persistence AND to drive the target training filter in the backend
    (see backend change below)

FastTraining, UseEcho, SendEmailOnBuildFinished: from Step 4 toggles
TrainingDataFiles: from the list of selected training data files
```

Scripture range string format: `"BOOKID[chapter-ranges];..."` — e.g. `"LUK1-13"`, `"GEN;LUK1"`.
`VerboseScriptureRange.toString()` already produces this format. For book-level training source entries,
produce the string as `bookIds.join(';')` (no chapter numbers), matching the existing stepper behavior.

---

## Backend Change: Explicit Target Training Filter

**File:** `src/SIL.XForge.Scripture/Services/MachineProjectService.cs`  
**Location:** `GetTranslationBuildConfig()`, around lines 1297–1325

Currently the method always sets `TargetFilters[j].ScriptureRange` to match `SourceFilters[j].ScriptureRange`.
Change this so that if the target project has an explicit entry in `buildConfig.TrainingScriptureRanges`, that
range is used for the target filter instead.

Pseudocode:

```csharp
// After building TargetFilters, set their ScriptureRange:
// - If the target project has an explicit entry in buildConfig.TrainingScriptureRanges, use it.
// - Otherwise, fall back to copying from the matching source filter (existing behavior).

string? explicitTargetRange = buildConfig.TrainingScriptureRanges
    .FirstOrDefault(t => t.ProjectId == targetProjectId)
    ?.ScriptureRange;

if (explicitTargetRange != null)
{
    foreach (var targetFilter in trainingCorpusConfig.TargetFilters)
        targetFilter.ScriptureRange = explicitTargetRange;
}
else
{
    // existing copy-from-source logic (lines 1311-1351)
}
```

This change is additive: builds that don't include a target project entry in `TrainingScriptureRanges`
(i.e., all existing builds) continue to behave exactly as before.

---

## Changes to Existing Components

### `DraftGenerationComponent`

- Update `generateDraftClicked()` to check `featureFlags.partialBookDrafting.enabled` before deciding old vs. new
  path
- Keep `currentPage = 'steps'` path and `DraftGenerationStepsComponent` intact

### `DraftGenerationStepsComponent`

- **No changes** — kept as-is for the flag-off path

### `app.routes.ts`

- Route for `new-draft` is already registered

---

## Remaining Tasks Checklist

### Infrastructure

- [x] Restore `ExperimentalFeaturesService` and `ExperimentalFeaturesDialogComponent` from commit `151ad279c` (including app.component wiring, menu entry, i18n strings)
- [x] Add `partialBookDrafting` feature flag to `FeatureFlagService`
- [x] Register `partialBookDrafting` in `ExperimentalFeaturesService.experimentalFeatures`
- [x] Update `DraftGenerationComponent.generateDraftClicked()` to check the feature flag

### Pre-step: Pending Updates

- [ ] Detect pending updates during init (check `hasUpdate && isConnected` for all involved projects)
- [ ] Build pending-update interstitial UI with per-project sync links and "Continue without syncing" option

### Step 1: Source Setup

- [x] Wire up `ConfirmSourcesComponent` (or equivalent) as Step 1
- [x] Add copyright banners to Step 1
- [ ] Add "Change source configuration" link that exits the wizard

### Step 2: Books to Draft

- [x] Wire up `BookMultiSelectComponent` to `NewDraftLogicHandler.selectDraftingBooks()`
- [x] Add chapter range text inputs for eligible books (currently in HTML but not wired up)
- [x] Wire chapter input change/blur events to `trySelectDraftingChapters()`
- [x] Show inline validation errors from `trySelectDraftingChapters()`
- [x] Show available chapter hint after each input
- [x] Pre-populate inputs with default chapter selection on book selection

### Step 3: Training Data

- [x] Wire up target training `BookMultiSelectComponent` to `NewDraftLogicHandler.selectTargetTrainingBooks()`
- [x] Add chapter range inputs for eligible target training books
- [x] Wire chapter input events to the equivalent of `trySelectDraftingChapters` for training
- [x] Add per-training-source `BookMultiSelectComponent` sections
- [x] Wire training source book selections to `NewDraftLogicHandler.selectedTrainingSourceBooks$`
- [ ] Add NLLB info banner (conditional on both language tags being in NLLB)
- [ ] Add training data files read-only section

### Step 4: Confirm & Generate

- [x] Build summary display of selected draft and training books
- [x] Add email notification toggle
- [x] Add developer options section (fast training, use echo) gated on `showDeveloperTools`
- [x] Implement `generateDraftClicked()` — assemble `BuildConfig` and call backend
- [x] Handle offline state (disable generate button, show notice)
- [x] Navigate back to `DraftGenerationComponent` after successful build launch

### Backend

- [ ] `MachineProjectService.GetTranslationBuildConfig()`: use explicit target project entry from
      `buildConfig.TrainingScriptureRanges` for target training filter when present, rather than always
      copying from source filter (see "Backend Change" section above)
- [ ] Add/update backend tests for this behavior

### Logic Handler & Data

- [ ] Rename `ProgressServiceThatGivesChapterLevelInfo` to an appropriate name
- [ ] Fix `loadPreviouslySelectedTrainingBooks()`: look up the target project entry in
      `lastSelectedTrainingScriptureRanges` by project ID, extract the book IDs (ignoring any chapter
      detail), then call the normal book-selection logic to derive chapter defaults from current project
      state — the same path as when the user manually picks books
- [x] Remove stray `console.log` statements from `NewDraftLogicHandler`
- [ ] Resolve FIXME: `isBookEligibleForPartialDrafting` source chapter count uses chapters-with-content
      (confirmed correct — remove the TODO/FIXME comment)
- [ ] Add multiple-drafting-source abort: if `draftingSources.length !== 1`, trigger abort screen with an unsupported-configuration message (do not silently continue)

### Error Handling

- [ ] Implement abort screen for `no_access` state (show inaccessible project names)
- [ ] Implement abort screen for general init failure
- [ ] Handle mid-flow project config changes (currently has a TODO for this)

### Tests

- [x] Unit tests for `NewDraftLogicHandler` (chapter selection, eligibility, training limits)
- [x] Unit tests for `NewDraftComponent` (step navigation, form state, error display)
- [ ] Unit tests for `scripture-range.ts` (VerboseScriptureRange, ChapterSet)
- [ ] Update/fix existing tests marked with FIXME/DO_NOT_MERGE

### Work that still needs to be defined

- [ ] Indicate what step we're on
- [ ] Take an inventory of notices in the old draft stepper and make sure we aren't dropping anything relevant
- [ ] Do a feature parity review between the old stepper and the new design to ensure all existing features are accounted for in the new design
- [ ] Do a UX review
- [ ] Check for wording consitency across all new UI elements, and consistency with existing draft generation UI and help
- [ ] Define manual tests for test team
- [ ] E2E tests for the new drafting flow
