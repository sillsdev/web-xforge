import { ErrorHandler } from '@angular/core';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { Meta, StoryObj } from '@storybook/angular';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { of } from 'rxjs';
import userEvent from '@testing-library/user-event';
import { expect, waitFor, within } from 'storybook/test';
import { anything, instance, mock, reset, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../../core/paratext.service';
import { PermissionsService } from '../../../core/permissions.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { ProgressService } from '../../../shared/progress-service/progress.service';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftSource, DraftSourcesAsArrays } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { TrainingDataService } from '../training-data/training-data.service';
import { DraftProgressService } from './new-draft-logic-handler';
import { NewDraftComponent } from './new-draft.component';
import { VerboseScriptureRange } from '../../../shared/scripture-range';

// Project IDs used throughout the stories.
const TARGET_ID = 'target-project-id';
const DRAFT_SOURCE_ID = 'draft-source-1-id';
const TRAINING_SOURCE_ID = 'training-source-1-id';

// Books available in each project. GEN is the interesting case: the source has all 50 chapters but the target only
// has GEN1-5, so GEN6-50 is offered for drafting and GEN1-5 remains available for training (partial-book drafting).
// PHM is in both the source and the target (1 chapter), so selecting it produces a clean whole-book selection with no
// chapter table. EXO is in the target but the source has no text for it, so it is excluded and demonstrates the
// "no source content" exclusion notice (see the ExcludedBooks story).
const TARGET_BOOKS = 'GEN1-5;EXO1-40;MAT1-28;MRK1-16;LUK1-24;JHN1-21;PHM1';
const DRAFT_SOURCE_BOOKS = 'GEN1-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21;PHM1';
const TRAINING_SOURCE_BOOKS = 'GEN1-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21;PHM1';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedDraftProgressService = mock(DraftProgressService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedOnlineStatusService = mock(OnlineStatusService);
const mockedUserService = mock(UserService);
const mockedRouter = mock(Router);
const mockedNllbLanguageService = mock(NllbLanguageService);
const mockedParatextService = mock(ParatextService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedErrorHandler = mock<ErrorHandler>(ErrorHandler);
const mockedTrainingDataService = mock(TrainingDataService);
// Dependencies of the child components rendered inside the wizard.
const mockedProgressService = mock(ProgressService);
const mockedSFProjectService = mock(SFProjectService);
const mockedPermissionsService = mock(PermissionsService);
const mockedDialogService = mock(DialogService);
const mockedAuthService = mock(AuthService);

interface StoryArgs {
  /** Application online state. Offline disables Generate and skips the pending-updates pre-step. */
  online: boolean;
  /** Enables the developer-tools feature flag (adds the Fast Training / Echo cards on the summary). */
  developerTools: boolean;
  /** Gives the sources copyright banners, shown on the preface. */
  withCopyright: boolean;
  /** Provides a couple of training-data files for the training step. */
  withTrainingDataFiles: boolean;
  /** An administrator has applied a custom Serval config, shown as a notice on the summary. */
  withCustomConfig: boolean;
  /** A source/target project is inaccessible, so the wizard aborts with the no-access screen. */
  noAccess: boolean;
  /** An involved project has un-synced Paratext changes, so the sync interstitial is shown first. */
  hasPendingUpdates: boolean;
  /** Never resolves project/progress loading, leaving the wizard on its loading spinner. */
  neverLoad: boolean;
}

const defaultArgs: StoryArgs = {
  online: true,
  developerTools: false,
  withCopyright: false,
  withTrainingDataFiles: false,
  withCustomConfig: false,
  noAccess: false,
  hasPendingUpdates: false,
  neverLoad: false
};

function makeTrainingData(dataId: string, title: string): TrainingData {
  return {
    dataId,
    title,
    projectRef: TARGET_ID,
    ownerRef: 'user01',
    fileUrl: `https://example.com/${dataId}.csv`,
    mimeType: 'text/csv',
    skipRows: 0
  };
}

function buildProjectProfile(args: StoryArgs): SFProjectProfile {
  return createTestProjectProfile({
    name: 'NTV - Nueva Traducción Viviente',
    shortName: 'TP1',
    writingSystem: { tag: 'en' },
    // Books in the target's text list. EXO is included here but absent from the draft source, producing the
    // "no source content" exclusion notice in the ExcludedBooks story.
    texts: Array.from(new VerboseScriptureRange(TARGET_BOOKS).books.keys()).map(bookId => ({
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
            projectRef: DRAFT_SOURCE_ID,
            name: 'Spanish Draft Source',
            shortName: 'DS1',
            writingSystem: { script: 'Latn', tag: 'es' }
          }
        ],
        trainingSources: [
          {
            paratextId: 'training-source-1-pt-id',
            projectRef: TRAINING_SOURCE_ID,
            name: 'Reference Project',
            shortName: 'RP1',
            writingSystem: { script: 'Latn', tag: 'es' }
          }
        ],
        // Restoring GEN for both the target and the reference source means entering the training step lands with a
        // representative selection already made, so the summary and training steps show real data.
        lastSelectedTrainingScriptureRanges: [
          { projectId: TARGET_ID, scriptureRange: 'GEN' },
          { projectId: TRAINING_SOURCE_ID, scriptureRange: 'GEN' }
        ],
        lastSelectedTrainingDataFiles: args.withTrainingDataFiles ? ['glossary'] : [],
        lastAvailableTrainingDataFiles: args.withTrainingDataFiles ? ['glossary'] : [],
        servalConfig: args.withCustomConfig ? '{ "custom": "value" }' : undefined,
        sendEmailOnBuildFinished: false,
        fastTraining: false,
        useEcho: false
      }
    }
  });
}

function draftSources(args: StoryArgs): DraftSourcesAsArrays {
  if (args.noAccess) {
    return {
      trainingSources: [
        { noAccess: true, shortName: 'RP1', name: 'Reference Project' } as unknown as DraftSource,
        { noAccess: true, shortName: 'DS1', name: 'Spanish Draft Source' } as unknown as DraftSource
      ],
      trainingTargets: [],
      draftingSources: []
    };
  }
  return {
    trainingSources: [
      {
        paratextId: 'training-source-1-pt-id',
        projectRef: TRAINING_SOURCE_ID,
        name: 'Reference Project',
        shortName: 'RP1',
        writingSystem: { script: 'Latn', tag: 'es' },
        texts: [],
        copyrightBanner: args.withCopyright ? 'Reference text © Example Bible Society' : undefined
      } as DraftSource
    ],
    trainingTargets: [],
    draftingSources: [
      {
        paratextId: 'draft-source-1-pt-id',
        projectRef: DRAFT_SOURCE_ID,
        name: 'Spanish Draft Source',
        shortName: 'DS1',
        writingSystem: { script: 'Latn', tag: 'es' },
        texts: [],
        copyrightBanner: args.withCopyright ? 'Source text © Example Bible Society' : undefined
      } as DraftSource
    ]
  };
}

function makeParatextProject(overrides: Partial<ParatextProject>): ParatextProject {
  return {
    paratextId: 'pt-id',
    name: 'A Project',
    shortName: 'PRJ',
    languageTag: 'en',
    projectId: 'sf-project-id',
    isConnectable: true,
    isConnected: true,
    hasUpdate: false,
    hasUserRoleChanged: false,
    role: 'pt_administrator',
    ...overrides
  } as ParatextProject;
}

function setUpMocks(args: StoryArgs): void {
  for (const m of [
    mockedActivatedProjectService,
    mockedDraftSourcesService,
    mockedDraftGenerationService,
    mockedDraftProgressService,
    mockedFeatureFlagService,
    mockedOnlineStatusService,
    mockedUserService,
    mockedRouter,
    mockedNllbLanguageService,
    mockedParatextService,
    mockedErrorReportingService,
    mockedErrorHandler,
    mockedTrainingDataService,
    mockedProgressService,
    mockedSFProjectService,
    mockedPermissionsService,
    mockedDialogService,
    mockedAuthService
  ]) {
    reset(m);
  }

  const project = buildProjectProfile(args);
  const projectDoc = { id: TARGET_ID, data: project } as SFProjectProfileDoc;

  when(mockedActivatedProjectService.projectId).thenReturn(TARGET_ID);
  when(mockedActivatedProjectService.projectId$).thenReturn(of(TARGET_ID));
  when(mockedActivatedProjectService.projectDoc).thenReturn(projectDoc);
  when(mockedActivatedProjectService.projectDoc$).thenReturn(of(projectDoc));
  when(mockedActivatedProjectService.changes$).thenReturn(of(projectDoc));

  when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(of(draftSources(args)));

  // The logic handler loads progress for the target, the drafting source and the training source. When `neverLoad` is
  // set the progress promises never resolve, leaving the wizard stuck on its loading spinner.
  const progressFor = (range: string): Promise<VerboseScriptureRange> =>
    args.neverLoad ? new Promise<VerboseScriptureRange>(() => {}) : Promise.resolve(new VerboseScriptureRange(range));
  when(mockedDraftProgressService.getChaptersWithContent(TARGET_ID, anything())).thenCall(() =>
    progressFor(TARGET_BOOKS)
  );
  when(mockedDraftProgressService.getPresentChapters(TARGET_ID, anything())).thenCall(() => progressFor(TARGET_BOOKS));
  when(mockedDraftProgressService.getChaptersWithContent(DRAFT_SOURCE_ID, anything())).thenCall(() =>
    progressFor(DRAFT_SOURCE_BOOKS)
  );
  when(mockedDraftProgressService.getPresentChapters(DRAFT_SOURCE_ID, anything())).thenCall(() =>
    progressFor(DRAFT_SOURCE_BOOKS)
  );
  when(mockedDraftProgressService.getChaptersWithContent(TRAINING_SOURCE_ID, anything())).thenCall(() =>
    progressFor(TRAINING_SOURCE_BOOKS)
  );
  when(mockedDraftProgressService.getCompleteBookIds(TARGET_ID, anything())).thenResolve(new Set<string>());

  when(mockedFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(args.developerTools));

  when(mockedOnlineStatusService.isOnline).thenReturn(args.online);
  when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(args.online));

  when(mockedUserService.getCurrentUser()).thenResolve({
    data: { email: 'translator@example.com' }
  } as UserDoc);

  when(mockedNllbLanguageService.isNllbLanguageAsync(anything())).thenResolve(false);

  const pendingProjects = args.hasPendingUpdates
    ? [makeParatextProject({ projectId: DRAFT_SOURCE_ID, name: 'Spanish Draft Source', hasUpdate: true })]
    : [];
  when(mockedParatextService.getProjects()).thenResolve(pendingProjects);

  const files = args.withTrainingDataFiles
    ? [makeTrainingData('glossary', 'Glossary terms'), makeTrainingData('back-translation', 'Back translation notes')]
    : [];
  when(mockedTrainingDataService.getTrainingData(anything(), anything())).thenReturn(of(files));

  when(mockedDraftGenerationService.startBuildOrGetActiveBuild(anything())).thenReturn(of(undefined));

  // For the pending-updates interstitial: each involved project doc loads with no active sync, so the row is shown as
  // "syncable" with a Sync button (no live SyncProgressComponent).
  when(mockedSFProjectService.get(anything())).thenResolve({
    id: DRAFT_SOURCE_ID,
    data: createTestProjectProfile({ shortName: 'DS1', sync: { queuedCount: 0, lastSyncSuccessful: true } }),
    remoteChanges$: of()
  } as unknown as SFProjectDoc);
  when(mockedPermissionsService.canSync(anything())).thenReturn(true);
  when(mockedPermissionsService.canConfigureSources(anything())).thenReturn(true);
}

const meta: Meta<StoryArgs> = {
  title: 'Translate/NewDraft',
  component: NewDraftComponent,
  args: defaultArgs,
  parameters: { controls: { include: Object.keys(defaultArgs) } },
  render: args => {
    setUpMocks(args);
    return {
      props: args,
      moduleMetadata: {
        imports: [NewDraftComponent],
        providers: [
          { provide: ActivatedProjectService, useValue: instance(mockedActivatedProjectService) },
          { provide: DraftSourcesService, useValue: instance(mockedDraftSourcesService) },
          { provide: DraftGenerationService, useValue: instance(mockedDraftGenerationService) },
          { provide: DraftProgressService, useValue: instance(mockedDraftProgressService) },
          { provide: FeatureFlagService, useValue: instance(mockedFeatureFlagService) },
          { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) },
          { provide: UserService, useValue: instance(mockedUserService) },
          { provide: Router, useValue: instance(mockedRouter) },
          { provide: NllbLanguageService, useValue: instance(mockedNllbLanguageService) },
          { provide: ParatextService, useValue: instance(mockedParatextService) },
          { provide: ErrorReportingService, useValue: instance(mockedErrorReportingService) },
          { provide: ErrorHandler, useValue: instance(mockedErrorHandler) },
          { provide: TrainingDataService, useValue: instance(mockedTrainingDataService) },
          { provide: ProgressService, useValue: instance(mockedProgressService) },
          { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
          { provide: PermissionsService, useValue: instance(mockedPermissionsService) },
          { provide: DialogService, useValue: instance(mockedDialogService) },
          { provide: AuthService, useValue: instance(mockedAuthService) }
        ]
      }
    };
  }
};

export default meta;

type Story = StoryObj<StoryArgs>;

// --- Navigation helpers for the play functions ---

type Canvas = ReturnType<typeof within>;

/** Advance to the next wizard step. */
async function clickNext(canvas: Canvas): Promise<void> {
  await userEvent.click(await canvas.findByRole('button', { name: /next/i }));
}

/** Toggle a book chip (e.g. "Genesis") in the visible book multi-select. */
async function toggleBook(canvas: Canvas, bookName: string): Promise<void> {
  await userEvent.click(await canvas.findByText(bookName));
}

/** preface -> draft_books, selecting GEN (the first chip) so the step's validation passes. Selecting by position
 * rather than by name keeps this working under any locale (book names are localized; the chrome is not). */
async function gotoDraftBooksWithGen(canvas: Canvas): Promise<void> {
  await clickNext(canvas); // preface -> draft_books
  await canvas.findByText('Select books to draft');
  const books = await canvas.findAllByRole('option'); // ordered by book number, so GEN is first
  await userEvent.click(books[0]);
}

// --- Stories ---

/** The wizard before its project and progress data have loaded. */
export const Loading: Story = {
  args: { neverLoad: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.loading-indicator')).not.toBeNull());
  }
};

/** A source or reference project is inaccessible, so drafting cannot proceed. */
export const Abort: Story = {
  args: { noAccess: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.abort-screen')).not.toBeNull());
  }
};

/** Pre-step interstitial: an involved project has un-synced Paratext changes. */
export const PendingUpdates: Story = {
  args: { hasPendingUpdates: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Spanish Draft Source');
    // The continue-anyway action is always offered; the wizard's own step buttons are hidden here.
    expect(canvas.queryByRole('button', { name: /next/i })).toBeNull();
  }
};

/** First wizard step: confirm the configured sources before drafting. */
export const Preface: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector('.configure-sources-link')).not.toBeNull());
    await canvas.findByRole('button', { name: /next/i });
  }
};

