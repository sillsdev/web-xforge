import { Component, Inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatTooltip } from '@angular/material/tooltip';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { normalizeLanguageCodeToISO639_3 } from '../../../translate/draft-generation/draft-utils';

export interface SourceOption {
  paratextId: string;
  name: string;
  languageCode: string;
}

export interface BackTranslationInfo extends SourceOption {
  draftingAlreadyEnabled: boolean;
}

export interface ApproveRequestDialogData {
  targetProject: SourceOption;
  draftingSourceOptions: SourceOption[];
  trainingSourceOptions: SourceOption[];
  defaultTrainingSource?: string;
  backTranslation?: BackTranslationInfo;
}

export interface ApproveRequestDialogResult {
  draftingSourceParatextId: string;
  trainingSourceParatextIds: string[];
  enableBackTranslationDrafting: boolean;
}

/** Validates that the number of selected training sources is 1 or 2. */
function trainingSourcesValidator(control: AbstractControl): ValidationErrors | null {
  const value: string[] = control.value ?? [];
  return value.length >= 1 && value.length <= 2 ? null : { trainingSourceCount: true };
}

function uniqueNormalizedCodes(ids: string[], languageCodes: Map<string, string>): Set<string> {
  return new Set(
    ids
      .map(id => languageCodes.get(id))
      .filter((c): c is string => c != null && c !== '')
      .map(normalizeLanguageCodeToISO639_3)
  );
}

/** Validates that all selected sources have the same language code. */
function languageCodesValidator(languageCodes: Map<string, string>) {
  return (control: AbstractControl): ValidationErrors | null => {
    const draftingSourceId: string = control.get('draftingSource')?.value;
    const trainingSourceIds: string[] = control.get('trainingSources')?.value ?? [];
    const allIds = [draftingSourceId, ...trainingSourceIds].filter((id): id is string => id != null);
    return uniqueNormalizedCodes(allIds, languageCodes).size > 1 ? { languageCodesDiffer: true } : null;
  };
}

@Component({
  selector: 'app-approve-request-dialog',
  templateUrl: './approve-request-dialog.component.html',
  styleUrl: './approve-request-dialog.component.scss',
  imports: [
    ReactiveFormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButton,
    MatIcon,
    MatRadioGroup,
    MatRadioButton,
    MatCheckbox,
    MatTooltip,
    NoticeComponent
  ]
})
export class ApproveRequestDialogComponent {
  readonly draftingSource: FormControl<string>;
  readonly trainingSources: FormControl<string[]>;
  readonly form: FormGroup;
  readonly enableBackTranslationDrafting: FormControl<boolean>;
  readonly backTranslationLanguageMatchesTarget: boolean;
  private readonly languageCodes: Map<string, string>;
  private readonly normalizedTargetLanguageCode: string;

  constructor(
    readonly dialogRef: MatDialogRef<ApproveRequestDialogComponent, ApproveRequestDialogResult>,
    @Inject(MAT_DIALOG_DATA) readonly data: ApproveRequestDialogData
  ) {
    if (data.defaultTrainingSource == null) throw new Error('defaultTrainingSource is required');

    this.normalizedTargetLanguageCode = normalizeLanguageCodeToISO639_3(data.targetProject.languageCode);
    this.backTranslationLanguageMatchesTarget =
      data.backTranslation != null &&
      normalizeLanguageCodeToISO639_3(data.backTranslation.languageCode) === this.normalizedTargetLanguageCode;
    this.draftingSource = new FormControl<string>(data.draftingSourceOptions[0]?.paratextId ?? '', {
      validators: [Validators.required],
      nonNullable: true
    });
    this.trainingSources = new FormControl<string[]>([data.defaultTrainingSource], {
      validators: [trainingSourcesValidator],
      nonNullable: true
    });
    this.languageCodes = new Map<string, string>(
      [...data.trainingSourceOptions, ...data.draftingSourceOptions].map(o => [o.paratextId, o.languageCode] as const)
    );
    this.form = new FormGroup(
      { draftingSource: this.draftingSource, trainingSources: this.trainingSources },
      { validators: languageCodesValidator(this.languageCodes) }
    );
    this.enableBackTranslationDrafting = new FormControl<boolean>(!this.backTranslationLanguageMatchesTarget, {
      nonNullable: true
    });
    if (!this.canEnableBackTranslationDrafting) {
      this.enableBackTranslationDrafting.disable();
    }
  }

  get canEnableBackTranslationDrafting(): boolean {
    return (
      this.data.backTranslation != null &&
      !this.data.backTranslation.draftingAlreadyEnabled &&
      !this.backTranslationLanguageMatchesTarget
    );
  }

  get sourcesMatchTargetLanguage(): boolean {
    const allIds = [this.draftingSource.value, ...this.trainingSources.value].filter(id => id !== '');
    const codes = uniqueNormalizedCodes(allIds, this.languageCodes);
    if (codes.size !== 1) return false;
    return codes.has(this.normalizedTargetLanguageCode);
  }

  isTrainingSourceSelected(id: string): boolean {
    return this.trainingSources.value.includes(id);
  }

  trainingSourceOrder(id: string): { name: 'Primary'; order: 'first' } | { name: 'Secondary'; order: 'second' } | null {
    const sources = this.trainingSources.value;
    if (sources.length !== 2) return null;
    if (sources[0] === id) return { name: 'Primary', order: 'first' };
    if (sources[1] === id) return { name: 'Secondary', order: 'second' };
    return null;
  }

  toggleTrainingSource(id: string, checked: boolean): void {
    const current = this.trainingSources.value;
    this.trainingSources.setValue(checked ? [...current, id] : current.filter(s => s !== id));
    this.trainingSources.markAsTouched();
  }

  approve(): void {
    if (this.form.valid) {
      this.dialogRef.close({
        draftingSourceParatextId: this.draftingSource.value,
        trainingSourceParatextIds: this.trainingSources.value,
        enableBackTranslationDrafting: this.canEnableBackTranslationDrafting && this.enableBackTranslationDrafting.value
      });
    }
  }
}
