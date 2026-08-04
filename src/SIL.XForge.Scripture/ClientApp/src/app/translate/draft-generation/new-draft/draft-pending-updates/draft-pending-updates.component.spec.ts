import { DestroyRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { PermissionsService } from '../../../../core/permissions.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { DraftPendingUpdatesComponent } from './draft-pending-updates.component';

const USER_ID = 'test-user-id';

describe('DraftPendingUpdatesComponent', () => {
  describe('ngOnInit', () => {
    it('creates a syncable row when user has Texts.Edit on the project', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'Project One', SFProjectRole.ParatextAdministrator)]);

      await env.component.ngOnInit();

      expect(env.component.rows.length).toBe(1);
      expect(env.component.rows[0].projectId).toBe('proj1');
      expect(env.component.rows[0].name).toBe('Project One');
      expect(env.component.rows[0].canSync).toBeTrue();
      expect(env.component.rows[0].syncState).toBe('pending');
    });

    it('creates a non-syncable row when user lacks Texts.Edit', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'Project One', SFProjectRole.CommunityChecker)]);

      await env.component.ngOnInit();

      expect(env.component.rows[0].canSync).toBeFalse();
    });

    it('creates a syncable row for a DBL resource when the user has any Paratext role', async () => {
      // A Paratext observer cannot edit, but may still sync a DBL resource.
      const env = new TestEnvironment([makeResource('res1', 'Resource One', SFProjectRole.ParatextObserver)]);

      await env.component.ngOnInit();

      expect(env.component.rows[0].canSync).toBeTrue();
    });

    it('creates a non-syncable row for a DBL resource when the user has no Paratext role', async () => {
      const env = new TestEnvironment([makeResource('res1', 'Resource One', SFProjectRole.CommunityChecker)]);

      await env.component.ngOnInit();

      expect(env.component.rows[0].canSync).toBeFalse();
    });

    it('sets syncState to syncing when project is already syncing', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'Project One', SFProjectRole.ParatextAdministrator, 1)]);

      await env.component.ngOnInit();

      expect(env.component.rows[0].syncState).toBe('syncing');
    });

    it('sets loading to false after init completes', async () => {
      const env = new TestEnvironment([]);
      expect(env.component.loading).toBeTrue();

      await env.component.ngOnInit();

      expect(env.component.loading).toBeFalse();
    });

    it('builds a degraded read-only row and still finishes loading when a project doc fails to load', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        { ...makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator), failsToLoad: true }
      ]);

      await env.component.ngOnInit();

      expect(env.component.loading).toBeFalse();
      expect(env.component.rows.length).toBe(2);
      expect(env.component.rows[0].canSync).toBeTrue();
      expect(env.component.rows[1].canSync).toBeFalse();
      expect(env.component.rows[1].projectDoc).toBeUndefined();
      expect(env.component.rows[1].syncState).toBe('pending');
      verify(env.mockedErrorReportingService.silentError(anything(), anything())).once();
    });

    it('builds rows for multiple pending projects', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'Project One', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'Project Two', SFProjectRole.CommunityChecker)
      ]);

      await env.component.ngOnInit();

      expect(env.component.rows.length).toBe(2);
      expect(env.component.rows[0].canSync).toBeTrue();
      expect(env.component.rows[1].canSync).toBeFalse();
    });
  });

  describe('syncableRows', () => {
    it('returns only rows where canSync is true', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'P2', SFProjectRole.CommunityChecker)
      ]);
      await env.component.ngOnInit();

      expect(env.component.syncableRows.length).toBe(1);
      expect(env.component.syncableRows[0].projectId).toBe('proj1');
    });
  });

  describe('showSyncAll', () => {
    it('is false with a single syncable project', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();

      expect(env.component.showSyncAll).toBeFalse();
    });

    it('is true with multiple syncable projects that still need syncing', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator)
      ]);
      await env.component.ngOnInit();

      expect(env.component.showSyncAll).toBeTrue();
    });

    it('is false once no syncable project is pending', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator)
      ]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync(anything())).thenResolve();

      env.component.syncAll();

      expect(env.component.showSyncAll).toBeFalse();
    });
  });

  describe('sync count message', () => {
    it('is not shown for a single syncable project even while it syncs', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();

      expect(env.component.rows[0].syncState).toBe('syncing');
      expect(env.component.showSyncCountMessage).toBeFalse();
    });

    it('is shown while any of multiple syncable projects is syncing, with completion counts', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1),
        makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator, 1)
      ]);
      await env.component.ngOnInit();
      expect(env.component.showSyncCountMessage).toBeTrue();
      expect(env.component.syncedSyncableCount).toBe(0);

      env.completeSync('proj1', true);

      expect(env.component.showSyncCountMessage).toBeTrue();
      expect(env.component.syncedSyncableCount).toBe(1);

      env.completeSync('proj2', true);

      expect(env.component.showSyncCountMessage).toBeFalse();
      expect(env.component.syncedSyncableCount).toBe(2);
    });
  });

  describe('continueIsPrimary', () => {
    it('is true when the only rows cannot be synced by the user', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.CommunityChecker)]);
      await env.component.ngOnInit();

      expect(env.component.continueIsPrimary).toBeTrue();
    });

    it('is false while a syncable row is still pending or syncing', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'P2', SFProjectRole.CommunityChecker)
      ]);
      await env.component.ngOnInit();

      expect(env.component.continueIsPrimary).toBeFalse();
    });

    it('is true once a sync has failed and nothing else is actionable', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();

      env.completeSync('proj1', false);

      expect(env.component.rows[0].syncState).toBe('failed');
      expect(env.component.continueIsPrimary).toBeTrue();
    });

    it('is false while a cant-sync row is actively syncing', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1),
        makeProject('proj2', 'P2', SFProjectRole.CommunityChecker, 1)
      ]);
      await env.component.ngOnInit();

      env.completeSync('proj1', true);

      // Waiting for the running sync may unblock the all-synced auto-advance, so Continue is not promoted.
      expect(env.component.rows[1].syncState).toBe('syncing');
      expect(env.component.continueIsPrimary).toBeFalse();
    });

    it('is true once a cant-sync row fails and nothing else is actionable', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.CommunityChecker, 1)]);
      await env.component.ngOnInit();

      env.completeSync('proj1', false);

      expect(env.component.rows[0].syncState).toBe('failed');
      expect(env.component.continueIsPrimary).toBeTrue();
    });

    it('is false when everything is synced', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();

      env.completeSync('proj1', true);

      expect(env.component.continueIsPrimary).toBeFalse();
    });
  });

  describe('syncProject', () => {
    it('calls onlineSync and sets syncState to syncing', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();

      env.component.syncProject(env.component.rows[0]);

      expect(env.component.rows[0].syncState).toBe('syncing');
      verify(env.mockedProjectService.onlineSync('proj1')).once();
    });

    it('does nothing when row is already syncing', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      env.component.rows[0].syncState = 'syncing';
      when(env.mockedProjectService.onlineSync(anything())).thenResolve();

      env.component.syncProject(env.component.rows[0]);

      verify(env.mockedProjectService.onlineSync(anything())).never();
      expect().nothing();
    });

    it('does nothing when canSync is false', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.CommunityChecker)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync(anything())).thenResolve();

      env.component.syncProject(env.component.rows[0]);

      verify(env.mockedProjectService.onlineSync(anything())).never();
      expect().nothing();
    });

    it('sets syncState to failed when onlineSync rejects', fakeAsync(async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenReject(new Error('network error'));

      env.component.syncProject(env.component.rows[0]);
      tick();

      expect(env.component.rows[0].syncState).toBe('failed');
    }));
  });

  describe('retrySyncProject', () => {
    it('resets state to pending and calls syncProject', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      env.component.rows[0].syncState = 'failed';
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();

      env.component.retrySyncProject(env.component.rows[0]);

      expect(env.component.rows[0].syncState).toBe('syncing');
      verify(env.mockedProjectService.onlineSync('proj1')).once();
    });
  });

  describe('syncAll', () => {
    it('calls syncProject for all syncable pending rows', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'P2', SFProjectRole.ParatextTranslator),
        makeProject('proj3', 'P3', SFProjectRole.CommunityChecker)
      ]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync(anything())).thenResolve();

      env.component.syncAll();

      verify(env.mockedProjectService.onlineSync('proj1')).once();
      verify(env.mockedProjectService.onlineSync('proj2')).once();
      verify(env.mockedProjectService.onlineSync('proj3')).never();
      expect().nothing();
    });

    it('skips rows already syncing', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator),
        makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator)
      ]);
      await env.component.ngOnInit();
      env.component.rows[0].syncState = 'syncing';
      when(env.mockedProjectService.onlineSync(anything())).thenResolve();

      env.component.syncAll();

      verify(env.mockedProjectService.onlineSync('proj1')).never();
      verify(env.mockedProjectService.onlineSync('proj2')).once();
      expect().nothing();
    });
  });

  describe('sync completion', () => {
    it('resolves to synced on the queuedCount high->low edge when lastSyncSuccessful is true', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();
      env.component.syncProject(env.component.rows[0]);

      env.startSync('proj1');
      expect(env.component.rows[0].syncState).toBe('syncing');

      env.completeSync('proj1', true);
      expect(env.component.rows[0].syncState).toBe('synced');
    });

    it('resolves to failed on completion when lastSyncSuccessful is false', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();
      env.component.syncProject(env.component.rows[0]);

      env.startSync('proj1');
      env.completeSync('proj1', false);

      expect(env.component.rows[0].syncState).toBe('failed');
    });

    it('does not resolve prematurely on a queuedCount=0 change before the sync starts', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();
      env.component.syncProject(env.component.rows[0]);

      // A remote change arrives before the sync has been enqueued (queuedCount still 0).
      env.emitRemoteChange('proj1');

      expect(env.component.rows[0].syncState).toBe('syncing');
    });

    it('observes a cant-sync project whose sync starts after the wizard opens', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.CommunityChecker)]);
      await env.component.ngOnInit();
      expect(env.component.rows[0].syncState).toBe('pending');

      // Someone else (e.g. a project admin) starts and completes a sync.
      env.startSync('proj1');
      expect(env.component.rows[0].syncState).toBe('syncing');

      env.completeSync('proj1', true);
      expect(env.component.rows[0].syncState).toBe('synced');
    });

    it('resolves a row that is already syncing when the wizard opens', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      expect(env.component.rows[0].syncState).toBe('syncing');

      env.completeSync('proj1', true);

      expect(env.component.rows[0].syncState).toBe('synced');
    });
  });

  describe('Continue anyway gating', () => {
    it('blocks continuing while a sync the user started is still running', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();
      expect(env.component.userSyncInProgress).toBeFalse();

      env.component.syncProject(env.component.rows[0]);

      expect(env.component.userSyncInProgress).toBeTrue();
    });

    it('still allows continuing when a project was already syncing on entry (not user-initiated)', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();

      expect(env.component.rows[0].syncState).toBe('syncing');
      // A pre-existing (possibly stuck) sync must not trap the user, so continuing stays allowed.
      expect(env.component.userSyncInProgress).toBeFalse();
    });

    it('allows continuing again once the user-initiated sync finishes', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      when(env.mockedProjectService.onlineSync('proj1')).thenResolve();
      env.component.syncProject(env.component.rows[0]);
      env.startSync('proj1');
      expect(env.component.userSyncInProgress).toBeTrue();

      env.completeSync('proj1', true);

      expect(env.component.userSyncInProgress).toBeFalse();
    });
  });

  describe('continueAnyway', () => {
    it('emits continue', async () => {
      const env = new TestEnvironment([]);
      await env.component.ngOnInit();
      let emitted = false;
      env.component.continue.subscribe(() => (emitted = true));

      env.component.continueAnyway();

      expect(emitted).toBeTrue();
    });

    it('emits the IDs of the projects that synced', async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1),
        makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator)
      ]);
      await env.component.ngOnInit();
      let emitted: string[] | undefined;
      env.component.continue.subscribe(ids => (emitted = ids));

      env.completeSync('proj1', true); // proj1 syncs; proj2 stays pending

      env.component.continueAnyway();

      expect(emitted).toEqual(['proj1']);
    });

    it('emits an empty array when nothing was synced', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator)]);
      await env.component.ngOnInit();
      let emitted: string[] | undefined;
      env.component.continue.subscribe(ids => (emitted = ids));

      env.component.continueAnyway();

      expect(emitted).toEqual([]);
    });
  });

  describe('auto-advance', () => {
    it('auto-advances after delay when all syncable rows are synced and no cant-sync rows', fakeAsync(async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      let emitted: string[] | undefined;
      env.component.continue.subscribe(ids => (emitted = ids));

      env.completeSync('proj1', true);
      expect(emitted).toBeUndefined();

      tick(1500);
      expect(emitted).toEqual(['proj1']);
    }));

    it('sets autoAdvancing while the auto-advance is scheduled', fakeAsync(async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      expect(env.component.autoAdvancing).toBeFalse();

      env.completeSync('proj1', true);

      expect(env.component.autoAdvancing).toBeTrue();
      tick(1500);
    }));

    it('auto-advances when a cant-sync row was brought up to date by someone else', fakeAsync(async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1),
        makeProject('proj2', 'P2', SFProjectRole.CommunityChecker, 1)
      ]);
      await env.component.ngOnInit();
      let emitted: string[] | undefined;
      env.component.continue.subscribe(ids => (emitted = ids));

      env.completeSync('proj1', true);
      env.completeSync('proj2', true);
      tick(1500);

      expect(emitted).toEqual(['proj1', 'proj2']);
    }));

    it('auto-advances when every row is a cant-sync row and all are brought up to date', fakeAsync(async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.CommunityChecker, 1),
        makeProject('proj2', 'P2', SFProjectRole.CommunityChecker)
      ]);
      await env.component.ngOnInit();
      let emitted: string[] | undefined;
      env.component.continue.subscribe(ids => (emitted = ids));

      env.completeSync('proj1', true);
      env.startSync('proj2');
      env.completeSync('proj2', true);
      tick(1500);

      expect(emitted).toEqual(['proj1', 'proj2']);
    }));

    it('does not auto-advance when cant-sync rows exist', fakeAsync(async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1),
        makeProject('proj2', 'P2', SFProjectRole.CommunityChecker)
      ]);
      await env.component.ngOnInit();
      let emitted = false;
      env.component.continue.subscribe(() => (emitted = true));

      env.completeSync('proj1', true);
      tick(1500);

      expect(emitted).toBeFalse();
    }));

    it('does not auto-advance when some syncable rows are still pending', fakeAsync(async () => {
      const env = new TestEnvironment([
        makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1),
        makeProject('proj2', 'P2', SFProjectRole.ParatextAdministrator)
      ]);
      await env.component.ngOnInit();
      let emitted = false;
      env.component.continue.subscribe(() => (emitted = true));

      // Only proj1 finishes; proj2 is still pending
      env.completeSync('proj1', true);
      tick(1500);

      expect(emitted).toBeFalse();
    }));

    it('does not auto-advance when a sync failed', fakeAsync(async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      let emitted = false;
      env.component.continue.subscribe(() => (emitted = true));

      env.completeSync('proj1', false);
      tick(1500);

      expect(emitted).toBeFalse();
    }));

    it('cancels the pending auto-advance when the component is destroyed', fakeAsync(async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      let emitted = false;
      env.component.continue.subscribe(() => (emitted = true));

      env.completeSync('proj1', true); // schedules the auto-advance
      env.destroyRef.destroy(); // component torn down before it fires
      tick(1500);

      expect(emitted).toBeFalse();
    }));
  });
});

