import { CdkScrollable } from '@angular/cdk/scrolling';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { TranslocoModule } from '@ngneat/transloco';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AutofocusDirective } from 'xforge-common/autofocus.directive';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { isPopulatedString } from '../../../type-utils';
import { quietTakeUntilDestroyed } from '../../../xforge-common/util/rxjs-util';
import { BrandingService } from '../../core/branding.service';
import { SelectableProject } from '../../core/models/selectable-project';
import { ProjectSelectComponent } from '../../project-select/project-select.component';

export interface UserFeedbackParams {
  type: FeedbackType;
  source: PageSource;
  permission: FeedbackPermission;
  feedback: string;
}

export enum FeedbackType {
  HowSfImpactedProject = 'how_sf_impacted_project'
}

export enum PageSource {
  None = 'none',
  GenerateDraftPage = 'generate_draft_page'
}

export enum FeedbackPermission {
  PublishPublic = 'publish_public',
  PublishAnonymous = 'publish_anonymous',
  Private = 'private'
}

export interface UserFeedbackDialogResult {
  sfProjectId: string;
  feedback: string;
  feedbackParams: UserFeedbackParams;
}

@Component({
  selector: 'app-user-feedback-dialog',
  templateUrl: './user-feedback-dialog.component.html',
  styleUrls: ['./user-feedback-dialog.component.scss'],
  imports: [
    TranslocoModule,
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    CdkTextareaAutosize,
    AutofocusDirective,
    ProjectSelectComponent,
    MatRadioGroup,
    MatRadioButton,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    MatError
  ]
})
export class UserFeedbackDialogComponent implements OnInit {
  readonly publishPermission = FeedbackPermission;

  feedbackForm = new FormGroup({
    feedback: new FormControl('', Validators.required),
    paratextId: new FormControl('', Validators.required),
    permission: new FormControl(FeedbackPermission.Private, { nonNullable: true })
  });

  constructor(
    private readonly dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult>,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly brandingService: BrandingService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef
  ) {}

  get projects(): SelectableProject[] {
    return (this.userProjectsService.projectDocs ?? [])
      .filter(p => p.data != null)
      .map(p => ({ name: p.data!.name, shortName: p.data!.shortName, paratextId: p.data!.paratextId }));
  }

  get siteName(): string {
    return this.brandingService.siteName;
  }

  async ngOnInit(): Promise<void> {
    this.activatedProjectService.projectDoc$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(projectDoc => {
      if (projectDoc?.data != null) {
        this.feedbackForm.controls.paratextId.setValue(projectDoc.data.paratextId);
        this.feedbackForm.updateValueAndValidity();
      }
    });
  }

  submit(): void {
    if (this.feedbackForm.invalid) return;
    const paratextId = this.feedbackForm.controls.paratextId.value;
    const feedback = this.feedbackForm.controls.feedback.value;
    if (!isPopulatedString(feedback)) return;
    const feedbackParams: UserFeedbackParams = {
      type: FeedbackType.HowSfImpactedProject,
      source: PageSource.GenerateDraftPage,
      permission: this.feedbackForm.controls.permission.value,
      feedback
    };
    if (paratextId == null || feedback == null) return;

    const sfProjectId = this.userProjectsService.projectDocs?.find(p => p.data?.paratextId === paratextId)?.id;
    if (sfProjectId == null) return;

    this.dialogRef.close({ sfProjectId, feedback, feedbackParams });
  }
}
