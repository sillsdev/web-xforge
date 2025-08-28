import { ClipboardModule } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { LocationService } from 'xforge-common/location.service';
import { quietTakeUntilDestroyed } from '../../../xforge-common/util/rxjs-util';

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
export class CreateSourcesLinkComponent {
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

  constructor(
    private snackBar: MatSnackBar,
    private activatedProjectService: ActivatedProjectService,
    private locationService: LocationService,
    private destroyRef: DestroyRef
  ) {
    this.sourcesForm.valueChanges.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.generateLink();
    });
  }

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
