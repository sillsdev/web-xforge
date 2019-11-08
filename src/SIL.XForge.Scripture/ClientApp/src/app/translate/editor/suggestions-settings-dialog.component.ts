import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web/dialog';
import { MdcSlider } from '@angular-mdc/web/slider';
import { Component, Inject, ViewChild } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, map, skip } from 'rxjs/operators';
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
  @ViewChild('confidenceThresholdSlider', { static: false }) confidenceThresholdSlider?: MdcSlider;
  open: boolean = false;

  private readonly projectUserConfigDoc: SFProjectUserConfigDoc;
  private confidenceThreshold$ = new BehaviorSubject<number>(20);

  constructor(
    dialogRef: MdcDialogRef<SuggestionsSettingsDialogComponent>,
    @Inject(MDC_DIALOG_DATA) data: SuggestionsSettingsDialogData
  ) {
    super();
    this.projectUserConfigDoc = data.projectUserConfigDoc;

    dialogRef.afterOpened().subscribe(() => {
      if (this.confidenceThresholdSlider != null) {
        this.confidenceThresholdSlider.layout();
      }
      this.open = true;
    });

    if (this.projectUserConfigDoc.data != null) {
      const pcnt = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.confidenceThreshold$.next(pcnt);
    }

    this.subscribe(
      this.confidenceThreshold$.pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100)
      ),
      threshold => this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold))
    );
  }

  get translationSuggestionsUserEnabled(): boolean {
    return this.projectUserConfigDoc.data == null ? true : this.projectUserConfigDoc.data.translationSuggestionsEnabled;
  }

  set translationSuggestionsUserEnabled(value: boolean) {
    this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.translationSuggestionsEnabled, value));
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