/** Preface with copyright banners contributed by the sources. */
export const PrefaceWithCopyright: Story = {
  args: { withCopyright: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Source text © Example Bible Society');
    await canvas.findByText('Reference text © Example Bible Society');
  }
};

/** Book selection step with a whole-book selection (PHM is in both projects but has no partial-chapter table). */
export const SelectBooksToDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clickNext(canvas); // preface -> draft_books
    await canvas.findByText('Select books to draft');
    await toggleBook(canvas, 'Philemon');
    // PHM has only one chapter, so it isn't eligible for partial drafting and no chapter inputs appear.
    await waitFor(() => expect(canvasElement.querySelector('.partial-book-drafting-table')).toBeNull());
  }
};

/** A target-only book (EXO) has no source content; expanding the collapsed notice explains why it's hidden. */
export const ExcludedBooks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clickNext(canvas); // preface -> draft_books
    await canvas.findByText('Select books to draft');
    // The exclusion notice starts collapsed; expand it to reveal which books were left out and why.
    await userEvent.click(await canvas.findByText(/books are hidden/i));
    // EXO is in the target but the source has no text for it, so it is named in the "no source content" notice.
    await canvas.findByText(/Exodus/);
  }
};

/** Book selection with partial-book drafting: GEN exposes a chapter input, and an out-of-range value shows an error. */
export const SelectChaptersToDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await gotoDraftBooksWithGen(canvas);
    // GEN is eligible for partial drafting, so a chapter input appears.
    const input = await canvas.findByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '51-60'); // GEN only has 50 chapters in the source
    await userEvent.tab(); // blur triggers validation
    await waitFor(() => expect(canvasElement.querySelector('.chapter-error')).not.toBeNull());
  }
};

