import { Component, Input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';

@Component({
  selector: 'app-display-confidence',
  templateUrl: './display-confidence.component.html',
  styleUrl: './display-confidence.component.scss',
  imports: [MatIcon, MatTooltip, TranslocoModule]
})
/**
 * Displays the confidence value in an human-friendly format.
 */
export class DisplayConfidenceComponent {
  @Input() showText: boolean | undefined;
  @Input() lowConfidence: boolean | undefined;
}
