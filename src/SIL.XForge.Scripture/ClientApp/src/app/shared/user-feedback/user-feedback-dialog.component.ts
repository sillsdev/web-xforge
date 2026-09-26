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
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { filter, firstValueFrom, tap } from 'rxjs';
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
  feedbackParams: UserFeedbackParams;
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
    feedback: new FormControl('', [Validators.required, XFValidators.someNonWhitespace]),
    // ParatextId may be null since feedback does not have to be specific to a project
    paratextId: new FormControl(''),
    permission: new FormControl(FeedbackPermission.Private, { nonNullable: true })
  });

  constructor(
    private readonly dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult>,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly brandingService: BrandingService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef
  ) {}

  get siteName(): string {
    return this.brandingService.siteName;
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get selectedParatextId(): string | undefined {
    return this.feedbackForm.controls.paratextId.value ?? undefined;
  }

  async ngOnInit(): Promise<void> {
    await this.loadProjects();
  }

  submit(): void {
    if (!this.isOnline || this.feedbackForm.invalid) return;
    const feedback = this.feedbackForm.controls.feedback.value;
    if (!isPopulatedString(feedback?.trim())) return;
    const feedbackParams: UserFeedbackParams = {
      type: FeedbackType.HowSfImpactedProject,
      source: PageSource.GenerateDraftPage,
      permission: this.feedbackForm.controls.permission.value,
      feedback
    };

    const sfProjectId = !isPopulatedString(this.selectedParatextId)
      ? ''
      : this.userProjectsService.projectDocs?.find(p => p.data?.paratextId === this.selectedParatextId)?.id;
    if (sfProjectId == null) return;

    this.dialogRef.close({ sfProjectId, feedbackParams });
  }

  private async loadProjects(): Promise<void> {
    await firstValueFrom(this.onlineStatusService.onlineStatus$.pipe(filter(online => online)));
    this.userProjectsService.projectDocs$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filterNullish(),
        tap(projectDocs => {
          this.projects =
            projectDocs
              ?.map(doc => doc.data)
              .filter(notNull)
              .filter(project => !ParatextService.isResource(project.paratextId)) ?? [];
        })
      )
      .subscribe(() => {
        const selectedProjectDoc: SFProjectProfileDoc | undefined = this.activatedProjectService.projectDoc;
        if (selectedProjectDoc?.data != null) {
          this.feedbackForm.controls.paratextId.setValue(selectedProjectDoc.data.paratextId);
        }
      });
  }
}