/** Training step: choose which of your own books, reference books, and training files to train on. */
export const SelectTrainingBooks: Story = {
  args: { withTrainingDataFiles: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await gotoDraftBooksWithGen(canvas);
    await clickNext(canvas); // draft_books -> training_books
    await canvas.findByText('Select books to train on');
    // The reference source and the training-data files both render.
    await canvas.findByText('RP1');
    await canvas.findByText('Glossary terms');
  }
};

/** Final summary step, ready to generate the draft. A custom Serval config is set, so the summary also shows the
 * "custom draft configurations have been applied" notice. */
export const Summary: Story = {
  args: { withCustomConfig: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await gotoDraftBooksWithGen(canvas);
    await clickNext(canvas); // draft_books -> training_books
    await canvas.findByText('Select books to train on');
    await clickNext(canvas); // training_books -> summary
    await canvas.findByRole('button', { name: /generate draft/i });
    await canvas.findByText('Custom draft configurations have been applied by an administrator.');
  }
};

/** Summary while offline and with developer tools enabled: Generate is disabled and the dev cards are shown. */
export const SummaryOfflineDevTools: Story = {
  args: { online: false, developerTools: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await gotoDraftBooksWithGen(canvas);
    await clickNext(canvas); // draft_books -> training_books
    await canvas.findByText('Select books to train on');
    await clickNext(canvas); // training_books -> summary
    await canvas.findByText('Developer options');
    const generate = await canvas.findByRole('button', { name: /generate draft/i });
    expect(generate).toBeDisabled();
  }
};

/** Right-to-left layout of the training step. */
export const RTL: Story = {
  args: { withTrainingDataFiles: true },
  parameters: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await gotoDraftBooksWithGen(canvas);
    await clickNext(canvas); // draft_books -> training_books
    await canvas.findByText('RP1');
  }
};
