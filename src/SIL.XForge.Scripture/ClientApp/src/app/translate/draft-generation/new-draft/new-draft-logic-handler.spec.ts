import { DestroyRef } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { chapterCounts } from '../../../shared/progress-service/progress.service';
import { DraftSource, DraftSourcesAsArrays } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import {
  ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET,
  DraftProgressService,
  ExcludedDraftingBook,
  NewDraftLogicHandler
} from './new-draft-logic-handler';
import { VerboseScriptureRange } from './scripture-range';

const mockDestroyRef = { onDestroy: () => () => {}, destroyed: false } as unknown as DestroyRef;

function allBooksExcept(excludedBooks: string[]): string {
  return new VerboseScriptureRange(
    Canon.allBookIds
      .filter(book => Canon.isBookOTNT(Canon.bookIdToNumber(book)) && !excludedBooks.includes(book))
      .map(book => `${book}1-${chapterCounts[book]}`)
      .join(';')
  ).toString();
}

const FULL_CANON_SCRIPTURE_RANGE = allBooksExcept([]);

describe('NewDraftLogicHandler', () => {
  const teamStartingToTranslateGenesis = {
    lastSelectedTranslationScriptureRanges: [{ projectId: 'draft-source-1-id', scriptureRange: 'GEN' }],
    previouslySelectedTrainingScriptureRanges: [
      { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK;LUK;JHN' }
    ],
    draftingSourceBooksChapters: FULL_CANON_SCRIPTURE_RANGE,
    targetProjectBooksChapters: 'GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    trainingSourcesBooksChapters: {
      'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE
    }
  } as const satisfies TestState;

  const teamWithTwoTrainingSources = {
    lastSelectedTranslationScriptureRanges: undefined,
    previouslySelectedTrainingScriptureRanges: [
      { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK' },
      { projectId: 'training-source-2-id', scriptureRange: 'LUK;JHN' }
    ],
    draftingSourceBooksChapters: FULL_CANON_SCRIPTURE_RANGE,
    targetProjectBooksChapters: 'GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    trainingSourcesBooksChapters: {
      'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE,
      'training-source-2-id': FULL_CANON_SCRIPTURE_RANGE
    }
  } as const satisfies TestState;

  // The gate is shared static state; reset it after each test so a gate test doesn't leak into other specs.
  afterEach(() => {
    NewDraftLogicHandler.allowDraftingBooksNotInTarget = ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET;
  });

  describe('initialization', () => {
    it('aborts when a source project is inaccessible', async () => {
      const env = new TestEnvironment({ ...teamStartingToTranslateGenesis, noAccessSources: true });
      await env.waitForAbort();

      expect(env.logicHandler.status$.getValue()).toBe('abort');
      expect(env.logicHandler.abortMode).toBe('no_access');
    });

    it('aborts with config_changed when sources change after initialization', async () => {
      const sources$ = new BehaviorSubject<DraftSourcesAsArrays>({
        trainingSources: [],
        trainingTargets: [],
        draftingSources: [{ projectRef: 'draft-source-1-id' } as DraftSource]
      });
      const env = new TestEnvironment(teamStartingToTranslateGenesis, sources$);
      await env.waitForInit();

      sources$.next({
        trainingSources: [],
        trainingTargets: [],
        draftingSources: [{ projectRef: 'different-source-id' } as DraftSource]
      });

      expect(env.logicHandler.status$.getValue()).toBe('abort');
      expect(env.logicHandler.abortMode).toBe('config_changed');
    });

    it('does not abort when sources re-emit without changing', async () => {
      const initialSources: DraftSourcesAsArrays = {
        trainingSources: [],
        trainingTargets: [],
        draftingSources: [{ projectRef: 'draft-source-1-id' } as DraftSource]
      };
      const sources$ = new BehaviorSubject<DraftSourcesAsArrays>(initialSources);
      const env = new TestEnvironment(teamStartingToTranslateGenesis, sources$);
      await env.waitForInit();

      sources$.next({ ...initialSources });

      expect(env.logicHandler.status$.getValue()).toBe('input');
    });

    it('does not abort when a non-config field changes but the source set is unchanged', async () => {
      const sources$ = new BehaviorSubject<DraftSourcesAsArrays>({
        trainingSources: [],
        trainingTargets: [],
        draftingSources: [{ projectRef: 'draft-source-1-id', name: 'Original' } as DraftSource]
      });
      const env = new TestEnvironment(teamStartingToTranslateGenesis, sources$);
      await env.waitForInit();

      // Same project ref, but other fields (name, sync status, content) changed — e.g. after a sync. The configured
      // source set is unchanged, so this must not abort (content/sync changes are handled separately).
      sources$.next({
        trainingSources: [],
        trainingTargets: [],
        draftingSources: [{ projectRef: 'draft-source-1-id', name: 'Renamed' } as DraftSource]
      });

      expect(env.logicHandler.status$.getValue()).toBe('input');
    });

    it('initializes available ranges based on progress service', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Ranges availble for selection should be set automatically upon init
      expect(env.availableDraftingScriptureRange).toBe(testState.draftingSourceBooksChapters);
      expect(env.availableTargetTrainingScriptureRange).toBe(testState.targetProjectBooksChapters);

      // Selections should be blank
      expect(env.selectedDraftingScriptureRange).toBe('');
      expect(env.selectedTargetTrainingScriptureRange).toBe('');
    });
  });

  describe('books offered for drafting', () => {
    it('never offers extra-material (non-canonical) books, even when the source reports content for them', async () => {
      // The drafting source has content for the front matter and a glossary, alongside Genesis.
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        draftingSourceBooksChapters: 'FRT1;GEN1-50;GLO1'
      });
      await env.waitForInit();

      expect(env.availableDraftingScriptureRange).toBe('GEN1-50');
      // Non-canonical exclusions are tracked but not surfaced to the user.
      expect(env.excludedDraftingBooks).toEqual(
        jasmine.arrayWithExactContents([
          { bookId: 'FRT', reason: 'non_canonical' },
          { bookId: 'GLO', reason: 'non_canonical' }
        ])
      );
    });

    it('does not offer source books missing from the target when drafting books not in the target is disallowed', async () => {
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        allowDraftingBooksNotInTarget: false,
        draftingSourceBooksChapters: 'GEN1-50;EXO1-40;MAT1-28',
        targetTextBooks: ['GEN', 'MAT']
      });
      await env.waitForInit();

      // EXO has source content but isn't in the target's text list, so it isn't offered.
      expect(env.availableDraftingScriptureRange).toBe('GEN1-50;MAT1-28');
      expect(env.excludedDraftingBooks).toContain({ bookId: 'EXO', reason: 'not_in_target' });
    });

    it('offers source books missing from the target when drafting books not in the target is allowed', async () => {
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        allowDraftingBooksNotInTarget: true,
        draftingSourceBooksChapters: 'GEN1-50;EXO1-40;MAT1-28',
        targetTextBooks: ['GEN', 'MAT']
      });
      await env.waitForInit();

      // The same EXO book is now offered, since target membership is no longer required.
      expect(env.availableDraftingScriptureRange).toBe('GEN1-50;EXO1-40;MAT1-28');
      expect(env.excludedDraftingBooks).not.toContain({ bookId: 'EXO', reason: 'not_in_target' });
    });

    it('reports target books the drafting source has no content for', async () => {
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        allowDraftingBooksNotInTarget: false,
        draftingSourceBooksChapters: 'GEN1-50',
        targetTextBooks: ['GEN', 'EXO']
      });
      await env.waitForInit();

      // EXO is in the target but the drafting source has no text for it.
      expect(env.availableDraftingScriptureRange).toBe('GEN1-50');
      expect(env.excludedDraftingBooks).toContain({ bookId: 'EXO', reason: 'no_source_content' });
    });
  });

  describe('books offered for training', () => {
    it('excludes extra-material (non-canonical) books from the target and training-source lists', async () => {
      // The target and a training source both report content for a glossary (extra-material).
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        targetProjectBooksChapters: 'GEN1-5;GLO1;MAT1-28',
        trainingSourcesBooksChapters: {
          'training-source-1-id': 'GEN1-50;GLO1;MAT1-28'
        }
      });
      await env.waitForInit();

      // The glossary is offered neither as a target training book nor as a training-source book.
      expect(env.logicHandler.availableTargetTrainingScriptureRange$.getValue().books.has('GLO')).toBe(false);
      expect(env.logicHandler.trainingSourceBooks['training-source-1-id']).not.toContain('GLO');
    });

    it('excludes target books absent from every training source and tracks them for the notice', async () => {
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        targetProjectBooksChapters: 'GEN1-5;MAT1-28;LUK1-24',
        // The training source has Genesis and Matthew, but not Luke.
        trainingSourcesBooksChapters: { 'training-source-1-id': 'GEN1-50;MAT1-28' }
      });
      await env.waitForInit();
      env.logicHandler.setInputMode('training_books');

      const availableTargetTraining = env.logicHandler.availableTargetTrainingScriptureRange$.getValue();
      // Genesis and Matthew remain available; Luke is withheld because no training source contains it.
      expect(availableTargetTraining.books.has('GEN')).toBe(true);
      expect(availableTargetTraining.books.has('MAT')).toBe(true);
      expect(availableTargetTraining.books.has('LUK')).toBe(false);
      expect(env.logicHandler.targetTrainingBooksWithoutSource$.getValue()).toEqual(['LUK']);
    });
  });

  describe('selectDraftingBooks', () => {
    it('allows selecting books and chapters within the available ranges', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Select Genesis for drafting
      env.logicHandler.selectDraftingBooks(['GEN']);
      // Remaining undrafted chapters automatically selected
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
    });

    it('offers to draft a subset of chapters of a partially completed book and defaults to the remaining undrafted chapters', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
    });

    it('does not offer to draft a subset of chapters of a book that has not been started', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['EXO']);

      expect(env.selectedDraftingScriptureRange).toBe('EXO1-40');
      expect(env.booksOfferedForPartialDrafting).toEqual([]);
    });

    it('does not offer or silently apply partial drafting to a book that is not eligible for it', async () => {
      // Ruth has 4 source chapters (below the 12-chapter partial-drafting threshold) and the target already has
      // chapters 1-2. Ruth is therefore not eligible for partial drafting, so no chapter input is shown for it.
      // Selecting it must default to the whole book, not silently to just the untranslated chapters (which the user
      // would have no way to change back).
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        draftingSourceBooksChapters: 'GEN1-50;RUT1-4',
        targetProjectBooksChapters: 'GEN1-5;RUT1-2'
      });
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['RUT']);

      expect(env.booksOfferedForPartialDrafting).not.toContain('RUT');
      expect(env.selectedDraftingScriptureRange).toBe('RUT1-4');
    });

    it('offers to draft a subset of chapters of a book that has been completed and defaults to all chapters', async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        targetProjectBooksChapters: teamStartingToTranslateGenesis.targetProjectBooksChapters.replace(
          'GEN1-5',
          'GEN1-50'
        )
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-50');
    });

    it('allows selecting multiple books for drafting and only offers to draft subsets of books that have some progress', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects GEN and then EXO
      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.selectDraftingBooks(['GEN', 'EXO']);

      // User should be able to select both GEN and EXO for drafting, but only GEN should be offered for partial drafting since EXO has no progress
      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50;EXO1-40');
    });

    it('defaults to remaining undrafted chapters when re-selecting a book after visiting the training step', async () => {
      // Target has all 50 chapters of Genesis - nothing left to draft
      const testState = {
        ...teamStartingToTranslateGenesis,
        targetProjectBooksChapters: 'GEN1-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21'
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Selecting GEN defaults to all 50 chapters (source - target = 0 -> fallback to all)
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-50');

      // User manually narrows the selection to just GEN1-30
      env.logicHandler.selectDraftingChapters('GEN', '1-30');
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-30');

      // Visit training step - GEN1-30 is subtracted from the available target training range
      env.logicHandler.setInputMode('training_books');
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN31-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      env.logicHandler.setInputMode('draft_books');

      // Deselect then re-select GEN - default should be all 50 chapters since target has all of them
      env.logicHandler.selectDraftingBooks([]);
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-50');
    });
  });

  describe('selectDraftingChapters', () => {
    it('allows selecting which chapters in a book should be drafted when offering partial drafting of a book', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects GEN for drafting, which offers partial drafting since GEN1-5 is completed
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);

      // Expect the chapter range to be set by default to the chapters that are not completed
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      // User selects to draft a different range of chapters in GEN
      env.logicHandler.selectDraftingChapters('GEN', '7,20-50');
      expect(env.selectedDraftingScriptureRange).toBe('GEN7,20-50');
    });

    it('throws for an invalid chapter range string', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      expect(() => env.logicHandler.selectDraftingChapters('GEN', 'abc')).toThrow();
    });

    it('throws when selected chapters are outside the available source range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      // GEN only has 50 chapters in the source
      expect(() => env.logicHandler.selectDraftingChapters('GEN', '51-60')).toThrow();
    });

    it('throws when the book is not eligible for partial drafting', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      // EXO has no target progress, so partial drafting is not offered
      env.logicHandler.selectDraftingBooks(['EXO']);
      expect(env.booksOfferedForPartialDrafting).toEqual([]);

      expect(() => env.logicHandler.selectDraftingChapters('EXO', '1-10')).toThrow();
    });
  });

  describe('partial-training offering tracks the drafting selection', () => {
    // A book is only offered for partial target training while it is itself being drafted; otherwise the whole book
    // is available for training with no per-chapter restriction. This must still hold after the drafting selection
    // changes and the user returns to the training step — the offering can't be left over from the earlier selection.
    it('stops offering a book for partial target training once it is no longer being drafted', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      // Draft GEN (partial: source GEN1-50, target GEN1-5) and MAT, so deselecting GEN later still leaves a valid
      // drafting selection (the step can't be left with nothing selected).
      env.logicHandler.selectDraftingBooks(['GEN', 'MAT']);
      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN', 'MAT']);

      // On the training step, select GEN to train on — it is offered for partial target training.
      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['GEN']);
      expect(env.booksOfferedForPartialTargetTraining).toEqual(['GEN']);

      // Go back and drop GEN from the drafting selection (MAT remains, so the step is still valid).
      env.logicHandler.setInputMode('draft_books');
      env.logicHandler.selectDraftingBooks(['MAT']);
      expect(env.booksOfferedForPartialDrafting).toEqual(['MAT']);

      // Return to the training step. GEN is no longer being drafted, so it must no longer be offered for partial
      // target training.
      env.logicHandler.setInputMode('training_books');
      expect(env.booksOfferedForPartialTargetTraining).not.toContain('GEN');
    });
  });

  describe('training book selection', () => {
    it('defaults to previous training data when going to the training step', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Initially no training books selected
      expect(env.selectedTargetTrainingScriptureRange).toBe('');
      expect(env.selectedTrainingSourceBooks).toEqual({});

      // Previous training selections should be selected by default when going to the training step
      env.logicHandler.setInputMode('training_books');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MAT', 'MRK', 'LUK', 'JHN'] });
    });

    it('does not automatically select training data that was previously selected but is no longer available in the training sources', async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        trainingSourcesBooksChapters: {
          'training-source-1-id': allBooksExcept(['MAT'])
        }
      };
      expect(testState.trainingSourcesBooksChapters['training-source-1-id']).not.toContain('MAT');
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // The previously selected training data included MAT, but since that's now unavailable, it should not be selected
      expect(env.availableTrainingSourceBooks).toEqual({ 'training-source-1-id': ['GEN', 'MRK', 'LUK', 'JHN'] });
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
    });

    it('does not automatically select training data that was previously selected but is now selected to be drafted', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['MAT']);

      env.logicHandler.setInputMode('training_books');

      // The previously selected training data includes MAT, but since that's now selected as drafting material, it should
      // not be selected as training material
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
    });

    it('limits the selection of training data to what is available in the training sources and not selected for drafting', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects MAT for drafting, which should remove it from the available training data since it's not possible to both draft and train on the same material
      env.logicHandler.selectDraftingBooks(['MAT']);

      env.logicHandler.setInputMode('training_books');

      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });

      // Go back and select Genesis instead
      env.logicHandler.setInputMode('draft_books');
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
      env.logicHandler.setInputMode('training_books');

      // Now GEN should be removed from the available training data instead of MAT
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
    });

    it('reallows training data to be selected when it is deselected for drafting', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects GEN and MRK for drafting, which should remove both from the available training data since it's not possible to both draft and train on the same material
      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.selectDraftingBooks(['GEN', 'MRK']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50;MRK1-16');

      // Go to training step and see that MRK is not available for training
      env.logicHandler.setInputMode('training_books');
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MAT1-28;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MAT', 'LUK', 'JHN'] });

      // Go back and deselect MRK for drafting
      env.logicHandler.setInputMode('draft_books');
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      // Now MRK should be available again in the training data
      env.logicHandler.setInputMode('training_books');
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21');
    });

    it('restores previously selected books independently for each training source', async () => {
      const env = new TestEnvironment(teamWithTwoTrainingSources);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // Each source gets its own prior selection restored, with no cross-contamination
      expect(env.selectedTrainingSourceBooks).toEqual({
        'training-source-1-id': ['MAT', 'MRK'],
        'training-source-2-id': ['LUK', 'JHN']
      });
    });

    it("restores the target training selection from the target project's own saved entry, not from the training sources", async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK;LUK;JHN' },
          // The target project's own previously selected training books, looked up by project ID
          { projectId: 'testProjectId', scriptureRange: 'MAT;LUK' }
        ]
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // Target training comes from the target's own entry (MAT, LUK), not the union of the source books
      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;LUK1-24');
    });

    it('ignores chapter detail in the saved target entry and re-derives chapter defaults from current project state', async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT' },
          // Chapter detail (LUK1-5) should be ignored; chapters default to all available in the current target
          { projectId: 'testProjectId', scriptureRange: 'LUK1-5' }
        ]
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('LUK1-24');
    });

    it('infers the target training selection from the source training ranges when no saved target entry exists', async () => {
      // Older draft configs predate saving a target training entry, so the target selection must be inferred from the
      // union of the source training books.
      const testState = {
        ...teamStartingToTranslateGenesis,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK;LUK;JHN' }
          // No entry for the target project ('testProjectId')
        ]
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;MRK1-16;LUK1-24;JHN1-21');
    });

    it("does not treat the target project's own training entry as a training source", async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT' },
          { projectId: 'testProjectId', scriptureRange: 'MAT;LUK' }
        ]
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTrainingSourceBooks['testProjectId']).toBeUndefined();
    });

    it('a book selected for drafting is excluded from all training sources', async () => {
      const testState = {
        ...teamWithTwoTrainingSources,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK;LUK;JHN' },
          { projectId: 'training-source-2-id', scriptureRange: 'MAT;MRK;LUK;JHN' }
        ]
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['MAT']);
      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTrainingSourceBooks['training-source-1-id']).not.toContain('MAT');
      expect(env.selectedTrainingSourceBooks['training-source-2-id']).not.toContain('MAT');
    });

    it('filters a book from one source independently when it is absent from that source but present in another', async () => {
      const testState = {
        ...teamWithTwoTrainingSources,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT' },
          { projectId: 'training-source-2-id', scriptureRange: 'MAT' }
        ],
        trainingSourcesBooksChapters: {
          'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE,
          'training-source-2-id': allBooksExcept(['MAT'])
        }
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // Source 1 still has MAT available and selected; source 2 does not
      expect(env.availableTrainingSourceBooks['training-source-1-id']).toContain('MAT');
      expect(env.availableTrainingSourceBooks['training-source-2-id']).not.toContain('MAT');
      expect(env.selectedTrainingSourceBooks['training-source-1-id']).toContain('MAT');
      expect(env.selectedTrainingSourceBooks['training-source-2-id']).not.toContain('MAT');
    });
  });

  describe('auto-selecting training books on first visit', () => {
    // A team generating their first draft: no previously saved training selection, so training books are auto-selected.
    const teamWithNoPriorTrainingSelection = {
      ...teamStartingToTranslateGenesis,
      previouslySelectedTrainingScriptureRanges: undefined
    } as const satisfies TestState;

    it('pre-selects only books that appear complete, and pairs them in the training sources', async () => {
      const env = new TestEnvironment({
        ...teamWithNoPriorTrainingSelection,
        // MAT and MRK look complete; LUK and JHN do not (e.g. still in progress).
        completeTargetBooks: ['MAT', 'MRK']
      });
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;MRK1-16');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MAT', 'MRK'] });
      expect(env.trainingBooksWereAutoSelected).toBe(true);
    });

    it('never pre-selects a book that is being drafted, even when it appears complete', async () => {
      const env = new TestEnvironment({
        ...teamWithNoPriorTrainingSelection,
        completeTargetBooks: ['GEN', 'MAT']
      });
      await env.waitForInit();

      // Partially draft GEN (GEN6-50), leaving GEN1-5 available for training. GEN appears complete, but since the user
      // is drafting it, it is a lower-conviction case and must not be auto-selected. MAT is complete and not drafted.
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MAT'] });
      expect(env.trainingBooksWereAutoSelected).toBe(true);
    });

    it('selects nothing and shows no notice when no book appears complete', async () => {
      const env = new TestEnvironment({ ...teamWithNoPriorTrainingSelection, completeTargetBooks: [] });
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('');
      expect(env.trainingBooksWereAutoSelected).toBe(false);
    });

    it('pairs auto-selected books across every training source that contains them', async () => {
      const env = new TestEnvironment({
        ...teamWithTwoTrainingSources,
        previouslySelectedTrainingScriptureRanges: undefined,
        completeTargetBooks: ['MAT', 'LUK']
      });
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;LUK1-24');
      expect(env.selectedTrainingSourceBooks).toEqual({
        'training-source-1-id': ['MAT', 'LUK'],
        'training-source-2-id': ['MAT', 'LUK']
      });
      expect(env.trainingBooksWereAutoSelected).toBe(true);
    });

    it('does not auto-select when a previous training selection exists (restore takes precedence)', async () => {
      // teamStartingToTranslateGenesis has a saved selection (MAT;MRK;LUK;JHN); the complete-book set should be ignored.
      const env = new TestEnvironment({ ...teamStartingToTranslateGenesis, completeTargetBooks: ['GEN'] });
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      expect(env.trainingBooksWereAutoSelected).toBe(false);
    });

    it('clears the auto-selected notice once the user deselects every target training book', async () => {
      const env = new TestEnvironment({ ...teamWithNoPriorTrainingSelection, completeTargetBooks: ['MAT', 'MRK'] });
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');
      expect(env.trainingBooksWereAutoSelected).toBe(true);

      // Deselecting down to a non-empty selection keeps the review notice.
      env.logicHandler.selectTargetTrainingBooks(['MAT']);
      env.logicHandler.dismissAutoSelectNoticeIfSelectionEmpty();
      expect(env.trainingBooksWereAutoSelected).toBe(true);

      // Deselecting everything clears it.
      env.logicHandler.selectTargetTrainingBooks([]);
      env.logicHandler.dismissAutoSelectNoticeIfSelectionEmpty();
      expect(env.trainingBooksWereAutoSelected).toBe(false);
    });
  });

  describe('reload (after in-place sync)', () => {
    it('re-derives availability from freshly fetched progress', async () => {
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        draftingSourceBooksChapters: 'GEN1-50',
        targetProjectBooksChapters: 'GEN1-5',
        targetProjectBooksChaptersAfterReload: 'GEN1-10'
      });
      await env.waitForInit();
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5');

      await env.logicHandler.reload(['testProjectId']);

      // The post-sync target content is now reflected in what's available.
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-10');
    });

    it('defaults the draft to chapters still untranslated after the sync, not before', async () => {
      const env = new TestEnvironment({
        ...teamStartingToTranslateGenesis,
        draftingSourceBooksChapters: 'GEN1-50',
        targetProjectBooksChapters: 'GEN1-5',
        // The user synced their translation of GEN 6-10 in place.
        targetProjectBooksChaptersAfterReload: 'GEN1-10',
        trainingSourcesBooksChapters: { 'training-source-1-id': 'GEN1-50' }
      });
      await env.waitForInit();

      await env.logicHandler.reload(['testProjectId']);

      // Default = source - target. Pre-sync this would have been GEN6-50; with the synced chapters it must be GEN11-50,
      // so the chapters the user just translated aren't defaulted back into the draft.
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN11-50');
    });

    it('forces a fresh fetch only for the synced projects', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();
      resetCalls(mockedDraftProgressService);

      await env.logicHandler.reload(['testProjectId']); // only the target synced

      // Target (synced) is re-fetched with no staleness tolerance...
      verify(
        mockedDraftProgressService.getProgressForProject('testProjectId', deepEqual({ maxStalenessMs: 0 }))
      ).once();
      // ...while the unsynced drafting source uses the default staleness (served from cache by the real service).
      verify(mockedDraftProgressService.getProgressForProject('draft-source-1-id', deepEqual({}))).once();
      expect().nothing();
    });

    it('resets any selections the user had made', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).not.toBe('');

      await env.logicHandler.reload(['testProjectId']);

      expect(env.selectedDraftingScriptureRange).toBe('');
      expect(env.logicHandler.inputMode$.getValue()).toBe('draft_books');
    });
  });

  describe('selectTargetTrainingChapters', () => {
    it('updates the selected target training scripture range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']); // defaults to GEN6-50
      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['GEN']); // GEN1-5 available for training

      env.logicHandler.selectTargetTrainingChapters('GEN', '1-3');
      expect(env.selectedTargetTrainingScriptureRange).toBe('GEN1-3');
    });

    it('throws when called in draft_books mode', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);
      // still in draft_books mode
      expect(() => env.logicHandler.selectTargetTrainingChapters('GEN', '1-3')).toThrow();
    });

    it('throws when selected chapters are outside the available target training range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']); // GEN6-50 drafted
      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['GEN']); // only GEN1-5 available for training

      // GEN6 is being drafted, so it's not available for target training
      expect(() => env.logicHandler.selectTargetTrainingChapters('GEN', '1-10')).toThrow();
    });

    it('throws when the book is not eligible for partial target training', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.setInputMode('training_books');
      // MAT is available for training but was not offered for partial drafting
      env.logicHandler.selectTargetTrainingBooks(['MAT']);
      expect(env.booksOfferedForPartialTargetTraining).toEqual([]);

      expect(() => env.logicHandler.selectTargetTrainingChapters('MAT', '1-10')).toThrow();
    });
  });

  describe('selectTargetTrainingBooks', () => {
    it('updates the selected target training range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['MRK', 'LUK']);

      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24');
    });

    it('throws when called in draft_books mode', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      expect(() => env.logicHandler.selectTargetTrainingBooks(['MAT'])).toThrow();
    });

    it('offers partial target training for a book that was partially drafted with target chapters remaining', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      // GEN: source has 50 chapters (>= 12), target has GEN1-5 (>= 1) - eligible for partial drafting
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      env.logicHandler.setInputMode('training_books');
      // GEN1-5 remain available for target training since only GEN6-50 is being drafted
      env.logicHandler.selectTargetTrainingBooks(['GEN']);

      expect(env.booksOfferedForPartialTargetTraining).toEqual(['GEN']);
    });

    it('does not offer partial target training for books not offered for partial drafting', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.setInputMode('training_books');
      // MAT is available for target training but was not offered for partial drafting
      env.logicHandler.selectTargetTrainingBooks(['MAT']);

      expect(env.booksOfferedForPartialTargetTraining).toEqual([]);
    });
  });

  describe('selectTrainingSourceBooks', () => {
    it('updates the selected training source books for a project', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTrainingSourceBooks('training-source-1-id', ['MAT', 'MRK']);

      expect(env.logicHandler.selectedTrainingSourceBooks$.getValue()['training-source-1-id']).toEqual(['MAT', 'MRK']);
    });

    it('throws when called in draft_books mode', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      expect(() => env.logicHandler.selectTrainingSourceBooks('training-source-1-id', ['MAT'])).toThrow();
    });

    it('throws when selecting a book not in the available set', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');
      // REV is not in the target project, so it can never be in the available training source books
      expect(() => env.logicHandler.selectTrainingSourceBooks('training-source-1-id', ['REV'])).toThrow();
    });

    it('preserves selections for other projects when updating one', async () => {
      const env = new TestEnvironment(teamWithTwoTrainingSources);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTrainingSourceBooks('training-source-1-id', ['MAT']);
      env.logicHandler.selectTrainingSourceBooks('training-source-2-id', ['LUK']);

      expect(env.logicHandler.selectedTrainingSourceBooks$.getValue()['training-source-1-id']).toEqual(['MAT']);
      expect(env.logicHandler.selectedTrainingSourceBooks$.getValue()['training-source-2-id']).toEqual(['LUK']);
    });
  });
});

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedSFProjectService = mock(SFProjectService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedDraftProgressService = mock(DraftProgressService);

interface TestState {
  lastSelectedTranslationScriptureRanges: ProjectScriptureRange[] | undefined;
  previouslySelectedTrainingScriptureRanges: ProjectScriptureRange[] | undefined;

  /** A scripture range specifying what books and chapters exist in the drafting source */
  draftingSourceBooksChapters: string;
  /** A scripture range specifying what books and chapters exist in the target project */
  targetProjectBooksChapters: string;
  /**
   * If set, the target progress returned by a second fetch (i.e. after `reload()`), simulating an in-place sync that
   * changed the target. The first fetch still returns `targetProjectBooksChapters`.
   */
  targetProjectBooksChaptersAfterReload?: string;

  /**
   * A mapping of project ID to scripture range specifying what books and chapters exist in each training source, keyed
   * by project ID.
   */
  trainingSourcesBooksChapters: { [key: string]: string };
  noAccessSources?: boolean;

  /**
   * The target books that appear complete enough to be auto-selected as training data on a first draft (what
   * getCompleteBookIds reports). Independent of the chapter-level ranges above, since completeness is a segment-level
   * judgment. Defaults to none.
   */
  completeTargetBooks?: string[];

  /**
   * The books that exist in the target project's text list (membership, independent of content). Only consulted when
   * the target-membership gate is enforced (allowDraftingBooksNotInTarget === false). Defaults to undefined (no texts).
   */
  targetTextBooks?: string[];

  /**
   * Whether to allow drafting books not present in the target project. Defaults to true in tests so that the
   * target-membership gate doesn't interfere with tests that aren't exercising it; tests for the gate set it
   * explicitly.
   */
  allowDraftingBooksNotInTarget?: boolean;
}

class TestEnvironment {
  logicHandler: NewDraftLogicHandler;

  activatedProjectService = instance(mockedActivatedProjectService);
  sfProjectService = instance(mockedSFProjectService);
  draftSourcesService = instance(mockedDraftSourcesService);
  draftProgressService = instance(mockedDraftProgressService);

  constructor(state: TestState, sources$?: BehaviorSubject<DraftSourcesAsArrays>) {
    // Default to allowing books not in the target so the membership gate stays out of the way of tests that aren't
    // exercising it. Gate tests set this explicitly.
    NewDraftLogicHandler.allowDraftingBooksNotInTarget = state.allowDraftingBooksNotInTarget ?? true;

    const project = createTestProjectProfile({
      texts: (state.targetTextBooks ?? []).map(bookId => ({
        bookNum: Canon.bookIdToNumber(bookId),
        hasSource: false,
        chapters: [],
        permissions: {}
      })),
      translateConfig: {
        preTranslate: true,
        draftConfig: {
          draftingSources: [
            {
              paratextId: 'draft-source-1-pt-id',
              projectRef: 'draft-source-1-id',
              name: 'Draft Source 1',
              shortName: 'DS1',
              writingSystem: { script: 'Latn', tag: 'es' }
            }
          ],
          trainingSources: Object.entries(state.trainingSourcesBooksChapters).map(([projectId, _booksChapters]) => ({
            paratextId: `${projectId}-pt-id`,
            projectRef: projectId,
            name: `Training Source for ${projectId}`,
            shortName: `TS-${projectId}`,
            writingSystem: { script: 'Latn', tag: 'es' }
          })),
          lastSelectedTrainingScriptureRanges: state.previouslySelectedTrainingScriptureRanges,
          lastSelectedTrainingDataFiles: [],
          lastSelectedTranslationScriptureRanges: state.lastSelectedTranslationScriptureRanges
        }
      }
    });

    const projectId = 'testProjectId';
    when(mockedActivatedProjectService.projectId).thenReturn(projectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(of(projectId));
    when(mockedActivatedProjectService.projectDoc).thenReturn({ data: project } as SFProjectProfileDoc);
    when(mockedActivatedProjectService.projectDoc$).thenReturn(of({ data: project } as SFProjectProfileDoc));
    when(mockedSFProjectService.getProfile(projectId)).thenResolve({ data: project } as SFProjectProfileDoc);

    when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(
      sources$ ??
        of({
          trainingSources: state.noAccessSources ? ([{ noAccess: true }] as unknown as DraftSource[]) : [],
          trainingTargets: [],
          draftingSources: []
        })
    );

    // Set up the progress service to return the specified scripture ranges for the project and sources. The second
    // argument (staleness options) is matched with anything() since callers pass per-project staleness overrides.
    if (state.targetProjectBooksChaptersAfterReload != null) {
      // First load returns the pre-sync target; a subsequent fetch (after reload) returns the post-sync target.
      when(mockedDraftProgressService.getProgressForProject(projectId, anything()))
        .thenResolve(new VerboseScriptureRange(state.targetProjectBooksChapters))
        .thenResolve(new VerboseScriptureRange(state.targetProjectBooksChaptersAfterReload));
    } else {
      when(mockedDraftProgressService.getProgressForProject(projectId, anything())).thenResolve(
        new VerboseScriptureRange(state.targetProjectBooksChapters)
      );
    }
    when(mockedDraftProgressService.getProgressForProject('draft-source-1-id', anything())).thenResolve(
      new VerboseScriptureRange(state.draftingSourceBooksChapters)
    );
    for (const [trainingSourceProjectId, booksChapters] of Object.entries(state.trainingSourcesBooksChapters)) {
      when(mockedDraftProgressService.getProgressForProject(trainingSourceProjectId, anything())).thenResolve(
        new VerboseScriptureRange(booksChapters)
      );
    }
    when(mockedDraftProgressService.getCompleteBookIds(projectId, anything())).thenResolve(
      new Set(state.completeTargetBooks ?? [])
    );

    this.logicHandler = new NewDraftLogicHandler(
      this.activatedProjectService,
      this.draftSourcesService,
      this.draftProgressService,
      mockDestroyRef
    );
  }

  async waitForInit(): Promise<void> {
    await firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'input')));
  }

  async waitForAbort(): Promise<void> {
    await firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'abort')));
  }

  // Aliases

  get availableTrainingSourceBooks(): { [projectId: string]: string[] } {
    return this.logicHandler.availableTrainingSourceBooks$.getValue();
  }

  get selectedTrainingSourceBooks(): { [projectId: string]: string[] } {
    return this.logicHandler.selectedTrainingSourceBooks$.getValue();
  }

  get availableTargetTrainingScriptureRange(): string {
    return this.logicHandler.availableTargetTrainingScriptureRange$.getValue().toString();
  }

  get selectedTargetTrainingScriptureRange(): string {
    return this.logicHandler.selectedTargetTrainingScriptureRange$.getValue().toString();
  }

  get trainingBooksWereAutoSelected(): boolean {
    return this.logicHandler.trainingBooksWereAutoSelected;
  }

  get availableDraftingScriptureRange(): string {
    return this.logicHandler.availableDraftingScriptureRange$.getValue().toString();
  }

  get excludedDraftingBooks(): ExcludedDraftingBook[] {
    return this.logicHandler.excludedDraftingBooks;
  }

  get selectedDraftingScriptureRange(): string {
    return this.logicHandler.selectedDraftingScriptureRange$.getValue().toString();
  }

  get booksOfferedForPartialDrafting(): string[] {
    return this.logicHandler.booksOfferedForPartialDrafting;
  }

  get booksOfferedForPartialTargetTraining(): string[] {
    return this.logicHandler.booksOfferedForPartialTargetTraining;
  }
}
