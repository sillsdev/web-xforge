import { Component, Input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { Confidence, UsabilityLabel } from './build-confidences';

@Component({
  selector: 'app-display-confidence',
  templateUrl: './display-confidence.component.html',
  styleUrl: './display-confidence.component.scss',
  imports: [MatIcon, MatTooltip]
})
/**
 * Displays the confidence value in an human-friendly format.
 *
 * NOTE: This component is not yet localized as it is only used by the Serval Builds tab, and is not yet finalized.
 */
export class DisplayConfidenceComponent {
  @Input() confidence: Confidence | undefined;
  @Input() showText: boolean | undefined;

  UsabilityLabel = UsabilityLabel;

  get usabilityLabel(): UsabilityLabel | undefined {
    return this.confidence?.label;
  }

  get usabilityText(): string {
    return this.showText === false ? '' : this.usabilityTooltip;
  }

  get usabilityTooltip(): string {
    switch (this.usabilityLabel) {
      case UsabilityLabel.Green:
        return 'Likely good quality';
      case UsabilityLabel.Yellow:
        return 'Likely moderate quality';
      case UsabilityLabel.Red:
        return 'Likely poor quality';
      default:
        return 'Not configured';
    }
  }
}
