import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@ngneat/transloco';
import { startWith } from 'rxjs/operators';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';

export interface TranslatorSettingsDialogData {
  projectDoc: SFProjectProfileDoc;
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

@Component({
  templateUrl: './translator-settings-dialog.component.html',
  styleUrls: ['./translator-settings-dialog.component.scss'],
  imports: [
    TranslocoModule,
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatCard,
    MatCardContent,
    MatSlideToggle,
    FormsModule,
    ReactiveFormsModule,
    MatDialogActions,
    MatButton,
    MatDialogClose
  ]
})
export class TranslatorSettingsDialogComponent implements OnInit {
  readonly lynxMasterSwitch = new FormControl<boolean>(false);
  readonly lynxAssessmentsEnabled = new FormControl<boolean>(false);
  readonly lynxAutoCorrectEnabled = new FormControl<boolean>(false);

  showLynxSettings = false;
  lynxAssessmentsProjectEnabled = false;
  lynxAutoCorrectProjectEnabled = false;

  private readonly projectDoc: SFProjectProfileDoc = this.data.projectDoc;
  private readonly projectUserConfigDoc: SFProjectUserConfigDoc = this.data.projectUserConfigDoc;

  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: TranslatorSettingsDialogData,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.updateComponentState();

    this.projectDoc.changes$
      .pipe(startWith(null), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateComponentState());

    this.projectUserConfigDoc.changes$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateComponentState());
  }

  setLynxAssessmentsEnabled(value: boolean): void {
    this.updateLynxInsightState({ assessmentsEnabled: value });
  }

  setLynxAutoCorrectEnabled(value: boolean): void {
    this.updateLynxInsightState({ autoCorrectionsEnabled: value });
  }

  setLynxMasterEnabled(value: boolean): void {
    this.updateLynxInsightState({
      assessmentsEnabled: value,
      autoCorrectionsEnabled: value
    });
  }

  private get lynxAssessmentsUserEnabled(): boolean {
    return this.projectUserConfigDoc.data?.lynxInsightState?.assessmentsEnabled ?? true;
  }

  private get lynxAutoCorrectUserEnabled(): boolean {
    return this.projectUserConfigDoc.data?.lynxInsightState?.autoCorrectionsEnabled ?? true;
  }

  private get lynxMasterEnabled(): boolean {
    return (
      (this.lynxAssessmentsProjectEnabled && this.lynxAssessmentsUserEnabled) ||
      (this.lynxAutoCorrectProjectEnabled && this.lynxAutoCorrectUserEnabled)
    );
  }

  private updateComponentState(): void {
    this.lynxAssessmentsProjectEnabled = !!this.projectDoc.data?.lynxConfig?.assessmentsEnabled;
    this.lynxAutoCorrectProjectEnabled = !!this.projectDoc.data?.lynxConfig?.autoCorrectionsEnabled;
    this.showLynxSettings = this.lynxAssessmentsProjectEnabled || this.lynxAutoCorrectProjectEnabled;

    // Update form control state
    this.lynxAssessmentsEnabled.setValue(this.lynxAssessmentsUserEnabled, { emitEvent: false });
    this.lynxAutoCorrectEnabled.setValue(this.lynxAutoCorrectUserEnabled, { emitEvent: false });
    this.lynxMasterSwitch.setValue(this.lynxMasterEnabled, { emitEvent: false });
  }

  private updateLynxInsightState(updates: { assessmentsEnabled?: boolean; autoCorrectionsEnabled?: boolean }): void {
    void this.projectUserConfigDoc.submitJson0Op(op => {
      if (this.projectUserConfigDoc.data?.lynxInsightState == null) {
        op.set(puc => puc.lynxInsightState, {});
      }

      for (const [key, value] of Object.entries(updates)) {
        op.set(puc => puc.lynxInsightState[key], value);
      }
    });
  }
}
