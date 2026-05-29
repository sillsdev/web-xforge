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
import { MatIcon } from '@angular/material/icon';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatTooltip } from '@angular/material/tooltip';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { normalizeLanguageCodeToISO639_3 } from '../../../translate/draft-generation/draft-utils';

export interface ProjectInfo {
  name: string;
  shortName: string;
  languageCode: string;
}

export interface ApproveRequestDialogData {
  projectInfo: Map<string, ProjectInfo>;
  projectName: string;
  draftingSourceOptions: string[];
  trainingSourceOptions: string[];
  defaultDraftingSource: string;
  defaultTrainingSources: string[];
}

export interface ApproveRequestDialogResult {
  draftingSourceParatextId: string;
  trainingSourceParatextIds: string[];
}

function trainingSourcesValidator(control: AbstractControl): ValidationErrors | null {
  const value: string[] = control.value ?? [];
  return value.length >= 1 && value.length <= 2 ? null : { trainingSourceCount: true };
}

function languageCodesValidator(projectInfo: Map<string, ProjectInfo>) {
  return (control: AbstractControl): ValidationErrors | null => {
    const draftingSourceId: string = control.get('draftingSource')?.value;
    const trainingSourceIds: string[] = control.get('trainingSources')?.value ?? [];
    const allIds = [draftingSourceId, ...trainingSourceIds].filter((id): id is string => id != null);
    const codes = allIds.map(id => projectInfo.get(id)?.languageCode).filter((c): c is string => c != null && c !== '');
    const uniqueNormalized = new Set(codes.map(normalizeLanguageCodeToISO639_3));
    return uniqueNormalized.size > 1 ? { languageCodesDiffer: true } : null;
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

  constructor(
    readonly dialogRef: MatDialogRef<ApproveRequestDialogComponent, ApproveRequestDialogResult>,
    @Inject(MAT_DIALOG_DATA) readonly data: ApproveRequestDialogData
  ) {
    this.draftingSource = new FormControl<string>(data.defaultDraftingSource, {
      validators: [Validators.required],
      nonNullable: true
    });
    this.trainingSources = new FormControl<string[]>(data.defaultTrainingSources, {
      validators: [trainingSourcesValidator],
      nonNullable: true
    });
    this.form = new FormGroup(
      { draftingSource: this.draftingSource, trainingSources: this.trainingSources },
      { validators: languageCodesValidator(data.projectInfo) }
    );
  }

  isTrainingSourceSelected(id: string): boolean {
    return this.trainingSources.value.includes(id);
  }

  /** Returns 'Primary' or 'Secondary' when exactly 2 sources are selected, null otherwise. */
  trainingSourceOrder(id: string): 'Primary' | 'Secondary' | null {
    const sources = this.trainingSources.value;
    if (sources.length !== 2) return null;
    if (sources[0] === id) return 'Primary';
    if (sources[1] === id) return 'Secondary';
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
        trainingSourceParatextIds: this.trainingSources.value
      });
    }
  }
}
