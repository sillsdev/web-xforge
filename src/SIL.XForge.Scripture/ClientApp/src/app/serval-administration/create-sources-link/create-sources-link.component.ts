import { ClipboardModule } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from '../../../xforge-common/notice.service';
import { NoticeComponent } from '../../shared/notice/notice.component';

// As of 2025-09-09 this matches all short names in our database
const ptProjectShortNameRegex = /^[\-_a-z0-9]+$/i;

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
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ClipboardModule,
    MatSnackBarModule,
    NoticeComponent
  ]
})
export class CreateSourcesLinkComponent {
  trainingSources = new FormControl('');
  draftingSources = new FormControl('');

  sourcesForm = new FormGroup({
    trainingSources: this.trainingSources,
    draftingSources: this.draftingSources
  });

  generatedLink: string = '';

  errorMessage: string | null = null;

  constructor(
    private activatedProjectService: ActivatedProjectService,
    private locationService: LocationService,
    private noticeService: NoticeService
  ) {}

  get link(): string | null {
    const projectId = this.activatedProjectService.projectId;
    const trainingSources = this.shortNamesFromInput(this.trainingSources?.value ?? '');
    const draftingSources = this.shortNamesFromInput(this.draftingSources?.value ?? '');

    if (projectId == null) return null;

    const invalidShortNames = [...trainingSources, ...draftingSources].filter(sn => !ptProjectShortNameRegex.test(sn));
    if (invalidShortNames.length > 0) {
      this.errorMessage = `Invalid project short names: ${invalidShortNames.join(', ')}`;
      return null;
    } else {
      this.errorMessage = null;
    }

    if (trainingSources.length > 2) this.errorMessage = 'You can specify a maximum of 2 training sources.';
    if (draftingSources.length > 1) this.errorMessage = 'You can specify only 1 drafting source.';
    if (trainingSources.length === 0 || draftingSources.length === 0) return null;

    const url = new URL(this.locationService.origin);
    url.pathname = `/projects/${projectId}/draft-generation/sources`;
    url.searchParams.set('trainingSources', trainingSources.join(','));
    url.searchParams.set('draftingSources', draftingSources.join(','));

    return url.toString();
  }

  shortNamesFromInput(input: string): string[] {
    return (input.trim() || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '');
  }

  selectAllText(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  async copyLink(): Promise<void> {
    if (this.link == null) throw new Error('No link to copy');

    try {
      await navigator.clipboard.writeText(this.link);
      this.noticeService.show('Link copied to clipboard');
    } catch {
      this.noticeService.showError('Failed to copy link');
    }
  }
}
