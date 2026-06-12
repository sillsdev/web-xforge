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

### Pre-step: Pending Updates (in-place sync interstitial)

Shown **before** any wizard step if any project involved in drafting (drafting source, training sources, target)
has a pending Paratext update (`isConnected && hasUpdate`). The interstitial replaces the wizard entirely
(no step indicator / wizard chrome) until the user advances or continues. If no projects have pending updates,
skip this step entirely.

The goal: let the user **sync stale projects in place and proceed without leaving the wizard**, rather than
navigating away to the sync page and losing context.

#### Detection (one-shot, at init)

- `hasUpdate` is **not** on the realtime doc — it comes from `ParatextService.getProjects()` (HTTP). Reuse the
  exact filter the old stepper uses (`draft-generation-steps.component.ts:~397`): take all involved project IDs
  (drafting source, training sources, target), call `getProjects()`, keep those where
  `projectId != null && isConnected && hasUpdate`, map to `{ projectId, name, syncUrl }`.
- Non-connected projects are intentionally **out of scope** here (the old stepper notes they surface a warning on
  the primary generate-draft page). Only `isConnected && hasUpdate` qualifies.
- This check is part of the init flow but lives at the **component level** (`NewDraftComponent`), not in
  `NewDraftLogicHandler` (which stays focused on book/chapter selection).

#### Gating: soft block

The interstitial always offers **"Continue anyway"** (proceeds to Step 1 with un-synced data). Nothing is ever
hard-blocked.

#### Per-project rows

Each affected project is a row whose treatment depends on the user's permission and the live sync state. Sync
requires `Texts.Edit` (`SyncAuthGuard` / `project-router.guard.ts:~85`) — held only by **ParatextAdministrator**
and **ParatextTranslator**. The user is normally admin/translator on the **target** (so the target is always
syncable), but frequently has **no edit role on source/reference projects**.

