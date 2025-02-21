import { Inject, Injectable, ModuleWithProviders, NgModule } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivationEnd, Router } from '@angular/router';
import ObjectID from 'bson-objectid';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { filter, map, startWith, switchMap } from 'rxjs/operators';
import { instance } from 'ts-mockito';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { PermissionsService } from '../app/core/permissions.service';
import { SFProjectService } from '../app/core/sf-project.service';
import { CacheService } from '../app/shared/cache-service/cache.service';
import { SubscriptionDisposable } from './subscription-disposable';

interface IActiveProjectIdService {
  /** SF project id */
  projectId$: Observable<string | undefined>;
}

@Injectable({ providedIn: 'root' })
export class ActiveProjectIdService implements IActiveProjectIdService {
  projectId$: Observable<string | undefined> = this.router.events.pipe(
    // filter out router events that include the old style link with sharing query parameter
    // to prevent a permission denied error that occurs before the user has successfully joined
    filter(event => event instanceof ActivationEnd && event.snapshot.queryParams['sharing'] !== 'true'),
    map(event => (event as ActivationEnd).snapshot.params.projectId),
    startWith(this.getProjectIdFromUrl(this.router.routerState.snapshot.url))
  );

  constructor(private readonly router: Router) {}

  private getProjectIdFromUrl(url: string): string | undefined {
    const urlPortions = url.split('/').filter(portion => portion !== '');
    if (urlPortions.length >= 2 && urlPortions[0] === 'projects' && ObjectID.isValid(urlPortions[1])) {
      return urlPortions[1];
    }
    return undefined;
  }
}

/**
 * Provides a copy of the project document for the currently activated project.
 *
 * Notes:
 * - The project ID is obtained from the route parameters and is updated whenever the route parameters change. It will
 * be undefined if the route parameters do not contain a project ID.
 * - The project ID is updated before the project document is fetched. This means that the project document may be
 * undefined even if the project ID is defined.
 * - If a project is selected and then another project is selected before the project document for the first project is
 * fetched, the project document for the first project will never be emitted by the projectDoc$ observable.
 * - The same project ID will not be emitted twice in a row, and the same project document will not be emitted twice in
 * a row.
 */
@Injectable({ providedIn: 'root' })
export class ActivatedProjectService extends SubscriptionDisposable {
  private _projectId$ = new BehaviorSubject<string | undefined>(undefined);
  private _projectDoc$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);

  constructor(
    private readonly projectService: SFProjectService,
    private readonly cacheService: CacheService,
    @Inject(ActiveProjectIdService) activeProjectIdService: IActiveProjectIdService
  ) {
    super();
    this.subscribe(activeProjectIdService.projectId$, projectId => this.selectProject(projectId));
  }

  /** SF project id */
  get projectId(): string | undefined {
    return this._projectId$.getValue();
  }

  private set projectId(projectId: string | undefined) {
    if (this.projectId !== projectId) {
      this._projectId$.next(projectId);
    }
  }

  get projectId$(): Observable<string | undefined> {
    return this._projectId$;
  }

  get projectDoc(): SFProjectProfileDoc | undefined {
    return this._projectDoc$.getValue();
  }

  private set projectDoc(projectDoc: SFProjectProfileDoc | undefined) {
    if (this.projectDoc !== projectDoc) {
      this._projectDoc$.next(projectDoc);
      if (this.projectDoc !== undefined) {
        this.cacheService.cache(this.projectDoc);
      }
    }
  }

  get projectDoc$(): Observable<SFProjectProfileDoc | undefined> {
    return this._projectDoc$;
  }

  /** Gives the current project document every time the project changes or a different project is activated. */
  get changes$(): Observable<SFProjectProfileDoc | undefined> {
    return this.projectDoc$.pipe(
      switchMap(projectDoc => projectDoc?.changes$.pipe(startWith(projectDoc)) ?? of(undefined)),
      map(() => this.projectDoc)
    );
  }

  private async selectProject(projectId: string | undefined): Promise<void> {
    if (projectId == null) {
      this.projectId = undefined;
      this.projectDoc = undefined;
      return;
    }
    this.projectId = projectId;
    const projectDoc: SFProjectProfileDoc = await this.projectService.getProfile(projectId);
    // Make sure the project ID is still the same before updating the project document
    if (this.projectId === projectId) {
      this.projectDoc = projectDoc;
    }
  }
}

export class TestActiveProjectIdService implements IActiveProjectIdService {
  projectId$ = new BehaviorSubject<string | undefined>(this.projectId);
  constructor(private readonly projectId?: string) {}
}

@Injectable()
export class TestActivatedProjectService extends ActivatedProjectService {
  constructor(
    projectService: SFProjectService,
    cacheService: CacheService,
    @Inject(ActiveProjectIdService) activeProjectIdService: IActiveProjectIdService
  ) {
    super(projectService, cacheService, activeProjectIdService);
  }

  static withProjectId(projectId: string): TestActivatedProjectService {
    if (TestBed.inject(TestActivatedProjectServiceModule, null) == null) {
      throw new Error(
        'TestActivatedProjectService.withProjectId() requires TestActivatedProjectModule. ' +
          'Please add to TestBed imports:\n' +
          'imports: [TestActivatedProjectModule.forRoot({ projectId, sfProjectService, permissionsService })]'
      );
    }
    return TestBed.inject(TestActivatedProjectService);
  }
}

/** Provides test environment for components needing ActivatedProjectService */
@NgModule({})
export class TestActivatedProjectServiceModule {
  static forRoot(
    projectId: string,
    sfProjectService: SFProjectService,
    permissionsService: PermissionsService
  ): ModuleWithProviders<TestActivatedProjectServiceModule> {
    return {
      ngModule: TestActivatedProjectServiceModule,
      providers: [
        { provide: SFProjectService, useValue: instance(sfProjectService) },
        { provide: PermissionsService, useValue: instance(permissionsService) },
        {
          provide: ActivatedProjectService,
          useValue: new TestActivatedProjectService(
            instance(sfProjectService),
            new CacheService(instance(sfProjectService), instance(permissionsService)),
            new TestActiveProjectIdService(projectId)
          )
        }
      ]
    };
  }
}
