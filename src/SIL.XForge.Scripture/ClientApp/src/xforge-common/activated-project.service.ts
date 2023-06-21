import { Injectable } from '@angular/core';
import { ActivationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { SubscriptionDisposable } from './subscription-disposable';

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
@Injectable({
  providedIn: 'root'
})
export class ActivatedProjectService extends SubscriptionDisposable {
  private _projectId$ = new BehaviorSubject<string | undefined>(undefined);
  private _projectDoc$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);

  constructor(private readonly router: Router, private readonly projectService: SFProjectService) {
    super();

    this.subscribe(this.router.events.pipe(), event => {
      if (event instanceof ActivationEnd) {
        this.selectProject(event.snapshot.params.projectId);
      }
    });
  }

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
    }
  }

  get projectDoc$(): Observable<SFProjectProfileDoc | undefined> {
    return this._projectDoc$;
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