| Row state       | Condition                                              | UI                                                                          |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Syncable**    | pending + user has `Texts.Edit` on it                  | `[ Sync ]` button → in-place progress → `✓`                                 |
| **Syncing**     | `sync.queuedCount > 0` (on entry or after trigger)     | live `SyncProgressComponent`, no button (don't re-trigger)                  |
| **Synced**      | `queuedCount === 0` after a sync, `lastSyncSuccessful` | `✓ Up to date`                                                              |
| **Sync failed** | `lastSyncSuccessful === false`                         | `⚠ Sync failed` + `[ Retry ]` (does not block)                             |
| **Can't sync**  | pending + no `Texts.Edit`                              | informational `⚠ Has changes — ask a project admin to sync`, **no action** |

Rows the user cannot sync are **informational only** — linking out would not help, since `SyncAuthGuard` blocks
the sync page for them too. They rely on "Continue anyway."

#### Actions

- **`[ Sync ]` (per row):** for a syncable row, hold its `SFProjectDoc` (`projectService.get(id)`), call
  `projectService.onlineSync(id)`, and watch `projectDoc.remoteChanges$` until `sync.queuedCount === 0`; then read
  `sync.lastSyncSuccessful` to resolve to `✓` or the failed state. (Mirror `SyncComponent.syncProject()` /
  `SyncProgressComponent`.)
- **`[ Sync all ]` (primary CTA):** fires `onlineSync` for **every syncable row** concurrently (each project has
  its own `queuedCount`). Hidden when there are zero syncable rows (all pending rows are can't-sync) — then only
  "Continue anyway" is shown.
- **`[ Continue anyway ]` (secondary CTA):** always present; advances to Step 1.

#### Auto-advance

When **every project is clear** — i.e. all syncable rows have reached `✓` _and_ no can't-sync rows remain —
auto-advance to Step 1 (after a brief "All synced ✓" beat so it isn't jarring). If any can't-sync row remains,
do **not** auto-advance; the user must explicitly "Continue anyway."

#### Edge cases

- **Offline:** detection itself needs the network (`getProjects()` is HTTP). If offline at init, **skip the
  pre-step** — Step 4's Generate is already offline-disabled, so no un-synced build slips through.
- **Precedence:** abort screens (`no_access`, multiple drafting sources, init failure) outrank the pre-step;
  the pre-step outranks Step 1. Order: **abort → pre-step → Step 1**.

#### Copy (draft — pending wording-consistency pass)

- Heading: "Sync before drafting" / "These projects have changes in Paratext"
- Body: explain that unsynced changes won't be reflected in the draft and may reduce draft quality.
- Use singular/plural variants based on row count.

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

- `BookMultiSelectComponent` showing the books offered for drafting (see "Which books are offered for drafting" below)
- Default selection on first visit: none selected

#### Which books are offered for drafting

`availableDraftingScriptureRange` (the books shown in the multi-select) is derived from the drafting source's
chapter-level progress. A book is offered for drafting only if **all** of the following hold:

1. **Canonical:** the book is not extra-material — `Canon.isExtraMaterial(bookNum)` is `false`. Front/back matter,
   glossaries, and other non-canonical books are never offered. (Legacy parity — the old stepper skips these at
   `draft-generation-steps.component.ts:288`.)
2. **Has source content:** the drafting source has at least one chapter with content — the existing
   `getProgressForProject` rule, where a chapter counts when > 10% of its verse segments are non-blank.
3. **Present in the target** — gated by `ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET` (see below).

##### `ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET`

A constant in `NewDraftLogicHandler`, default **`false`**.

- **`false` (current behavior — legacy parity):** a book is offered only if it also exists in the **target
  project's text list** (`projectDoc.data.texts` — book _membership_, not whether the target has _content_ for
  it). A book present in the source but absent from the target is excluded (this is legacy's
  `unusableTranslateTargetBooks` bucket). This is a **temporary UI limitation**, not a fundamental constraint: the
  current UI doesn't handle drafting a book that isn't already in the target. **SF-3822** is intended to lift this.
- **`true` (future behavior):** the target-membership requirement is dropped; any canonical book with source
  content is offered, regardless of whether it exists in the target.

The constant exists so we can change it to `true` once SF-3822 lands. It is implemented as the overridable static
`NewDraftLogicHandler.allowDraftingBooksNotInTarget` (defaulting to the constant) so tests can exercise **both**
values without editing the constant. Both branches are covered by tests now (see Tests) so changing the switch is
a one-line change with known-good behavior on each side.

> Note: target _membership_ (in `texts`) is intentionally distinct from target _content_
> (`targetProjectScriptureRange`, which is content-filtered to chapters > 10% complete). This gate uses
> membership, to match legacy. Target content is still used separately, for partial-chapter eligibility and
> chapter-range defaults.

##### Drafting book exclusions & notices

`NewDraftLogicHandler.computeOfferedDraftingBooks()` is the single place that decides which books are offered. It
considers the union of the books with content in the drafting source and the books in the target's text list, and
for every book that is **not** offered it records an `ExcludedDraftingBook { bookId, reason }` on
`excludedDraftingBooks$`. Reasons (`DraftingBookExclusionReason`), evaluated in this precedence:

1. **`non_canonical`** — `Canon.isExtraMaterial(bookId)`. **Tracked but never surfaced** — users don't expect
   front/back matter, glossaries, etc. to be draftable.
2. **`no_source_content`** — the drafting source has no content for a book the target contains. **Surfaced.**
3. **`not_in_target`** — the book has source content but isn't in the target's text list, and
   `allowDraftingBooksNotInTarget` is `false`. **Surfaced.** Goes away once the gate is flipped (SF-3822).

The component exposes `draftingExclusionNotices` (one entry per **surfaced** reason that has books), rendered as
`app-notice` info banners under the book multi-select on Step 2. Strings:
`new_draft.draft_books.excluded_no_source_content` / `excluded_not_in_target`.

The reason set is **not** assumed to be exhaustive — additional categories may be added (e.g. as the training-step
notices are built out, or if more drafting-source cases are identified). The model (track-all, surface-a-subset) is
designed to extend.

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
being drafted** AND the book exists in **at least one training source**. Concretely:
`availableTargetTrainingScriptureRange` (the target project's chapters with content, minus the selected drafting
chapters, restricted to books present in some training source) must have at least one chapter for that book.

This means a book being partially drafted can still appear here. Example: if the user drafts Luke 1–10 and
the target has Luke 11–28 with content, Luke appears in the training list with chapters 11–28 available. The
book is excluded entirely if all of its available target chapters are being drafted.

**Books with no matching training source:** a target book can only be trained on if a training source supplies the
matching book to pair it with, so target books absent from **every** training source are withheld from the list
(legacy's `unusableTrainingSourceBooks`). They are recorded on `NewDraftLogicHandler.targetTrainingBooksWithoutSource$`
(computed in `limitAvailableTrainingRangeBasedOnSelectedDraftingRange()`, since the source-membership limit lives
alongside the drafting-range limit) and surfaced as an info notice under the target training selector
(`new_draft.training_books.excluded_not_in_any_source`). There is always at least one training source, so this is
independent of NLLB training-optionality (which depends on language support, not source count).

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

- **Selectable** checkbox list of the project's uploaded training data files (the backend honors a per-build
  file selection via `BuildConfig.TrainingDataFiles`).
- **Default selection:** files used at the last build (and still present) start selected; newly added files
  start selected; files that were offered but deselected last time start deselected. Distinguishing newly
  added from deselected files requires knowing what was offered last time, so the build now records the
  available set:
  - `DraftConfig.lastAvailableTrainingDataFiles` (new, optional) — the files offered at the last build,
    persisted from `BuildConfig.availableTrainingDataFiles`. `null`/absent means a build predating this
    (legacy), distinct from an empty array (a build that recorded zero available files).
  - Default logic lives in the component-level pure helper `defaultSelectedTrainingDataFiles()`:
    `(lastSelected ∩ current) ∪ (current − lastAvailable)`. Legacy fallback (no `lastAvailable`): follow
    `lastSelected` if any, else select all.
- On generate, the wizard sends both the selected subset (`trainingDataFiles`) and the full offered set
  (`availableTrainingDataFiles`); the backend persists both.

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

## Legacy Parity: Notices, Auto-Selection, Validation & Empty States

A feature-parity review against `DraftGenerationStepsComponent` surfaced several behaviors the new wizard had
dropped or weakened. Two are intentionally **excluded** from this section:

- The source-content eligibility **threshold change** (legacy's whole-book "≥ 3 non-blank segments" floor vs. the
  new "≥ 1 chapter over 10% non-blank" rule) is an accepted, deliberate change and is not restored.
- The mid-flow **`config_changed`** "start over" dialog (declared but never triggered) is tracked separately and
  is out of scope here.

The items below are in scope.

### Auto-selection of training books (first visit)

On a project with **no previously saved training selection**, the legacy stepper pre-selects training books so a
first-time user isn't faced with an empty selection. We want to preserve that "sensible default on first visit"
behavior, plus the accompanying "books were automatically selected" notice.

We are **not** committing to legacy's exact criteria. Legacy used whole-book segment counts (> 10 non-blank
segments AND (≥ 99% translated OR ≤ 3 blank segments)) from `ProjectProgress`. The new flow tracks content only at
the **chapter level** (`getProgressForProject` keeps chapters > 10% non-blank and discards raw segment/blank
counts), so reusing legacy's thresholds verbatim would require a new data path the new flow doesn't currently
have.

- Define the criterion in terms of **data the new flow already exposes** (the existing chapter-level "has content"
  model), not a re-introduced whole-book segment count — unless we deliberately decide the finer heuristic is
  worth the extra data path.
- Apply only in the no-prior-selection case (the restore path, `loadPreviouslySelectedTrainingBooks`, handles
  saved selections; the two are mutually exclusive, matching legacy's `!hasPreviousTrainingRange` gate).
- Show the equivalent "books were automatically selected" notice on Step 3 when any book was auto-selected.
- **Open question:** the exact auto-selection rule, expressed via chapter-level data. To be decided.

### "Hidden / unusable books" notices

Legacy shows expandable "N books are hidden — show why" notices on the draft step and the training step,
explaining each category of excluded book:

- blank in the drafting source (`emptyTranslateSourceBooks`)
- present in the target but not the drafting source (`unusableTranslateSourceBooks`)
- present in a source but not the target (`unusableTranslateTargetBooks` / `unusableTrainingTargetBooks`)
- blank in / not enough data from the training source (`unusableTrainingSourceBooks`,
  `trainingBooksExcludingTranslatedWithoutEnoughData`)

The new wizard currently omits excluded books silently. We **do** want to explain why books are missing, but the
categories should be **re-derived from the new chapter-level model rather than ported 1:1** — some legacy
categories may no longer apply, and partial availability introduces new cases:

- Recompute the exclusion categories from the new gating rules (canonical, source content, target membership via
  `ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET`). A book excluded purely for being non-canonical probably should **not** be
  surfaced; a book excluded for "no source content" or "not in target" probably should.
- Account for **partial availability**: a book that is offered for only some chapters is not "hidden" and must not
  appear in these notices.
- **Open question:** confirm the final category list, and whether the draft step and training step need different
  messaging now that target training can include partially-drafted books.

### Custom Serval configuration notice

Legacy (`:309`, HTML `:341-345`): when the project has a custom Serval config
(`translateConfig.draftConfig.servalConfig != null`), the summary shows the `custom_configurations_apply` info
notice. New wizard: add the equivalent check and show the notice on Step 4. Mechanical port — no new logic.

### Per-book training-pair validation

Legacy requires that **every** selected target/translated training book has a matching selection in at least one
training source (`translatedBooksSelectedInTrainingSources`; blocks advancing with the error
`translated_book_selected_no_training_pair`). The new `hasTrainingBooksSelected` only checks that _some_ target
book and _some_ source book are selected, so manually deselecting a source book can leave an unpaired target book
that advances anyway.

- Restore per-book pairing validation as a forward-gate on the training step, with an equivalent error message.
- Interaction with auto-pairing: selecting a target book already auto-selects it in each source that has it
  (`onTargetTrainingBookSelect`), so an unpaired book only arises from a manual source deselection — the
  validation catches exactly that case.
- Skipped when training is optional (both languages in NLLB), consistent with the existing forward-gate.

### Empty-state messages

Legacy provides explicit empty/placeholder copy the new wizard is missing. Add messages for:

- **No books available to draft** (legacy `no_available_books`): the drafting source has no offerable books.
- **No target training books available** on Step 3 (e.g. everything available is being drafted).
- **Reference (training source) books not yet selectable** (legacy `training_books_will_appear`): shown per
  training source when no translated books are selected yet.
- **Loading** copy where the wizard currently shows a bare spinner.

(The summary's "no training data" empty state — `summary.no_training_books` — is already covered.)

### Training-data files on the summary (minor)

Legacy lists the training-data files on the summary step. The new wizard makes files explicitly selectable on
Step 3 and does not re-list them on the summary. **Decision:** acceptable to omit — recorded here so it isn't
re-flagged as a regression. Revisit only if reviewers want a "confirm what I selected" recap.

---

## Error / Abort States

If `NewDraftLogicHandler` enters `status$ = 'abort'`, the component (which races `status$` for `input` **or**
`abort`) handles it by mode:

- **`no_access`** (anticipated, explainable): blocking abort screen — "The following projects could not be
  accessed: [project names]. Check that you have access and try again." + "Go back" button → navigates to
  `DraftGenerationComponent`. The logic handler captures the names in `inaccessibleProjectNames`.
- **`init_failure`** (unanticipated/fatal — network errors, missing config, etc.): the retained error is handed
  to the app-wide `ErrorHandler` (standard error dialog + reporting) and the wizard navigates back to
  `DraftGenerationComponent`. No bespoke localized screen. (Rationale: the fire-and-forget `init()` rejection
  would otherwise reach nothing — there's no `unhandledrejection` wiring and Bugsnag runs with
  `autoDetectErrors: false` — and the component would hang on its loading spinner.)
- **Multiple drafting sources** (`draftingSources.length !== 1`): the UI never allows configuring more than one
  drafting source, so this is treated as an impossible state rather than a user-facing abort (no localized
  strings). `init()`'s defensive `throw` is caught by the same try/catch and surfaces via the `init_failure`
  path above (global error dialog + navigate back).

---

## `NewDraftLogicHandler`

Stays narrowly focused on book/chapter selection state. Does **not** handle NLLB detection, copyright banners,
pending update checks, developer settings, or email toggles — those are handled at the component level.

**Rename:** `ProgressServiceThatGivesChapterLevelInfo` → `DraftProgressService` (or similar — the existing
name has a FIXME comment).

**Fix for training book persistence TODO (DONE):**

Previously, `loadPreviouslySelectedTrainingBooks()` estimated the target project's training book selection from
the source training book selections, which is incorrect.

Fix (implemented): include the **target project** as an entry in `BuildConfig.TrainingScriptureRanges` when
submitting the build, alongside source project entries. The backend ignores it (it filters sources by
`s.IsSource`, and the target project is registered as a target corpus, not a source — so this entry is safely
ignored at the Serval layer). But it **is** saved to `DraftConfig.LastSelectedTrainingScriptureRanges` by the
backend (`MachineApiService` line ~2741).

On restore, `loadPreviouslySelectedTrainingBooks()` looks up the target project's entry in
`lastSelectedTrainingScriptureRanges` by project ID, extracts the book IDs (chapter detail ignored), and runs
them through the normal `selectTargetTrainingBooks()` path so chapter defaults are re-derived from current
project state. The target entry is excluded from source-book restoration. For backward compatibility, when no
target entry exists (older configs), the target selection is inferred from the union of the source training
ranges, as before.

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

- [x] Detect pending updates during init at component level: `getProjects()` filtered to involved IDs with
      `isConnected && hasUpdate` (reuse old stepper filter); skip entirely if offline or none pending
- [x] Build the in-place interstitial (outside wizard step chrome), with per-project rows
- [x] Per-row permission check (`Texts.Edit` via `SF_PROJECT_RIGHTS` / `SyncAuthGuard`) → syncable vs informational
- [x] Syncable rows: `[ Sync ]` triggers `onlineSync(id)`, embed/observe `SyncProgressComponent`, resolve to
      `✓` / `⚠ Sync failed` + `[ Retry ]` via `remoteChanges$` + `queuedCount`/`lastSyncSuccessful`
- [x] Can't-sync rows: informational "ask a project admin to sync", no action
- [x] `[ Sync all ]` primary CTA (syncable rows only; hidden when none syncable)
- [x] `[ Continue anyway ]` secondary CTA (soft block; always present)
- [x] Auto-advance to Step 1 when all projects clear (no syncing + no can't-sync rows remain)
- [x] Precedence: abort screens outrank pre-step; pre-step outranks Step 1
- [ ] Finalize copy (heading/body/CTA labels, singular/plural) in the wording-consistency pass

### Step 1: Source Setup

- [x] Wire up `ConfirmSourcesComponent` (or equivalent) as Step 1
- [x] Add copyright banners to Step 1
- [x] Add "Change source configuration" link that exits the wizard

### Step 2: Books to Draft

- [x] Wire up `BookMultiSelectComponent` to `NewDraftLogicHandler.selectDraftingBooks()`
- [x] Exclude extra-material (non-canonical) books from the offered drafting books (`Canon.isExtraMaterial`) —
      legacy parity. Implemented in `NewDraftLogicHandler.computeOfferedDraftingBooks()`, which also records _why_
      each excluded book was left out (see "Drafting book exclusions & notices" below).
- [x] Gate the target-membership requirement behind `ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET` (default `false`):
      when `false`, only books present in the target's text list are offered for drafting (legacy parity);
      when `true`, any canonical book with source content is offered. Implemented as the overridable static
      `NewDraftLogicHandler.allowDraftingBooksNotInTarget`. This restriction is temporary — SF-3822 is intended to
      lift it, at which point the constant can be changed to `true`.
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
- [x] Block advancing past draft books step until at least one book is selected
- [x] Block advancing past training books step until training books are selected (skipped when both languages are in NLLB)
- [x] Add training data files section — made **selectable** (not read-only): checkbox list with default
      selection from the last build, recording the available set (`lastAvailableTrainingDataFiles`) to tell
      newly added files from deselected ones. Backend persists selected + available sets.
- [x] Exclude extra-material (non-canonical) books from the training-step lists too (target training + training
      sources). Filtered in `NewDraftLogicHandler.init()` via the `withoutExtraMaterialBooks()` helper, applied to
      the target training range and each training-source range. Kept in the handler (the selection-policy layer)
      rather than in the `DraftProgressService` adapter, which stays a faithful content-range reporter. Training
      exclusions are not surfaced as notices (consistent with non-canonical drafting exclusions being silent); a
      training-step exclusion-notice design remains open if/when needed.

### Step 4: Confirm & Generate

- [x] Build summary display of selected draft and training books
- [x] Add email notification toggle
- [x] Add developer options section (fast training, use echo) gated on `showDeveloperTools`
- [x] Implement `generateDraftClicked()` — assemble `BuildConfig` and call backend
- [x] Handle offline state (disable generate button, show notice)
- [x] Navigate back to `DraftGenerationComponent` after successful build launch

### Backend

- [x] `MachineProjectService.GetTranslationBuildConfig()`: use explicit target project entry from
      `buildConfig.TrainingScriptureRanges` for target training filter when present, rather than always
      copying from source filter (see "Backend Change" section above)
- [x] Add/update backend tests for this behavior

### Logic Handler & Data

- [x] Rename `ProgressServiceThatGivesChapterLevelInfo` to an appropriate name
- [x] Fix `loadPreviouslySelectedTrainingBooks()`: look up the target project entry in
      `lastSelectedTrainingScriptureRanges` by project ID, extract the book IDs (ignoring any chapter
      detail), then call the normal book-selection logic to derive chapter defaults from current project
      state — the same path as when the user manually picks books. Backward compatible: older configs that
      never saved a target entry fall back to inferring the target selection from the union of the source
      training ranges (the previous behavior). The target entry is also excluded from source-book restoration.
- [x] Remove stray `console.log` statements from `NewDraftLogicHandler`
- [x] Resolve FIXME: `isBookEligibleForPartialDrafting` source chapter count uses chapters-with-content
      (confirmed correct — comment already removed)
- [x] ~~Add multiple-drafting-source abort~~ — DROPPED. The UI never allows more than one drafting source,
      so this is an impossible state; we don't want translators to localize strings for it. The existing
      defensive `throw` in `init()` (no localized strings) is kept and will surface via the generic
      init-failure path.

### Error Handling

- [x] Implement abort screen for `no_access` state (show inaccessible project names). `NewDraftLogicHandler`
      captures `inaccessibleProjectNames` and aborts with mode `no_access`; the component renders a blocking
      abort screen with a "Go back" button. Strings: `new_draft.abort.*`.
- [x] Handle general init failure. `init()` is wrapped in try/catch; any unanticipated failure aborts with mode
      `init_failure` and retains the error. The component routes it to the app-wide `ErrorHandler` (standard
      error dialog + report) and navigates back to draft-generation — no bespoke localized screen (only
      `no_access` gets one). This also fixes the previous behavior where an init throw left the wizard stuck on
      the loading spinner forever (the component now races `status$` for `input` **or** `abort`).
- [x] Handle mid-flow project config changes (currently has a TODO for this — `config_changed` mode is declared
      but not yet triggered)

### Tests

- [x] Unit tests for `NewDraftLogicHandler` (chapter selection, eligibility, training limits)
- [x] Unit tests for `NewDraftComponent` (step navigation, form state, error display)
- [x] Unit tests for `scripture-range.ts` (VerboseScriptureRange, ChapterSet)
- [x] Test that extra-material (non-canonical) books are never offered for drafting, even when the source
      reports content for them
- [x] Test both `ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET` paths: with `false`, a source book missing from the target's
      text list is **not** offered; with `true`, the same book **is** offered
- [x] Update/fix existing tests marked with FIXME/DO_NOT_MERGE

### Legacy parity follow-ups (from the parity review)

See "Legacy Parity: Notices, Auto-Selection, Validation & Empty States" for details.

- [x] Auto-select training books on first visit (no saved selection); show the "books were automatically
      selected" notice; resolve the open question on the chapter-level selection rule. **Resolved:** auto-selection is
      high-conviction because it persists to `lastSelectedTrainingScriptureRanges` and is reused for later builds — a
      false positive would silently degrade future drafts. A target book is auto-selected only if it (1) is offered for
      target training, (2) appears essentially fully translated, and (3) is **not** itself being drafted (a book whose
      translation is in progress is a lower-conviction case the user should opt into deliberately). The completeness
      check intentionally uses the **segment-level** signal (legacy's `nonBlank > 10 && (blank/total ≤ 1% || blank ≤
    3)`), not the chapter-level "has content" model — the chapter-level 10%-per-chapter bar can't distinguish a
      fully-translated book from one sitting uniformly at ~12%, and a sticky false positive is exactly what we're
      avoiding. This reintroduces the segment-level read the spec had deferred, which is the "deliberately decide the
      finer heuristic is worth the extra data path" case. The rule is extracted into the shared
      `bookAppearsCompleteForTrainingAutoSelection()` helper in `progress.service.ts`, called by both the legacy stepper
      and the new flow's `DraftProgressService.getCompleteBookIds()`, so the two stay in lockstep. Auto-selected target
      books are paired into every training source that contains them; the `new_draft.training_books.auto_selected`
      notice is shown and cleared once the user deselects every target training book.
- [~] Re-derive and surface "hidden / unusable book" notices from the new chapter-level gating (not a 1:1 port);
  decide the final category list. **Draft step done** (see "Drafting book exclusions & notices": surfaces
  `no_source_content` + `not_in_target`, silently drops `non_canonical`). **Training step partially done**: target
  books absent from every training source are withheld and surfaced (`excluded_not_in_any_source`, legacy's
  `unusableTrainingSourceBooks`); still TODO are the other training categories (e.g. training-source books not in
  the target — legacy's `unusableTrainingTargetBooks`) and locking the final category list across both steps.
- [x] Port the custom Serval config notice (`servalConfig != null`) to Step 4
- [x] Restore per-book training-pair validation as a training-step forward gate. Every selected target training book
      must be selected in at least one training source; otherwise advancing is blocked with
      `new_draft.no_training_pair_selected`. Since selecting a target book auto-selects it in each source that has it, and
      target books with no source are withheld entirely, this only triggers after a manual source deselection orphans a
      target book. **Not** skipped when training is NLLB-optional: an unpaired book is an inconsistent state (the user
      chose to train on a book their selection can't pair), distinct from the "select something" requirement that the
      optional case waives.
- [decided: no] Surface training-source books that aren't in the target (legacy's `unusableTrainingTargetBooks`).
  These are already silently excluded from the source selectors (`availableTrainingSourceBooks$` is intersected with
  the target's available training range), and users don't expect to train on books their target doesn't contain — a
  reference book the target lacks can't form a pair — so no notice is shown. (Contrast with target books missing a
  source, which _are_ surfaced, since users do expect to train on their own books.)
- [ ] Add empty-state messages: no draftable books, no target training books, "reference books will appear",
      and loading copy

### Work that still needs to be defined

- [ ] Indicate what step we're on
- [x] Take an inventory of notices in the old draft stepper and make sure we aren't dropping anything relevant —
      captured in "Legacy Parity: Notices, Auto-Selection, Validation & Empty States"; implementation tracked in
      the follow-ups above
- [x] Do a feature parity review between the old stepper and the new design — complete; findings captured in the
      "Legacy Parity…" section and the Step 2 book-draftability gates, with remaining work tracked above
- [ ] Do a UX review
- [ ] Check for wording consitency across all new UI elements, and consistency with existing draft generation UI and help
- [ ] Define manual tests for test team
- [ ] E2E tests for the new drafting flow
