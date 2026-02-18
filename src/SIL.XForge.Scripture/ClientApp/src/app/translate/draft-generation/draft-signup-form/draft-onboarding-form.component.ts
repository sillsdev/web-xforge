import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormFieldModule, MatLabel } from '@angular/material/form-field';
import { MatIcon, MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { DevOnlyComponent } from 'src/app/shared/dev-only/dev-only.component';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { hasStringProp } from '../../../../type-utils';
import { SelectableProject } from '../../../core/models/selectable-project';
import { ParatextService } from '../../../core/paratext.service';
import { ProjectSelectComponent } from '../../../project-select/project-select.component';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { JsonViewerComponent } from '../../../shared/json-viewer/json-viewer.component';
import { compareProjectsForSorting, projectLabel } from '../../../shared/utils';
import { DraftingSignupFormData, OnboardingRequestService } from '../onboarding-request.service';

export const DRAFT_SIGNUP_RESPONSE_DAYS = { min: 1, max: 3 } as const;

type DraftOnboardingFormUiState = 'editing' | 'submitting' | 'submitted';

/**
 * Component for the in-app draft signup form.
 * Allows users to sign up for drafting by providing their information and selecting projects.
 */
@Component({
  selector: 'app-draft-onboarding-form',
  templateUrl: './draft-onboarding-form.component.html',
  styleUrls: ['./draft-onboarding-form.component.scss'],
  // The OnPush change detection strategy was chosen to deal with major performance issues caused by too many change
  // detection cycles taking too much CPU time. The behavior only occurs on larger projects when using
  // the BookMultiSelectComponent, which loads progress data for all chapters. Network events as each chapter is loaded
  // (and probably also events caused by the subsequent processing) cause excessive change detection cycles. In a large
  // project (Stp22), this leads to 17000+ change detection cycles before the page fully stabilizes. For some components
  // the performance impact will not be felt, due to change detection cycles running fast enough to not be noticeable.
  // However, for this component, it appears number_of_change_detection_cycles * time_per_cycle becomes significant
  // enough to cause major problems. In particular, changes to the values in a ProjectSelectComponent are emitted by the
  // component upon user interaction, but don't end up notifying the DraftSignupFormComponent until much later (after
  // the change detection storm subsides). This leads the form to remain in an invalid state (required projects are not
  // selected) even after the user has made the selection (though in the ProjectSelectComponent itself the selection
  // exists and is known to be valid).
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslocoModule,
    ReactiveFormsModule,
    ProjectSelectComponent,
    JsonViewerComponent,
    BookMultiSelectComponent,
    MatLabel,
    MatError,
    MatOption,
    MatIcon,
    MatCardModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    DevOnlyComponent
  ]
})
export class DraftOnboardingFormComponent extends DataLoadingComponent implements OnInit {
  signupForm = new FormGroup({
    // Contact Information
    name: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl<string>('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    organization: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    partnerOrganization: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),

    // Translation Language Information
    translationLanguageName: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    translationLanguageIsoCode: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    // Project Information
    completedBooks: new FormControl<number[]>([], { nonNullable: true, validators: [Validators.required] }),
    nextBooksToDraft: new FormControl<number[]>([], { nonNullable: true, validators: [Validators.required] }),

    // Reference projects (source text information)
    sourceProjectA: new FormControl<string | null>(null, { validators: [Validators.required] }),
    sourceProjectB: new FormControl<string | null>(null),
    sourceProjectC: new FormControl<string | null>(null),
    draftingSourceProject: new FormControl<string | null>(null, { validators: [Validators.required] }),

    // Back Translation Information
    backTranslationStage: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    backTranslationProject: new FormControl<string | null>(null),

    // Back translation language information
    backTranslationLanguageName: new FormControl<string>('', { nonNullable: true }),
    backTranslationLanguageIsoCode: new FormControl<string>('', { nonNullable: true }),

    // Additional Information
    additionalComments: new FormControl<string>('', { nonNullable: true })
  });

  availableProjects: SelectableProject[] = [];
  availableResources: SelectableProject[] = [];
  projectBooks: { number: number; selected: boolean }[] = [];

  // Stable selected book list for completed books
  selectedCompletedBooks: { number: number; selected: boolean }[] = [];
  // Stable selected book list for planned/submitted books
  selectedSubmittedBooks: { number: number; selected: boolean }[] = [];
  // All canonical books for planned selection (numbers only)
  allCanonicalBooks = [...Canon.allBookNumbers()]
    .filter(n => Canon.isBookOTNT(n))
    .map(n => ({ number: n, selected: false }));

  submittedData?: any;

  uiState: DraftOnboardingFormUiState = 'editing';

  readonly responseDays = DRAFT_SIGNUP_RESPONSE_DAYS;

  constructor(
    private readonly router: Router,
    private readonly activatedProject: ActivatedProjectService,
    private readonly userService: UserService,
    private readonly paratextService: ParatextService,
    private readonly draftingSignupService: OnboardingRequestService,
    protected readonly noticeService: NoticeService,
    private readonly destroyRef: DestroyRef,
    private readonly cd: ChangeDetectorRef,
    private readonly i18n: I18nService
  ) {
    super(noticeService);
  }

  ngOnInit(): void {
    this.loadingStarted();

    // Get the current user and pre-fill the form
    this.userService
      .getCurrentUser()
      .then(userDoc => {
        const user: Readonly<User | undefined> = userDoc.data;
        if (user != null) {
          // Omit email if it's a noreply email
          const userEmail = user.email?.includes('@users.noreply.scriptureforge.org') ? '' : (user.email ?? '');
          this.signupForm.patchValue({
            name: user.displayName || user.name || '',
            email: userEmail
          });
        }
      })
      .catch(err => console.error('Error loading user:', err));

    // Load available projects and resources
    void this.loadProjectsAndResources();

    // Set up conditional field listeners
    this.setupConditionalLogic();
    // Update project books when activated project changes
    this.activatedProject.projectId$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.setProjectBooks();
    });

