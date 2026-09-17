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
import { combineLatest, filter, firstValueFrom, Subject } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AutofocusDirective } from 'xforge-common/autofocus.directive';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { isPopulatedString } from '../../../type-utils';
import { DataLoadingComponent } from '../../../xforge-common/data-loading-component';
import { quietTakeUntilDestroyed } from '../../../xforge-common/util/rxjs-util';
import { BrandingService } from '../../core/branding.service';
import { ParatextProject } from '../../core/models/paratext-project';
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
  feedback: string;
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
export class UserFeedbackDialogComponent extends DataLoadingComponent implements OnInit {
  readonly publishPermission = FeedbackPermission;

  feedbackForm = new FormGroup({
    feedback: new FormControl('', Validators.required),
    // ParatextId may be null if a user is leaving feedback but they are not a Paratext user because
    // the project select only works for Paratext users
    paratextId: new FormControl(''),
    permission: new FormControl(FeedbackPermission.Private, { nonNullable: true })
  });

  private readonly projectsLoaded$: Subject<void> = new Subject<void>();
  private _projects: ParatextProject[] | undefined;

  constructor(
    private readonly dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult>,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly paratextService: ParatextService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly brandingService: BrandingService,
    private readonly activatedProjectService: ActivatedProjectService,
    noticeService: NoticeService,
    private readonly destroyRef: DestroyRef
  ) {
    super(noticeService, 'UserFeedbackDialogComponent');
  }

  get projects(): ParatextProject[] {
    return this._projects ?? [];
  }

  private set projects(value: ParatextProject[] | undefined) {
    this._projects = value;
    if (value != null) this.projectsLoaded$.next();
  }

  get siteName(): string {
    return this.brandingService.siteName;
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  async ngOnInit(): Promise<void> {
    combineLatest([this.activatedProjectService.projectDoc$, this.projectsLoaded$])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([projectDoc]) => {
        if (projectDoc?.data != null) {
          this.feedbackForm.controls.paratextId.setValue(projectDoc.data.paratextId);
        }
      });

    void this.loadProjects();
  }

  submit(): void {
    if (!this.isOnline || this.feedbackForm.invalid) return;
    const paratextId = this.feedbackForm.controls.paratextId.value;
    const feedback = this.feedbackForm.controls.feedback.value;
    if (!isPopulatedString(feedback)) return;
    const feedbackParams: UserFeedbackParams = {
      type: FeedbackType.HowSfImpactedProject,
      // TODO: In the future if we make this dialog more generic the page source should come from the calling component
      source: PageSource.GenerateDraftPage,
      permission: this.feedbackForm.controls.permission.value,
      feedback
    };
    if (paratextId == null || feedback == null) return;

    const sfProjectId = this.userProjectsService.projectDocs?.find(p => p.data?.paratextId === paratextId)?.id;
    if (sfProjectId == null) return;

    this.dialogRef.close({ sfProjectId, feedback, feedbackParams });
  }

  private async loadProjects(): Promise<void> {
    this.loadingStarted();
    await firstValueFrom(this.onlineStatusService.onlineStatus$.pipe(filter(online => online)));
    this.projects = await this.paratextService.getProjects().finally(() => this.loadingFinished());
  }
}
