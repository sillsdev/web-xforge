import { Component, Input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Confidence, UsabilityLabel } from './build-confidences';

@Component({
  selector: 'app-display-confidence',
  templateUrl: './display-confidence.component.html',
  styleUrl: './display-confidence.component.scss',
  imports: [MatIcon]
})
/**
 * Displays the confidence value in an human-friendly format.
 *
 * NOTE: This component is not yet localized as it is only used by the Serval Builds tab, and is not yet finalized.
 */
export class DisplayConfidenceComponent {
  @Input() confidence: Confidence | undefined;

  get usabilityLabel(): UsabilityLabel | undefined {
    return this.confidence?.label;
  }
}
