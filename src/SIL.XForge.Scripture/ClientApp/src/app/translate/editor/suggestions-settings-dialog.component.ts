import { Component, Inject, ViewChild } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSlider } from '@angular/material/slider';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, map, skip } from 'rxjs/operators';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';

export const CONFIDENCE_THRESHOLD_TIMEOUT = 500;

export interface SuggestionsSettingsDialogData {
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

@Component({
  templateUrl: './suggestions-settings-dialog.component.html',
  styleUrls: ['./suggestions-settings-dialog.component.scss']
})
export class SuggestionsSettingsDialogComponent extends SubscriptionDisposable {
  @ViewChild('confidenceThresholdSlider') confidenceThresholdSlider?: MatSlider;

  suggestionsEnabledSwitch = new UntypedFormControl();

  private readonly projectUserConfigDoc: SFProjectUserConfigDoc;
  private confidenceThreshold$ = new BehaviorSubject<number>(20);

  constructor(
    dialogRef: MatDialogRef<SuggestionsSettingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: SuggestionsSettingsDialogData,
    readonly pwaService: PwaService
  ) {
    super();
    this.projectUserConfigDoc = data.projectUserConfigDoc;

    dialogRef.afterOpened().subscribe(() => {
      if (this.confidenceThresholdSlider != null) {
        this.confidenceThresholdSlider.disabled = false; // cannot set value when slider is disabled
        this.confidenceThresholdSlider.value = this.projectUserConfigDoc.data!.confidenceThreshold * 100;
        this.confidenceThresholdSlider.disabled = this.settingsDisabled;
      }
    });

    if (this.projectUserConfigDoc.data != null) {
      const percent = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.confidenceThreshold$.next(percent);
    }

    this.suggestionsEnabledSwitch.setValue(this.translationSuggestionsUserEnabled);

    this.subscribe(
      this.confidenceThreshold$.pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100)
      ),
      threshold => this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold))
    );
  }

  setTranslationSettingsEnabled(value: boolean): void {
    this.projectUserConfigDoc.submitJson0Op(op => op.set<boolean>(puc => puc.translationSuggestionsEnabled, value));
  }

  get settingsDisabled(): boolean {
    return !this.translationSuggestionsUserEnabled || !this.pwaService.isOnline;
  }

  get translationSuggestionsUserEnabled(): boolean {
    return this.projectUserConfigDoc.data == null ? true : this.projectUserConfigDoc.data.translationSuggestionsEnabled;
  }

  get numSuggestions(): string {
    return this.projectUserConfigDoc.data == null ? '1' : this.projectUserConfigDoc.data.numSuggestions.toString();
  }

  set numSuggestions(value: string) {
    this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.numSuggestions, parseInt(value, 10)));
  }

  get confidenceThreshold(): number {
    return this.confidenceThreshold$.value;
  }

  set confidenceThreshold(value: number) {
    this.confidenceThreshold$.next(value);
  }
}
