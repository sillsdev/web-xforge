import { ClipboardModule } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, debounceTime, distinctUntilChanged, Observable, of, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { LocationService } from 'xforge-common/location.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../../core/sf-project.service';

/**
 * Component for generating links to the draft sources configuration page with pre-filled project short names.
 * Allows users to input training source project short names and a single draft source project short name,
 * then generates a URL with query parameters. Validates that the specified projects exist.
 */
@Component({
  selector: 'app-create-sources-link',
  templateUrl: './create-sources-link.component.html',
  styleUrls: ['./create-sources-link.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ClipboardModule,
    MatSnackBarModule
  ]
})
export class CreateSourcesLinkComponent implements OnInit {
  sourcesForm = new FormGroup({
    trainingSources: new FormControl(''),
    draftingSources: new FormControl('')
  });

  generatedLink: string = '';

  // Validation state
  trainingSourcesValid: boolean = true;
  draftingSourceValid: boolean = true;
  validatingTrainingSources: boolean = false;
  validatingDraftingSource: boolean = false;

  // Cache for project validation
  private projectCache = new Map<string, boolean>();

  constructor(
    private snackBar: MatSnackBar,
    private activatedProjectService: ActivatedProjectService,
    private locationService: LocationService,
    private projectService: SFProjectService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    // Set up form validation with debouncing
    this.setupFormValidation();
  }

  private setupFormValidation(): void {
    // Debounced validation for training sources
    this.sourcesForm
      .get('trainingSources')
      ?.valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.validateTrainingSources(value?.trim() || '')),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    // Debounced validation for drafting source
    this.sourcesForm
      .get('draftingSources')
      ?.valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.validateDraftingSource(value?.trim() || '')),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    // Generate link when form changes (without debounce for immediate feedback)
    this.sourcesForm.valueChanges.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => this.generateLink());
  }

  private validateTrainingSources(value: string): Observable<boolean> {
    if (!value) {
      this.trainingSourcesValid = true;
      this.validatingTrainingSources = false;
      return new BehaviorSubject(true);
    }

    this.validatingTrainingSources = true;
    const shortNames = value
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    return new Observable(observer => {
      Promise.all(shortNames.map(shortName => this.isProjectValid(shortName)))
        .then(results => {
          this.trainingSourcesValid = results.every(result => result);
          this.validatingTrainingSources = false;
          observer.next(this.trainingSourcesValid);
          observer.complete();
        })
        .catch(() => {
          this.trainingSourcesValid = false;
          this.validatingTrainingSources = false;
          observer.next(false);
          observer.complete();
        });
    });
  }

  private validateDraftingSource(value: string): Observable<boolean> {
    if (!value) {
      this.draftingSourceValid = true;
      this.validatingDraftingSource = false;
      return new BehaviorSubject(true);
    }

    this.validatingDraftingSource = true;

    return new Observable(observer => {
      this.isProjectValid(value)
        .then(isValid => {
          this.draftingSourceValid = isValid;
          this.validatingDraftingSource = false;
          observer.next(isValid);
          observer.complete();
        })
        .catch(() => {
          this.draftingSourceValid = false;
          this.validatingDraftingSource = false;
          observer.next(false);
          observer.complete();
        });
    });
  }

  private async isProjectValid(shortName: string): Promise<boolean> {
    // Check cache first
    if (this.projectCache.has(shortName)) {
      return this.projectCache.get(shortName)!;
    }

    let exists = false;
    try {
      // Use the project service's onlineQuery to search for projects by shortName
      const term$ = of(shortName);
      const queryParameters$: Observable<QueryParameters> = of({});

      // Query projects by shortName using the project service
      const query = this.projectService.onlineQuery(term$, queryParameters$, ['shortName']);

      // Get the query result and check if any projects match
      const queryResult = await new Promise((resolve, reject) => {
        query.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe({
          next: result => resolve(result),
          error: error => reject(error)
        });
      });

      // Check if we found any projects with this shortName
      exists = queryResult && (queryResult as any).docs && (queryResult as any).docs.length > 0;

      // Cache the result
      this.projectCache.set(shortName, exists);
    } catch (error) {
      console.warn('Error validating project:', error);
      exists = false;
      // Cache negative result
      this.projectCache.set(shortName, false);
    }

    return exists;
  }

  /**
   * Generates a link to the draft sources component with query parameters for the specified project short names.
   * Only generates a link if all specified projects are valid.
   */
  generateLink(): void {
    const trainingSources = this.sourcesForm.get('trainingSources')?.value?.trim() || '';
    const draftingSources = this.sourcesForm.get('draftingSources')?.value?.trim() || '';

    if (trainingSources === '' && draftingSources === '') {
      this.generatedLink = '';
      return;
    }

    // Don't generate link if validation is in progress or sources are invalid
    if (
      this.validatingTrainingSources ||
      this.validatingDraftingSource ||
      !this.trainingSourcesValid ||
      !this.draftingSourceValid
    ) {
      this.generatedLink = '';
      return;
    }

    // Get the project ID from the activated project service
    const projectId = this.activatedProjectService.projectId;
    if (projectId == null) {
      this.generatedLink = '';
      return;
    }

    // Build the base URL for the draft sources component using location service
    const baseUrl = `${this.locationService.origin}/projects/${projectId}/draft-generation/sources`;

    // Create query parameters for the project short names
    const queryParams: string[] = [];
    if (trainingSources !== '') {
      queryParams.push(`trainingSources=${encodeURIComponent(trainingSources)}`);
    }
    if (draftingSources !== '') {
      queryParams.push(`draftingSources=${encodeURIComponent(draftingSources)}`);
    }

    this.generatedLink = queryParams.length > 0 ? `${baseUrl}?${queryParams.join('&')}` : baseUrl;
  }

  /**
   * Copies the generated link to the clipboard and shows a confirmation message.
   */
  copyLink(): void {
    if (this.generatedLink) {
      navigator.clipboard
        .writeText(this.generatedLink)
        .then(() => {
          this.snackBar.open('Link copied to clipboard', 'Close', {
            duration: 3000
          });
        })
        .catch(() => {
          this.snackBar.open('Failed to copy link', 'Close', {
            duration: 3000
          });
        });
    }
  }
}
