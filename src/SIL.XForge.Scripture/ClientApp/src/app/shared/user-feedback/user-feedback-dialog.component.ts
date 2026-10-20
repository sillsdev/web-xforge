import { CdkScrollable } from '@angular/cdk/scrolling';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { Component, DestroyRef, Inject, OnInit, Optional } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AutofocusDirective } from 'xforge-common/autofocus.directive';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { XFValidators } from 'xforge-common/xfvalidators';
import { isPopulatedString, notNull } from '../../../type-utils';
import { BrandingService } from '../../core/branding.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../core/paratext.service';
import { ProjectSelectComponent } from '../../project-select/project-select.component';
import { NoticeComponent } from '../notice/notice.component';

export interface UserFeedbackParams {
  type: FeedbackType;
  source: FeedbackSourcePage;
  permission: FeedbackPermission;
  feedback: string;
}

export enum FeedbackType {
  HowSfImpactedProject = 'how_sf_impacted_project'
}

export enum FeedbackSourcePage {
  None = 'none',
  GenerateDraftPage = 'generate_draft_page'
}

export enum FeedbackPermission {
  PublishPublic = 'publish_public',
  PublishAnonymous = 'publish_anonymous',
  Private = 'private'
}

export interface UserFeedbackDialogResult {
  /** The SF project the feedback is about, or an empty string if the user did not select a project. */
  sfProjectId: string;
  feedbackParams: UserFeedbackParams;
}

export interface UserFeedbackDialogData {
  /** Whether the user can choose which project the feedback is about. Defaults to false. */
  requireProjectReference?: boolean;
}

@Component({
  selector: 'app-user-feedback-dialog',
  templateUrl: './user-feedback-dialog.component.html',
  styleUrls: ['./user-feedback-dialog.component.scss'],
  imports: [
    TranslocoModule,
    CdkScrollable,
    MatDialogTitle,
    MatRadioGroup,
    MatRadioButton,
    MatDialogActions,
    MatButton,
    MatIcon,
    MatDialogClose,
    MatError,
    MatDialogContent,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    CdkTextareaAutosize,
    AutofocusDirective,
    ProjectSelectComponent,
    NoticeComponent
  ]
})
export class UserFeedbackDialogComponent implements OnInit {
  readonly publishPermission = FeedbackPermission;
  /** The projects that a user is connected to that are not resources. */
  projects: SFProjectProfile[] | undefined;

  feedbackForm = new FormGroup({
    feedback: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, XFValidators.someNonWhitespace]
    }),
    // Required only if requireProjectReference is true.
    paratextId: new FormControl(''),
    permission: new FormControl<FeedbackPermission | null>(null, Validators.required)
  });

  constructor(
    private readonly dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult>,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly brandingService: BrandingService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    @Optional() @Inject(MAT_DIALOG_DATA) private readonly data: UserFeedbackDialogData | null
  ) {
    if (this.requireProjectReference) {
      this.feedbackForm.controls.paratextId.addValidators(Validators.required);
    }
  }

  get requireProjectReference(): boolean {
    return this.data?.requireProjectReference === true;
  }

  get siteName(): string {
    return this.brandingService.siteName;
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get showPermissionRequiredError(): boolean {
    const permission = this.feedbackForm.controls.permission;
    return permission.hasError('required') && permission.touched;
  }

  get selectedParatextId(): string | undefined {
    return this.feedbackForm.controls.paratextId.value ?? undefined;
  }

  async ngOnInit(): Promise<void> {
    if (!this.requireProjectReference) return;
    await this.loadProjects();
  }

  submit(): void {
    if (!this.isOnline) return;
    const permission: FeedbackPermission | null = this.feedbackForm.controls.permission.value;
    if (this.feedbackForm.invalid || permission == null) {
      // Errors only show on touched fields, so mark them touched to show the user why nothing was submitted
      this.feedbackForm.markAllAsTouched();
      return;
    }
    const feedback: string = this.feedbackForm.controls.feedback.value;
    const feedbackParams: UserFeedbackParams = {
      type: FeedbackType.HowSfImpactedProject,
      source: FeedbackSourcePage.GenerateDraftPage,
      permission,
      feedback
    };

    // Feedback is not about a project unless the user could choose one
    const sfProjectId =
      !this.requireProjectReference || !isPopulatedString(this.selectedParatextId)
        ? ''
        : this.userProjectsService.projectDocs?.find(p => p.data?.paratextId === this.selectedParatextId)?.id;
    if (sfProjectId == null) return;

    this.dialogRef.close({ sfProjectId, feedbackParams });
  }

  private async loadProjects(): Promise<void> {
    await this.onlineStatusService.online;
    this.userProjectsService.projectDocs$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filterNullish(),
        // Update the current user's list of projects
        tap(projectDocs => {
          this.projects =
            projectDocs
              ?.map(doc => doc.data)
              .filter(notNull)
              .filter(project => !ParatextService.isResource(project.paratextId)) ?? [];
        })
      )
      .subscribe(() => {
        // Set the selected project only after the list of projects is available
        const selectedProjectDoc: SFProjectProfileDoc | undefined = this.activatedProjectService.projectDoc;
        if (
          this.requireProjectReference &&
          selectedProjectDoc?.data != null &&
          !isPopulatedString(this.selectedParatextId)
        ) {
          this.feedbackForm.controls.paratextId.setValue(selectedProjectDoc.data.paratextId);
        }
      });
  }
}
