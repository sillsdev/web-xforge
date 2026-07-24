import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { ExperimentalFeature, ExperimentalFeaturesService } from './experimental-features.service';

@Component({
  templateUrl: './experimental-features-dialog.component.html',
  styleUrls: ['./experimental-features-dialog.component.scss'],
  imports: [
    TranslocoModule,
    MatDialogTitle,
    MatIcon,
    MatIconButton,
    CdkScrollable,
    MatDialogContent,
    MatDialogClose,
    MatCheckbox,
    MatDivider,
    FormsModule
  ]
})
export class ExperimentalFeaturesDialogComponent {
  constructor(readonly experimentalFeatures: ExperimentalFeaturesService) {}

  get availableExperimentalFeatures(): ExperimentalFeature[] {
    return this.experimentalFeatures.availableExperimentalFeatures;
  }
}
