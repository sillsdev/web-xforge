import { Meta, StoryObj } from '@storybook/angular';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Subject } from 'rxjs';
import userEvent from '@testing-library/user-event';
import { expect, waitFor, within } from 'storybook/test';
import { anything, instance, mock, reset, when } from 'ts-mockito';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { PermissionsService } from '../../../../core/permissions.service';
import { ProjectNotificationService } from '../../../../core/project-notification.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { DraftPendingUpdatesComponent } from './draft-pending-updates.component';

// Dependencies of the component (and of the SyncProgressComponent it renders while a project syncs).
const mockedSFProjectService = mock(SFProjectService);
const mockedPermissionsService = mock(PermissionsService);
const mockedProjectNotificationService = mock(ProjectNotificationService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedOnlineStatusService = mock(OnlineStatusService);

/** Describes one row of the interstitial. `queuedCount > 0` makes the project syncing on entry. */
interface ProjectSpec {
  projectId: string;
  name: string;
  canSync: boolean;
  queuedCount?: number;
  lastSyncSuccessful?: boolean;
  /** The project doc never loads, so the component stays on its loading spinner. */
  neverLoad?: boolean;
  /** When the user starts a sync for this project, immediately drive it to this outcome (for the succeeded/failed states). */
  completeOnSyncWith?: 'success' | 'failure';
}

// Crafted project docs keyed by id, so the play functions can drive a sync to completion after the user starts it.
const docs = new Map<string, { doc: SFProjectDoc; remoteChanges$: Subject<unknown>; data: any }>();

function setUpMocks(specs: ProjectSpec[]): void {
  for (const m of [
    mockedSFProjectService,
    mockedPermissionsService,
    mockedProjectNotificationService,
    mockedFeatureFlagService,
    mockedErrorReportingService,
    mockedOnlineStatusService
  ]) {
    reset(m);
  }
  docs.clear();

  const specById = new Map(specs.map(s => [s.projectId, s]));
  for (const spec of specs) {
    const remoteChanges$ = new Subject<unknown>();
    const data = createTestProjectProfile({
      shortName: spec.name,
      sync: { queuedCount: spec.queuedCount ?? 0, lastSyncSuccessful: spec.lastSyncSuccessful ?? true }
    });
    docs.set(spec.projectId, {
      doc: { id: spec.projectId, data, remoteChanges$ } as unknown as SFProjectDoc,
      remoteChanges$,
      data
    });
  }

  when(mockedSFProjectService.get(anything())).thenCall((id: string) =>
    specById.get(id)?.neverLoad ? new Promise<SFProjectDoc>(() => {}) : Promise.resolve(docs.get(id)!.doc)
  );
  // Drive the sync to completion within the (zoned) sync call so change detection updates the row to its final state.
  when(mockedSFProjectService.onlineSync(anything())).thenCall((id: string) => {
    const outcome = specById.get(id)?.completeOnSyncWith;
    if (outcome != null) completeSync(id, outcome === 'success');
    return Promise.resolve();
  });
  when(mockedPermissionsService.canSync(anything())).thenCall(
    (doc: SFProjectDoc) => specById.get(doc?.id ?? '')?.canSync ?? false
  );

  // SyncProgressComponent dependencies (it's rendered for a project that is syncing in place).
  when(mockedProjectNotificationService.start()).thenResolve();
  when(mockedProjectNotificationService.stop()).thenResolve();
  when(mockedProjectNotificationService.subscribeToProject(anything())).thenResolve();
  when(mockedFeatureFlagService.stillness).thenReturn(createTestFeatureFlag(false));
  when(mockedOnlineStatusService.isOnline).thenReturn(true);
  when(mockedOnlineStatusService.isBrowserOnline).thenReturn(true);
}

/** Drives a row's project to a completed sync (queuedCount 1 → 0) after the user has started it. */
function completeSync(projectId: string, successful: boolean): void {
  const entry = docs.get(projectId)!;
  entry.data.sync.queuedCount = 1;
  entry.remoteChanges$.next([]); // observed as "now syncing"
  entry.data.sync.queuedCount = 0;
  entry.data.sync.lastSyncSuccessful = successful;
  entry.remoteChanges$.next([]); // observed as the syncing → done edge
}

interface StoryArgs {
  projects: ProjectSpec[];
}

const meta: Meta<StoryArgs> = {
  title: 'Translate/NewDraft/PendingUpdates',
  component: DraftPendingUpdatesComponent,
  parameters: { controls: { disable: true } },
  render: args => {
    setUpMocks(args.projects);
    return {
      props: { pendingProjects: args.projects.map(p => ({ projectId: p.projectId, name: p.name })) },
      moduleMetadata: {
        imports: [DraftPendingUpdatesComponent],
        providers: [
          { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
          { provide: PermissionsService, useValue: instance(mockedPermissionsService) },
          { provide: ProjectNotificationService, useValue: instance(mockedProjectNotificationService) },
          { provide: FeatureFlagService, useValue: instance(mockedFeatureFlagService) },
          { provide: ErrorReportingService, useValue: instance(mockedErrorReportingService) },
          { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) }
        ]
      }
    };
  }
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** A single syncable project: it uses its own row's Sync button (no "Sync all", which would imply more than one). */
export const SingleSyncableProject: Story = {
  args: { projects: [{ projectId: 'p1', name: 'Greek NT', canSync: true }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Greek NT');
    expect(canvas.queryByRole('button', { name: /sync all/i })).toBeNull();
  }
};

/** Several syncable projects: each has its own Sync button, plus a "Sync all" primary action. */
export const MultipleSyncableProjects: Story = {
  args: {
    projects: [
      { projectId: 'p1', name: 'Greek NT', canSync: true },
      { projectId: 'p2', name: 'Hebrew OT', canSync: true },
      { projectId: 'p3', name: 'Back Translation', canSync: true }
    ]
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /sync all/i });
  }
};

/** The user lacks Texts.Edit, so it's informational only; they must ask an admin or continue anyway. */
export const CannotSync: Story = {
  args: { projects: [{ projectId: 'p1', name: 'Greek NT', canSync: false }] }
};

/** A mix: one project the user can sync and one they can't. */
export const MixedPermissions: Story = {
  args: {
    projects: [
      { projectId: 'p1', name: 'Greek NT', canSync: true },
      { projectId: 'p2', name: 'Hebrew OT', canSync: false }
    ]
  }
};

/** A project that was already syncing when the wizard opened shows live progress and no Sync button. */
export const AlreadySyncing: Story = {
  args: { projects: [{ projectId: 'p1', name: 'Greek NT', canSync: true, queuedCount: 1 }] }
};

/** Project docs haven't loaded yet. */
export const Loading: Story = {
  args: { projects: [{ projectId: 'p1', name: 'Greek NT', canSync: true, neverLoad: true }] },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.loading-indicator')).not.toBeNull());
  }
};

/** Start a sync, then let it finish successfully; the row shows "Up to date". */
export const SyncSucceeded: Story = {
  args: { projects: [{ projectId: 'p1', name: 'Greek NT', canSync: true, completeOnSyncWith: 'success' }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Greek NT');
    await userEvent.click(await canvas.findByRole('button', { name: /sync/i }));
    await waitFor(() => expect(canvas.getByText('Up to date')).not.toBeNull());
  }
};

/** Start a sync, then let it fail; the row shows "Sync failed" with a Retry button. */
export const SyncFailed: Story = {
  args: { projects: [{ projectId: 'p1', name: 'Greek NT', canSync: true, completeOnSyncWith: 'failure' }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Greek NT');
    await userEvent.click(await canvas.findByRole('button', { name: /sync/i }));
    await waitFor(() => expect(canvas.getByText('Sync failed')).not.toBeNull());
    await canvas.findByRole('button', { name: /retry/i });
  }
};
