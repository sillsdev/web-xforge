import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LynxUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/lynx-config';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, map, skip, startWith } from 'rxjs/operators';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';

export const CONFIDENCE_THRESHOLD_TIMEOUT = 500;

export interface TranslatorSettingsDialogData {
  projectDoc: SFProjectProfileDoc;
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

@Component({
  templateUrl: './translator-settings-dialog.component.html',
  styleUrls: ['./translator-settings-dialog.component.scss']
})
export class TranslatorSettingsDialogComponent implements OnInit {
  suggestionsEnabledSwitch = new FormControl<boolean>({ value: false, disabled: !this.onlineStatusService.isOnline });
  lynxMasterSwitch = new FormControl<boolean>(false);
  lynxAssessmentsEnabled = new FormControl<boolean>(false);
  lynxAutoCorrectEnabled = new FormControl<boolean>(false);

  private readonly projectDoc: SFProjectProfileDoc = this.data.projectDoc;
  private readonly projectUserConfigDoc: SFProjectUserConfigDoc = this.data.projectUserConfigDoc;
  private confidenceThreshold$ = new BehaviorSubject<number>(20);

  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: TranslatorSettingsDialogData,
    readonly onlineStatusService: OnlineStatusService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    if (this.projectUserConfigDoc.data != null) {
      const percent = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.confidenceThreshold$.next(percent);
    }

    this.suggestionsEnabledSwitch.setValue(this.translationSuggestionsUserEnabled);
    this.lynxAssessmentsEnabled.setValue(this.lynxAssessmentsUserEnabled);
    this.lynxAutoCorrectEnabled.setValue(this.lynxAutoCorrectUserEnabled);
    this.lynxMasterSwitch.setValue(this.lynxMasterEnabled);

    combineLatest([this.onlineStatusService.onlineStatus$, this.projectDoc.changes$.pipe(startWith(null))])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateTranslationSuggestionsSwitch();
      });

    this.projectUserConfigDoc.changes$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateTranslationSuggestionsSwitch();
      this.lynxAssessmentsEnabled.setValue(this.lynxAssessmentsUserEnabled, { emitEvent: false });
      this.lynxAutoCorrectEnabled.setValue(this.lynxAutoCorrectUserEnabled, { emitEvent: false });
      this.lynxMasterSwitch.setValue(this.lynxMasterEnabled, { emitEvent: false });
    });

    this.confidenceThreshold$
      .pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(threshold =>
        this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold))
      );
  }

  get translationSuggestionsDisabled(): boolean {
    return !this.translationSuggestionsUserEnabled || !this.onlineStatusService.isOnline;
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

  get lynxAssessmentsUserEnabled(): boolean {
    return this.projectUserConfigDoc.data?.lynxUserConfig?.assessmentsEnabled ?? false;
  }

  get lynxAutoCorrectUserEnabled(): boolean {
    return this.projectUserConfigDoc.data?.lynxUserConfig?.autoCorrectionsEnabled ?? false;
  }

  get lynxAssessmentsProjectEnabled(): boolean {
    return !!this.projectDoc.data?.lynxConfig?.assessmentsEnabled;
  }

  get lynxAutoCorrectProjectEnabled(): boolean {
    return !!this.projectDoc.data?.lynxConfig?.autoCorrectionsEnabled;
  }

  get lynxMasterEnabled(): boolean {
    return (
      (this.lynxAssessmentsProjectEnabled && this.lynxAssessmentsUserEnabled) ||
      (this.lynxAutoCorrectProjectEnabled && this.lynxAutoCorrectUserEnabled)
    );
  }

  get showSuggestionsSettings(): boolean {
    return !!this.projectDoc.data?.translateConfig.translationSuggestionsEnabled;
  }

  get showLynxSettings(): boolean {
    return this.lynxAssessmentsProjectEnabled || this.lynxAutoCorrectProjectEnabled;
  }

  setTranslationSettingsEnabled(value: boolean): void {
    this.projectUserConfigDoc.submitJson0Op(op => op.set<boolean>(puc => puc.translationSuggestionsEnabled, value));
  }

  updateTranslationSuggestionsSwitch(): void {
    if (this.onlineStatusService.isOnline) {
      this.suggestionsEnabledSwitch.enable();
    } else {
      this.suggestionsEnabledSwitch.disable();
    }
  }

  setLynxAssessmentsEnabled(value: boolean): void {
    this.updateLynxUserConfig({ assessmentsEnabled: value });
  }

  setLynxAutoCorrectEnabled(value: boolean): void {
    this.updateLynxUserConfig({ autoCorrectionsEnabled: value });
  }

  setLynxMasterEnabled(value: boolean): void {
    this.updateLynxUserConfig({
      assessmentsEnabled: value,
      autoCorrectionsEnabled: value
    });
  }

  private updateLynxUserConfig(updates: Partial<LynxUserConfig>): void {
    this.projectUserConfigDoc.submitJson0Op(op => {
      const currentData = this.projectUserConfigDoc.data as any;
      if (currentData?.lynxUserConfig == null) {
        op.set(puc => puc.lynxUserConfig, {
          assessmentsEnabled: true,
          autoCorrectionsEnabled: true,
          ...updates
        });
      } else {
        for (const [key, value] of Object.entries(updates)) {
          op.set(puc => puc.lynxUserConfig![key], value);
        }
      }
    });
  }
}