    // Keep selectedSubmittedBooks in sync with submittedBooks form control
    this.signupForm.controls.nextBooksToDraft.valueChanges
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(ids => {
        const arr = (ids ?? []) as number[];
        this.selectedSubmittedBooks = arr.map(n => ({ number: n, selected: true }));
      });

    // Keep selectedCompletedBooks in sync with completedBooks form control
    this.signupForm.controls.completedBooks.valueChanges
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(ids => {
        const arr = (ids ?? []) as number[];
        this.selectedCompletedBooks = arr.map(n => ({ number: n, selected: true }));
      });

    // Initialize selected arrays from the current form values (and projectBooks if available).
    // This ensures the child `BookMultiSelectComponent` receives stable references on init.
    this.syncSelectedFromForm();
  }

  onCompletedBooksSelect(ids: number[]): void {
    // set the form control value when user selects books
    this.signupForm.controls.completedBooks.setValue(ids);
  }

  onSubmittedBooksSelect(ids: number[]): void {
    this.signupForm.controls.nextBooksToDraft.setValue(ids);
  }

  async onSubmit(): Promise<void> {
    if (this.uiState === 'submitting') {
      return;
    }

    if (this.signupForm.valid === true) {
      if (this.activatedProject.projectId == null) {
        this.noticeService.showError('No project selected');
        return;
      }

      this.uiState = 'submitting';
      this.cd.markForCheck();

      const formData: DraftingSignupFormData = this.signupForm.getRawValue() as DraftingSignupFormData;

      try {
        const requestId = await this.draftingSignupService.submitOnboardingRequest(
          this.activatedProject.projectId,
          formData
        );

        // For testing purposes, store and display the submitted data
        this.submittedData = {
          requestId,
          projectId: this.activatedProject.projectId,
          formData
        };

        this.uiState = 'submitted';

        this.noticeService.show('Draft signup request submitted successfully');
        this.cd.detectChanges();
      } catch (error) {
        console.error('Error submitting draft signup request:', error);
        this.noticeService.showError('Failed to submit draft signup request');
        this.uiState = 'editing';
      } finally {
        this.cd.markForCheck();
      }
    } else {
      console.log('Form is invalid at top-level:', this.signupForm.errors);
      this.logValidationErrors();
      // Mark all fields as touched to show validation errors
      this.signupForm.markAllAsTouched();
      this.noticeService.showError('Please fill in all required fields');
    }
  }

  cancel(): void {
    // Navigate back to draft generation page
    if (this.activatedProject.projectId != null) {
      void this.router.navigate(['/projects', this.activatedProject.projectId, 'draft-generation']);
    }
  }

  get isEditing(): boolean {
    return this.uiState === 'editing';
  }

  get isSubmitting(): boolean {
    return this.uiState === 'submitting';
  }

  get isSubmitted(): boolean {
    return this.uiState === 'submitted';
  }

  get showBackTranslationProject(): boolean {
    const stage = this.signupForm.controls.backTranslationStage.value;
    return stage === 'Written (Incomplete or Out-of-Date)' || stage === 'Written (Up-to-Date)';
  }

  // Whether to show the "completed books is required" error message.
  get showCompletedBooksRequiredError(): boolean {
    const ctrl = this.signupForm.controls.completedBooks;
    return ctrl.hasError('required') && (ctrl.touched || ctrl.dirty);
  }

  // Whether to show the "planned books is required" error message.
  get showPlannedBooksRequiredError(): boolean {
    const ctrl = this.signupForm.controls.nextBooksToDraft;
    return ctrl.hasError('required') && (ctrl.touched || ctrl.dirty);
  }

  get currentProjectId(): string | undefined {
    return this.activatedProject.projectId;
  }

  get currentProjectDisplayName(): string {
    return projectLabel(this.activatedProject.projectDoc!.data!);
  }

  get hiddenParatextIds(): string[] {
    const currentProjectParatextId = this.activatedProject.projectDoc?.data?.paratextId;
    return currentProjectParatextId ? [currentProjectParatextId] : [];
  }

  get sourceProjectAErrorMessage(): string | undefined {
    const ctrl = this.signupForm.controls.sourceProjectA;
    if (ctrl.hasError('required') && ctrl.touched) {
      return translate('draft_signup.primary_source_project_required');
    }
    return undefined;
  }

  get draftingSourceProjectErrorMessage(): string | undefined {
    const ctrl = this.signupForm.controls.draftingSourceProject;
    if (ctrl.hasError('required') && ctrl.touched) {
      return translate('draft_signup.drafting_source_project_required');
    }
    return undefined;
  }

  get backTranslationProjectErrorMessage(): string | undefined {
    const ctrl = this.signupForm.controls.backTranslationProject;
    if (ctrl.hasError('required') && ctrl.touched) {
      return translate('draft_signup.bt_project_required');
    }
    return undefined;
  }

  backTranslationProjectSelected(selectedProject: SelectableProject): void {
    const languageTagInForm = this.signupForm.controls.backTranslationLanguageIsoCode.value;
    const projectLanguageTag = this.activatedProject.projectDoc?.data?.writingSystem.tag;

    // Only fill in the language information if the back translation ISO code differs from the main project ISO code
    if (
      hasStringProp(selectedProject, 'languageTag') &&
      selectedProject.languageTag !== languageTagInForm &&
      selectedProject.languageTag !== projectLanguageTag
    ) {
      this.signupForm.controls.backTranslationLanguageIsoCode.setValue(selectedProject.languageTag);

      // Attempt to get the English name of the language from the browser
      const englishName = this.i18n.getLanguageDisplayName(selectedProject.languageTag, 'en');
      if (englishName && englishName !== selectedProject.languageTag) {
        this.signupForm.controls.backTranslationLanguageName.setValue(englishName);
      } else {
        // Clear the language name if we couldn't determine a reasonable value
        this.signupForm.controls.backTranslationLanguageName.setValue('');
      }
    }
  }

  private async loadProjectsAndResources(): Promise<void> {
    try {
      const [projects, resources] = await Promise.all([
        this.paratextService.getProjects(),
        this.paratextService.getResources()
      ]);
      if (projects != null) {
        this.availableProjects = projects.sort(compareProjectsForSorting);
      }
      if (resources != null) {
        this.availableResources = resources.sort(compareProjectsForSorting);
      }
      this.cd.markForCheck();
      // Populate the projectBooks list from the currently activated project's texts (if available)
      this.setProjectBooks();

      this.loadingFinished();
    } catch (err) {
      console.error('Error loading projects:', err);
      this.loadingFinished();
    }
  }

  private setProjectBooks(): void {
    const proj = this.activatedProject.projectDoc?.data;
    if (!proj || !proj.texts) {
      this.projectBooks = [];
      return;
    }
    // Map texts to Book objects expected by BookMultiSelectComponent
    this.projectBooks = proj.texts
      .slice()
      .sort((a: any, b: any) => a.bookNum - b.bookNum)
      .map((t: any) => ({ number: t.bookNum, selected: false }));

    // When the project changes, ensure any completed book selections that are no
    // longer part of the project are removed so the form and child component stay valid.
    const currentCompleted = (this.signupForm.controls.completedBooks.value ?? []) as number[];
    const projectNums = new Set(this.projectBooks.map(b => b.number));
    const filtered = currentCompleted.filter(n => projectNums.has(n));
    if (filtered.length !== currentCompleted.length) {
      // Update the form control which will in turn update `selectedCompletedBooks`
      this.signupForm.controls.completedBooks.setValue(filtered);
    }
  }

  // Populate the stable selected arrays from the form. For completed books we
  // only include those that exist in the current projectBooks list.
  private syncSelectedFromForm(): void {
    const submitted = (this.signupForm.controls.nextBooksToDraft.value ?? []) as number[];
    this.selectedSubmittedBooks = submitted.map(n => ({ number: n, selected: true }));

    const completed = (this.signupForm.controls.completedBooks.value ?? []) as number[];
    const projectNums = new Set(this.projectBooks.map(b => b.number));
    const filteredCompleted = completed.filter(n => projectNums.has(n));
    this.selectedCompletedBooks = filteredCompleted.map(n => ({ number: n, selected: true }));

    // If any completed selections were invalid for the current project, update the form
    // so everything remains in sync. The completed valueChanges subscription will refresh
    // `selectedCompletedBooks` if this call changes the control.
    if (filteredCompleted.length !== completed.length) {
      this.signupForm.controls.completedBooks.setValue(filteredCompleted);
    }
  }

  private setupConditionalLogic(): void {
    // Show/hide Back Translation Project based on Stage selection
    this.signupForm.controls.backTranslationStage.valueChanges
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const showProject = value === 'Written (Incomplete or Out-of-Date)' || value === 'Written (Up-to-Date)';

        if (showProject) {
          this.signupForm.controls.backTranslationProject.setValidators([Validators.required]);
          this.signupForm.controls.backTranslationLanguageName.setValidators([Validators.required]);
          this.signupForm.controls.backTranslationLanguageIsoCode.setValidators([Validators.required]);
        } else {
          this.signupForm.controls.backTranslationProject.clearValidators();
          this.signupForm.controls.backTranslationProject.setValue(null);

          this.signupForm.controls.backTranslationLanguageName.clearValidators();
          this.signupForm.controls.backTranslationLanguageName.setValue('');

          this.signupForm.controls.backTranslationLanguageIsoCode.clearValidators();
          this.signupForm.controls.backTranslationLanguageIsoCode.setValue('');
        }

        this.signupForm.controls.backTranslationProject.updateValueAndValidity();
        this.signupForm.controls.backTranslationLanguageName.updateValueAndValidity();
        this.signupForm.controls.backTranslationLanguageIsoCode.updateValueAndValidity();
      });
  }

  private logValidationErrors(): void {
    const errorsByControl: { name: string; value: unknown; errors: unknown }[] = [];

    Object.keys(this.signupForm.controls).forEach(controlName => {
      const ctrl = this.signupForm.controls[controlName as keyof typeof this.signupForm.controls];
      if (ctrl != null && ctrl.invalid) {
        errorsByControl.push({
          name: controlName,
          value: ctrl.value,
          errors: ctrl.errors
        });
      }
    });

    console.warn('Draft signup form validation errors:', errorsByControl);
  }
}