interface ProjectSpec {
  projectId: string;
  name: string;
  role: SFProjectRole;
  queuedCount: number;
  paratextId?: string;
  /** When true, the project doc get() rejects, simulating a transient load failure. */
  failsToLoad?: boolean;
}

function makeProject(projectId: string, name: string, role: SFProjectRole, queuedCount = 0): ProjectSpec {
  return { projectId, name, role, queuedCount };
}

// A DBL resource is identified by a 16-character paratextId.
function makeResource(projectId: string, name: string, role: SFProjectRole, queuedCount = 0): ProjectSpec {
  return { projectId, name, role, queuedCount, paratextId: 'resource16char01' };
}

/** A DestroyRef whose registered teardown callbacks can be fired on demand via destroy(). */
class FakeDestroyRef implements DestroyRef {
  destroyed = false;
  private callbacks: (() => void)[] = [];

  onDestroy(callback: () => void): () => void {
    this.callbacks.push(callback);
    return () => (this.callbacks = this.callbacks.filter(cb => cb !== callback));
  }

  destroy(): void {
    this.destroyed = true;
    this.callbacks.forEach(cb => cb());
    this.callbacks = [];
  }
}

class TestEnvironment {
  component: DraftPendingUpdatesComponent;
  readonly mockedProjectService = mock(SFProjectService);
  readonly mockedErrorReportingService = mock(ErrorReportingService);
  readonly destroyRef = new FakeDestroyRef();
  private readonly mockedUserService = mock(UserService);
  private readonly projectDocs = new Map<string, { data: any; remoteChanges$: Subject<void> }>();

