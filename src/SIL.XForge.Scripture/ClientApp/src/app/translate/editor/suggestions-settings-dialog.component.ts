import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSlider } from '@angular/material/slider';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, map, skip } from 'rxjs/operators';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../core/sf-project.service';

export const CONFIDENCE_THRESHOLD_TIMEOUT = 500;

export interface SuggestionsSettingsDialogData {
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

@Component({
  templateUrl: './suggestions-settings-dialog.component.html',
  styleUrls: ['./suggestions-settings-dialog.component.scss']
})
export class SuggestionsSettingsDialogComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild('confidenceThresholdSlider') confidenceThresholdSlider?: MatSlider;
  open: boolean = false;

  suggestionsEnabledSwitch = new UntypedFormControl();
  biblicalTermsEnabledSwitch = new UntypedFormControl();
  transliterateBiblicalTermsSwitch = new UntypedFormControl();
  form = new UntypedFormGroup({
    suggestionsEnabledSwitch: this.suggestionsEnabledSwitch,
    biblicalTermsEnabledSwitch: this.biblicalTermsEnabledSwitch,
    transliterateBiblicalTermsSwitch: this.transliterateBiblicalTermsSwitch
  });

  private projectDoc?: SFProjectDoc;
  private readonly projectUserConfigDoc: SFProjectUserConfigDoc;
  private confidenceThreshold$ = new BehaviorSubject<number>(20);

  constructor(
    private dialogRef: MatDialogRef<SuggestionsSettingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: SuggestionsSettingsDialogData,
    private readonly projectService: SFProjectService,
    readonly pwaService: PwaService
  ) {
    super();
    this.projectUserConfigDoc = data.projectUserConfigDoc;
  }

  async ngOnInit(): Promise<void> {
    this.dialogRef.afterOpened().subscribe(() => {
      if (this.confidenceThresholdSlider != null) {
        this.confidenceThresholdSlider.disabled = false; // cannot set value when slider is disabled
        this.confidenceThresholdSlider.value = this.projectUserConfigDoc.data!.confidenceThreshold * 100;
        this.confidenceThresholdSlider.disabled = this.translationSuggestionsDisabled;
      }
      this.open = true;
    });

    if (this.projectUserConfigDoc.data != null) {
      const percent = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.confidenceThreshold$.next(percent);
      this.projectDoc = await this.projectService.get(this.projectUserConfigDoc.data.projectRef);
    }

    this.subscribe(
      this.confidenceThreshold$.pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100)
      ),
      threshold => this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold))
    );

    this.suggestionsEnabledSwitch.setValue(this.translationSuggestionsUserEnabled);
    this.subscribe(this.suggestionsEnabledSwitch.valueChanges, () => {
      this.projectUserConfigDoc.submitJson0Op(op =>
        op.set<boolean>(puc => puc.translationSuggestionsEnabled, this.suggestionsEnabledSwitch.value)
      );
    });

    this.biblicalTermsEnabledSwitch.setValue(this.biblicalTermsEnabled);
    this.subscribe(this.biblicalTermsEnabledSwitch.valueChanges, () => {
      if (this.biblicalTermsEnabledSwitch.value) {
        this.transliterateBiblicalTermsSwitch.enable();
      } else {
        this.transliterateBiblicalTermsSwitch.disable();
      }
      this.projectUserConfigDoc.submitJson0Op(op =>
        op.set<boolean>(puc => puc.biblicalTermsEnabled, this.biblicalTermsEnabledSwitch.value)
      );
    });

    this.transliterateBiblicalTermsSwitch.setValue(this.transliterateBiblicalTerms);
    this.subscribe(this.transliterateBiblicalTermsSwitch.valueChanges, () => {
      this.projectUserConfigDoc.submitJson0Op(op =>
        op.set<boolean>(puc => puc.transliterateBiblicalTerms, this.transliterateBiblicalTermsSwitch.value)
      );
    });

    this.subscribe(this.pwaService.onlineStatus$, isOnline => {
      isOnline ? this.form.enable() : this.form.disable();
    });

    this.subscribe(this.projectDoc!.changes$, () => {
      this.updateSwitchDisabledStates();
    });
    this.updateSwitchDisabledStates();
  }

  // This one!
  get translationSettingsDisabled(): boolean {
    return !this.projectDoc?.data?.translateConfig.translationSuggestionsEnabled || !this.pwaService.isOnline;
  }

  get translationSuggestionsDisabled(): boolean {
    return this.translationSettingsDisabled || !this.translationSuggestionsUserEnabled;
  }

  // This one!
  get biblicalTermsSettingsDisabled(): boolean {
    return !this.projectDoc?.data?.biblicalTermsEnabled || !this.pwaService.isOnline;
  }

  get biblicalTermsEnabled(): boolean {
    return this.projectUserConfigDoc.data == null ? true : this.projectUserConfigDoc.data.biblicalTermsEnabled;
  }

  get transliterateBiblicalTerms(): boolean {
    return this.projectUserConfigDoc.data == null ? true : this.projectUserConfigDoc.data.transliterateBiblicalTerms;
  }

  // This one!
  get transliterateBiblicalTermsDisabled(): boolean {
    return this.biblicalTermsSettingsDisabled || !this.biblicalTermsEnabled;
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

  updateSwitchDisabledStates(): void {
    if (this.pwaService.isOnline && this.projectDoc?.data?.translateConfig.translationSuggestionsEnabled === true) {
      this.suggestionsEnabledSwitch.enable();
    } else {
      this.suggestionsEnabledSwitch.disable();
    }
    if (this.pwaService.isOnline && this.projectDoc?.data?.biblicalTermsEnabled === true) {
      this.biblicalTermsEnabledSwitch.enable();
      if (this.projectUserConfigDoc.data?.biblicalTermsEnabled) {
        this.transliterateBiblicalTermsSwitch.enable();
      } else {
        this.transliterateBiblicalTermsSwitch.disable();
      }
    } else {
      this.biblicalTermsEnabledSwitch.disable();
      this.transliterateBiblicalTermsSwitch.disable();
    }
  }
}
