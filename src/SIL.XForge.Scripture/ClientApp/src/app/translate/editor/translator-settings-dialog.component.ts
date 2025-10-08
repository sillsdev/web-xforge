import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose
} from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, map, skip, startWith } from 'rxjs/operators';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TranslocoModule } from '@ngneat/transloco';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatCard, MatCardContent } from '@angular/material/card';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatSelect } from '@angular/material/select';
import { MatOption } from '@angular/material/autocomplete';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { MatButton } from '@angular/material/button';
import { AsyncPipe } from '@angular/common';

export const CONFIDENCE_THRESHOLD_TIMEOUT = 500;

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
    NoticeComponent,
    MatSlideToggle,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption,
    MatSlider,
    MatSliderThumb,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    AsyncPipe
  ]
})
export class TranslatorSettingsDialogComponent implements OnInit {
  readonly suggestionsEnabledSwitch = new FormControl<boolean>({
    value: false,
    disabled: !this.onlineStatusService.isOnline
  });
  readonly lynxMasterSwitch = new FormControl<boolean>(false);
  readonly lynxAssessmentsEnabled = new FormControl<boolean>(false);
  readonly lynxAutoCorrectEnabled = new FormControl<boolean>(false);

  showSuggestionsSettings = false;
  showLynxSettings = false;
  translationSuggestionsDisabled = false;
  lynxAssessmentsProjectEnabled = false;
  lynxAutoCorrectProjectEnabled = false;
  numSuggestions = '1';

  readonly confidenceThreshold$ = new BehaviorSubject<number>(20);

  private readonly projectDoc: SFProjectProfileDoc = this.data.projectDoc;
  private readonly projectUserConfigDoc: SFProjectUserConfigDoc = this.data.projectUserConfigDoc;

  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: TranslatorSettingsDialogData,
    readonly onlineStatusService: OnlineStatusService,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.updateComponentState();

    this.onlineStatusService.onlineStatus$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onOnlineStatusChange());

    this.projectDoc.changes$
      .pipe(startWith(null), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateComponentState());

    this.projectUserConfigDoc.changes$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateComponentState());

    this.confidenceThreshold$
      .pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(
        threshold =>
          void this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold))
      );
  }

  setConfidenceThreshold(value: number): void {
    this.confidenceThreshold$.next(value);
  }

  setNumSuggestions(value: string): void {
    this.numSuggestions = value;
    void this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.numSuggestions, parseInt(value, 10)));
  }

  setTranslationSettingsEnabled(value: boolean): void {
    void this.projectUserConfigDoc.submitJson0Op(op =>
      op.set<boolean>(puc => puc.translationSuggestionsEnabled, value)
    );
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
  private get translationSuggestionsUserEnabled(): boolean {
    return this.projectUserConfigDoc.data?.translationSuggestionsEnabled ?? true;
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

  private onOnlineStatusChange(): void {
    if (this.onlineStatusService.isOnline) {
      this.suggestionsEnabledSwitch.enable();
      this.translationSuggestionsDisabled = !this.translationSuggestionsUserEnabled;
    } else {
      this.suggestionsEnabledSwitch.disable();
      this.translationSuggestionsDisabled = true;
    }
  }

  private updateComponentState(): void {
    this.showSuggestionsSettings = !!this.projectDoc.data?.translateConfig.translationSuggestionsEnabled;
    this.lynxAssessmentsProjectEnabled = !!this.projectDoc.data?.lynxConfig?.assessmentsEnabled;
    this.lynxAutoCorrectProjectEnabled = !!this.projectDoc.data?.lynxConfig?.autoCorrectionsEnabled;
    this.showLynxSettings = this.lynxAssessmentsProjectEnabled || this.lynxAutoCorrectProjectEnabled;
    this.translationSuggestionsDisabled = !this.translationSuggestionsUserEnabled || !this.onlineStatusService.isOnline;

    if (this.projectUserConfigDoc.data != null) {
      const percent = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.numSuggestions = this.projectUserConfigDoc.data.numSuggestions.toString();
      this.confidenceThreshold$.next(percent);
    }

    // Update form control state
    this.suggestionsEnabledSwitch.setValue(this.translationSuggestionsUserEnabled, { emitEvent: false });
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