  constructor(projects: ProjectSpec[]) {
    when(this.mockedUserService.currentUserId).thenReturn(USER_ID);

    for (const spec of projects) {
      if (spec.failsToLoad) {
        when(this.mockedProjectService.get(spec.projectId)).thenReject(new Error('subscribe failed'));
        continue;
      }
      const projectData = createTestProjectProfile({
        shortName: spec.name,
        userRoles: { [USER_ID]: spec.role },
        sync: { queuedCount: spec.queuedCount },
        ...(spec.paratextId != null ? { paratextId: spec.paratextId } : {})
      });
      const doc = { data: projectData, remoteChanges$: new Subject<void>() } as unknown as SFProjectDoc;
      this.projectDocs.set(spec.projectId, doc as any);
      when(this.mockedProjectService.get(spec.projectId)).thenResolve(doc);
    }

    // Use a real PermissionsService so the role/resource permission logic is exercised, not stubbed.
    const permissionsService = new PermissionsService(
      instance(this.mockedUserService),
      instance(this.mockedProjectService)
    );
    this.component = new DraftPendingUpdatesComponent(
      instance(this.mockedProjectService),
      permissionsService,
      instance(this.mockedErrorReportingService),
      this.destroyRef
    );
    this.component.pendingProjects = projects.map(p => ({ projectId: p.projectId, name: p.name }));
  }

  /** Simulate the project's sync becoming active (queuedCount > 0) and notify subscribers. */
  startSync(projectId: string): void {
    const doc = this.projectDocs.get(projectId)!;
    doc.data.sync = { ...doc.data.sync, queuedCount: 1 };
    doc.remoteChanges$.next();
  }

  /** Simulate the project's sync completing (queuedCount back to 0) and notify subscribers. */
  completeSync(projectId: string, successful: boolean): void {
    const doc = this.projectDocs.get(projectId)!;
    doc.data.sync = { ...doc.data.sync, queuedCount: 0, lastSyncSuccessful: successful };
    doc.remoteChanges$.next();
  }

  /** Emit a remote change without altering sync state (e.g. an unrelated doc edit). */
  emitRemoteChange(projectId: string): void {
    this.projectDocs.get(projectId)!.remoteChanges$.next();
  }
}
