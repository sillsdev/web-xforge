import { DestroyRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
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
    it('resolves to synced on the queuedCount high→low edge when lastSyncSuccessful is true', async () => {
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

    it('resolves a row that is already syncing when the wizard opens', async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      expect(env.component.rows[0].syncState).toBe('syncing');

      env.completeSync('proj1', true);

      expect(env.component.rows[0].syncState).toBe('synced');
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
  });

  describe('auto-advance', () => {
    it('auto-advances after delay when all syncable rows are synced and no cant-sync rows', fakeAsync(async () => {
      const env = new TestEnvironment([makeProject('proj1', 'P1', SFProjectRole.ParatextAdministrator, 1)]);
      await env.component.ngOnInit();
      let emitted = false;
      env.component.continue.subscribe(() => (emitted = true));

      env.completeSync('proj1', true);
      expect(emitted).toBeFalse();

      tick(1500);
      expect(emitted).toBeTrue();
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
  readonly destroyRef = new FakeDestroyRef();
  private readonly mockedUserService = mock(UserService);
  private readonly projectDocs = new Map<string, { data: any; remoteChanges$: Subject<void> }>();

  constructor(projects: ProjectSpec[]) {
    when(this.mockedUserService.currentUserId).thenReturn(USER_ID);

    for (const spec of projects) {
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
