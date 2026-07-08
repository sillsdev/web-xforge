import { Component, Input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { Confidence, UsabilityLabel } from './build-confidences';

interface UsabilityDisplay {
  icon: string;
  outlined?: boolean;
  color: string;
  i18nKey: string;
}

const USABILITY_DISPLAY: Record<UsabilityLabel, UsabilityDisplay> = {
  [UsabilityLabel.Green]: { icon: 'check_circle', color: 'green', i18nKey: 'likely_useful' },
  [UsabilityLabel.Yellow]: { icon: 'circle', color: 'yellow', i18nKey: 'probably_useful' },
  [UsabilityLabel.Red]: { icon: 'error', color: 'red', i18nKey: 'may_not_be_useful' }
};

const NOT_CONFIGURED_DISPLAY: UsabilityDisplay = {
  icon: 'circle',
  outlined: true,
  color: 'grey',
  i18nKey: 'not_configured'
};

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
  @Input() confidence: Confidence | undefined;
  @Input() showText = true;

  get display(): UsabilityDisplay {
    const label = this.confidence?.label;
    return label != null && label in USABILITY_DISPLAY ? USABILITY_DISPLAY[label] : NOT_CONFIGURED_DISPLAY;
  }
}
