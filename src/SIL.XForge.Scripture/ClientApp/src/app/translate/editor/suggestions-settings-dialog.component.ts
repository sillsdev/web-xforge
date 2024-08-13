import { Component, Inject } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, map, skip } from 'rxjs/operators';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';

export const CONFIDENCE_THRESHOLD_TIMEOUT = 500;

export interface SuggestionsSettingsDialogData {
  projectDoc: SFProjectProfileDoc;
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

@Component({
  templateUrl: './suggestions-settings-dialog.component.html',
  styleUrls: ['./suggestions-settings-dialog.component.scss']
})
export class SuggestionsSettingsDialogComponent extends SubscriptionDisposable {
  suggestionsEnabledSwitch = new UntypedFormControl({ disabled: !this.onlineStatusService.isOnline });
  transliterateBiblicalTermsSwitch = new UntypedFormControl({ disabled: !this.onlineStatusService.isOnline });

  private readonly projectDoc: SFProjectProfileDoc;
  private readonly projectUserConfigDoc: SFProjectUserConfigDoc;
  private confidenceThreshold$ = new BehaviorSubject<number>(20);

  constructor(
    @Inject(MAT_DIALOG_DATA) data: SuggestionsSettingsDialogData,
    readonly onlineStatusService: OnlineStatusService
  ) {
    super();
    this.projectDoc = data.projectDoc;
    this.projectUserConfigDoc = data.projectUserConfigDoc;

    if (this.projectUserConfigDoc.data != null) {
      const percent = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.confidenceThreshold$.next(percent);
    }

    this.suggestionsEnabledSwitch.setValue(this.translationSuggestionsUserEnabled);
    this.transliterateBiblicalTermsSwitch.setValue(this.transliterateBiblicalTerms);
    onlineStatusService.onlineStatus$.subscribe(() => {
      this.updateSwitches();
    });
    this.projectDoc.changes$.subscribe(() => {
      this.updateSwitches();
    });
    this.projectUserConfigDoc.changes$.subscribe(() => {
      this.updateSwitches();
    });
    this.updateSwitches();

    this.subscribe(
      this.confidenceThreshold$.pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100)
      ),
      threshold => this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold))
    );
  }
  setTransliterateBiblicalTerms(value: boolean): void {
    this.projectUserConfigDoc.submitJson0Op(op => op.set<boolean>(puc => puc.transliterateBiblicalTerms, value));
  }

  setTranslationSettingsEnabled(value: boolean): void {
    this.projectUserConfigDoc.submitJson0Op(op => op.set<boolean>(puc => puc.translationSuggestionsEnabled, value));
  }

  updateSwitches(): void {
    if (this.canUseTranslationSuggestions && this.onlineStatusService.isOnline) {
      this.suggestionsEnabledSwitch.enable();
    } else {
      this.suggestionsEnabledSwitch.disable();
    }
    if (this.canUseBiblicalTerms && this.onlineStatusService.isOnline) {
      this.transliterateBiblicalTermsSwitch.enable();
    } else {
      this.transliterateBiblicalTermsSwitch.disable();
    }
  }

  get translationSuggestionsDisabled(): boolean {
    return (
      !this.translationSuggestionsUserEnabled ||
      !this.canUseTranslationSuggestions ||
      !this.onlineStatusService.isOnline
    );
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

  get transliterateBiblicalTerms(): boolean {
    return this.projectUserConfigDoc.data == null ? true : this.projectUserConfigDoc.data.transliterateBiblicalTerms;
  }

  get canUseBiblicalTerms(): boolean {
    const userRole: string | undefined =
      this.projectUserConfigDoc.data?.ownerRef != null
        ? this.projectDoc?.data?.userRoles[this.projectUserConfigDoc.data?.ownerRef]
        : undefined;
    return (
      this.projectDoc?.data?.biblicalTermsConfig.biblicalTermsEnabled === true &&
      userRole != null &&
      SF_PROJECT_RIGHTS.roleHasRight(userRole, SFProjectDomain.BiblicalTerms, Operation.View)
    );
  }

  get canUseTranslationSuggestions(): boolean {
    const userRole: string | undefined =
      this.projectUserConfigDoc.data?.ownerRef != null
        ? this.projectDoc?.data?.userRoles[this.projectUserConfigDoc.data?.ownerRef]
        : undefined;
    return (
      this.projectDoc?.data?.translateConfig.translationSuggestionsEnabled === true &&
      userRole != null &&
      SF_PROJECT_RIGHTS.roleHasRight(userRole, SFProjectDomain.Texts, Operation.Edit)
    );
  }
}
