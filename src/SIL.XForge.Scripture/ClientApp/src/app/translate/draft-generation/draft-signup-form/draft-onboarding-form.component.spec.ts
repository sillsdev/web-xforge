import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ParatextService } from '../../../core/paratext.service';
import { OnboardingRequestService } from '../onboarding-request.service';
import { DraftOnboardingFormComponent } from './draft-onboarding-form.component';

describe('DraftOnboardingFormComponent', () => {
  const projectId = 'project01';

  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockUserService = mock(UserService);
  const mockParatextService = mock(ParatextService);
  const mockOnboardingRequestService = mock(OnboardingRequestService);
  const mockNoticeService = mock(NoticeService);
  const mockDialogService = mock(DialogService);
  const mockRouter = mock(Router);
  const mockI18nService = mock(I18nService);

  configureTestingModule(() => ({
    imports: [DraftOnboardingFormComponent, getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: UserService, useMock: mockUserService },
      { provide: ParatextService, useMock: mockParatextService },
      { provide: OnboardingRequestService, useMock: mockOnboardingRequestService },
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: Router, useMock: mockRouter },
      { provide: I18nService, useMock: mockI18nService }
    ]
  }));

  function makeProjectDoc(tag = 'xyz'): SFProjectProfileDoc {
    return {
      id: projectId,
      data: {
        writingSystem: { tag },
        paratextId: 'pt01',
        texts: [{ bookNum: 1 }, { bookNum: 2 }]
      }
    } as unknown as SFProjectProfileDoc;
  }

  function makeUserDoc(displayName = 'Test User', email = 'test@example.com'): UserDoc {
    return { data: { displayName, email } } as UserDoc;
  }

  class TestEnvironment {
    readonly fixture: ComponentFixture<DraftOnboardingFormComponent>;
    readonly component: DraftOnboardingFormComponent;

    constructor() {
      when(mockActivatedProjectService.projectId).thenReturn(projectId);
      when(mockActivatedProjectService.projectId$).thenReturn(of(projectId));
      when(mockActivatedProjectService.projectDoc).thenReturn(makeProjectDoc());
      when(mockUserService.getCurrentUser()).thenResolve(makeUserDoc());
      when(mockOnboardingRequestService.getOpenOnboardingRequest(anything())).thenResolve(null);
      when(mockParatextService.getProjects()).thenResolve([]);
      when(mockParatextService.getResources()).thenResolve([]);
      when(mockNoticeService.loadingStarted(anything())).thenReturn(undefined as any);
      when(mockNoticeService.loadingFinished(anything())).thenReturn(undefined as any);
      when(mockI18nService.translateStatic(anything())).thenReturn('error');
      when(mockRouter.navigate(anything())).thenResolve(true);

      this.fixture = TestBed.createComponent(DraftOnboardingFormComponent);
      this.component = this.fixture.componentInstance;
    }

    init(): void {
      this.fixture.detectChanges();
    }

    /** Fill all required form fields so the form is valid. */
    fillRequiredFields(): void {
      this.component.signupForm.patchValue({
        name: 'Test User',
        email: 'test@example.com',
        organization: 'Test Org',
        partnerOrganization: 'none',
        translationLanguageName: 'English',
        translationLanguageIsoCode: 'eng',
        completedBooks: [1],
        nextBooksToDraft: [2],
        sourceProjectA: 'sourceA',
        draftingSourceProject: 'draftSource',
        backTranslationStage: 'Not Yet Started'
      });
    }
  }

  // --- Initialization ---

  it('pre-fills name and email from the current user', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockUserService.getCurrentUser()).thenResolve(makeUserDoc('Jane Doe', 'jane@example.com'));
    env.init();
    tick();

    expect(env.component.signupForm.controls.name.value).toBe('Jane Doe');
    expect(env.component.signupForm.controls.email.value).toBe('jane@example.com');
  }));

  it('does not pre-fill email when it is a noreply scriptureforge address', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockUserService.getCurrentUser()).thenResolve(
      makeUserDoc('Jane Doe', 'jane@users.noreply.scriptureforge.org')
    );
    env.init();
    tick();

    expect(env.component.signupForm.controls.email.value).toBe('');
  }));

  it('pre-fills translationLanguageIsoCode from the activated project writing system tag', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockActivatedProjectService.projectDoc).thenReturn(makeProjectDoc('swh'));
    env.init();
    tick();

    expect(env.component.signupForm.controls.translationLanguageIsoCode.value).toBe('swh');
  }));

  it('redirects to draft-generation page after dialog when a request already exists', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockOnboardingRequestService.getOpenOnboardingRequest(projectId)).thenResolve({} as any);
    when(mockDialogService.message(anything(), anything(), anything())).thenResolve(undefined as any);
    env.init();
    tick();

    verify(mockDialogService.message('draft_sources.request_already_submitted', undefined, true)).once();
    verify(mockRouter.navigate(deepEqual(['/projects', projectId, 'draft-generation']))).once();
  }));

  // --- Form validation ---

  it('form is invalid when required fields are empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    expect(env.component.signupForm.valid).toBeFalse();
  }));

  it('form is valid when all required fields are filled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.fillRequiredFields();

    expect(env.component.signupForm.valid).toBeTrue();
  }));

  it('email field is invalid for a non-email string and valid for a proper email', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.signupForm.controls.email.setValue('not-an-email');
    expect(env.component.signupForm.controls.email.valid).toBeFalse();

    env.component.signupForm.controls.email.setValue('valid@example.com');
    expect(env.component.signupForm.controls.email.valid).toBeTrue();
  }));

  // --- Conditional logic: fieldManager ---

  it('fieldManager becomes required and showFieldManagerField is true when partner org is Seed Company', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.signupForm.controls.partnerOrganization.setValue('Seed Company');

    expect(env.component.showFieldManagerField).toBeTrue();
    expect(env.component.signupForm.controls.fieldManager.hasError('required')).toBeTrue();
  }));

  it('fieldManager is cleared and not required when partner org is changed away from Seed Company', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.signupForm.controls.partnerOrganization.setValue('Seed Company');
    env.component.signupForm.controls.fieldManager.setValue('Manager Name');

    env.component.signupForm.controls.partnerOrganization.setValue('Bolshoi Group');

    expect(env.component.showFieldManagerField).toBeFalse();
    expect(env.component.signupForm.controls.fieldManager.value).toBeNull();
    expect(env.component.signupForm.controls.fieldManager.hasError('required')).toBeFalse();
  }));

  // --- Conditional logic: back translation ---

  it('back translation fields become required for "Written (Up-to-Date)" stage', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.signupForm.controls.backTranslationStage.setValue('Written (Up-to-Date)');

    expect(env.component.showBackTranslationProject).toBeTrue();
    expect(env.component.signupForm.controls.backTranslationProject.hasError('required')).toBeTrue();
    expect(env.component.signupForm.controls.backTranslationLanguageName.hasError('required')).toBeTrue();
    expect(env.component.signupForm.controls.backTranslationLanguageIsoCode.hasError('required')).toBeTrue();
  }));

  it('back translation fields become required for "Written (Incomplete or Out-of-Date)" stage', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.signupForm.controls.backTranslationStage.setValue('Written (Incomplete or Out-of-Date)');

    expect(env.component.showBackTranslationProject).toBeTrue();
    expect(env.component.signupForm.controls.backTranslationProject.hasError('required')).toBeTrue();
    expect(env.component.signupForm.controls.backTranslationLanguageName.hasError('required')).toBeTrue();
    expect(env.component.signupForm.controls.backTranslationLanguageIsoCode.hasError('required')).toBeTrue();
  }));

  it('back translation fields are cleared and not required for other stages', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.signupForm.controls.backTranslationStage.setValue('Written (Up-to-Date)');
    env.component.signupForm.controls.backTranslationProject.setValue('someProject');

    env.component.signupForm.controls.backTranslationStage.setValue('Not Yet Started');

    expect(env.component.showBackTranslationProject).toBeFalse();
    expect(env.component.signupForm.controls.backTranslationProject.value).toBeNull();
    expect(env.component.signupForm.controls.backTranslationLanguageName.value).toBe('');
    expect(env.component.signupForm.controls.backTranslationLanguageIsoCode.value).toBe('');
    expect(env.component.signupForm.controls.backTranslationProject.hasError('required')).toBeFalse();
  }));

  // --- Book selection ---

  it('onCompletedBooksSelect updates the completedBooks form control', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.onCompletedBooksSelect([1, 2, 3]);

    expect(env.component.signupForm.controls.completedBooks.value).toEqual([1, 2, 3]);
  }));

  it('onSubmittedBooksSelect updates the nextBooksToDraft form control', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.onSubmittedBooksSelect([4, 5]);

    expect(env.component.signupForm.controls.nextBooksToDraft.value).toEqual([4, 5]);
  }));

  it('showCompletedBooksRequiredError is true only when the field is touched and empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    expect(env.component.showCompletedBooksRequiredError).toBeFalse();

    env.component.signupForm.controls.completedBooks.markAsTouched();
    expect(env.component.showCompletedBooksRequiredError).toBeTrue();

    env.component.onCompletedBooksSelect([1]);
    expect(env.component.showCompletedBooksRequiredError).toBeFalse();
  }));

  it('showPlannedBooksRequiredError is true only when the field is touched and empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    expect(env.component.showPlannedBooksRequiredError).toBeFalse();

    env.component.signupForm.controls.nextBooksToDraft.markAsTouched();
    expect(env.component.showPlannedBooksRequiredError).toBeTrue();

    env.component.onSubmittedBooksSelect([2]);
    expect(env.component.showPlannedBooksRequiredError).toBeFalse();
  }));

  // --- backTranslationProjectSelected ---

  it('fills language fields when the selected project has a different language tag', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockActivatedProjectService.projectDoc).thenReturn(makeProjectDoc('eng'));
    when(mockI18nService.getLanguageDisplayName('fra', anything())).thenReturn('French');
    env.init();
    tick();

    env.component.backTranslationProjectSelected({
      name: 'French Bible',
      shortName: 'FB',
      paratextId: 'fb01',
      languageTag: 'fra'
    } as any);

    expect(env.component.signupForm.controls.backTranslationLanguageIsoCode.value).toBe('fra');
    expect(env.component.signupForm.controls.backTranslationLanguageName.value).toBe('French');
  }));

  it('does not fill language fields when the selected project language matches the activated project language', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockActivatedProjectService.projectDoc).thenReturn(makeProjectDoc('eng'));
    env.init();
    tick();

    env.component.backTranslationProjectSelected({
      name: 'English Bible',
      shortName: 'EB',
      paratextId: 'eb01',
      languageTag: 'eng'
    } as any);

    expect(env.component.signupForm.controls.backTranslationLanguageIsoCode.value).toBe('');
    expect(env.component.signupForm.controls.backTranslationLanguageName.value).toBe('');
  }));

  it('sets ISO code but clears language name when getLanguageDisplayName returns the raw tag', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockActivatedProjectService.projectDoc).thenReturn(makeProjectDoc('eng'));
    when(mockI18nService.getLanguageDisplayName('qaa', anything())).thenReturn('qaa');
    env.init();
    tick();

    env.component.backTranslationProjectSelected({
      name: 'Private Use',
      shortName: 'PU',
      paratextId: 'pu01',
      languageTag: 'qaa'
    } as any);

    expect(env.component.signupForm.controls.backTranslationLanguageIsoCode.value).toBe('qaa');
    expect(env.component.signupForm.controls.backTranslationLanguageName.value).toBe('');
  }));

  // --- Submission ---

  it('calls submitOnboardingRequest and sets uiState to submitted on success', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockOnboardingRequestService.submitOnboardingRequest(anything(), anything())).thenResolve('req01');
    env.init();
    tick();

    env.fillRequiredFields();
    void env.component.onSubmit();
    tick();

    expect(env.component.isSubmitted).toBeTrue();
    verify(mockOnboardingRequestService.submitOnboardingRequest(projectId, anything())).once();
  }));

  it('shows an error notice and resets to editing state on submission failure', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockOnboardingRequestService.submitOnboardingRequest(anything(), anything())).thenReject(
      new Error('network error')
    );
    env.init();
    tick();

    env.fillRequiredFields();
    void env.component.onSubmit();
    tick();

    expect(env.component.isEditing).toBeTrue();
    verify(mockNoticeService.showError(anything())).once();
  }));

  it('marks all fields as touched and shows an error notice when form is invalid on submit', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    void env.component.onSubmit();
    tick();

    expect(env.component.signupForm.touched).toBeTrue();
    verify(mockNoticeService.showError(anything())).once();
    verify(mockOnboardingRequestService.submitOnboardingRequest(anything(), anything())).never();
  }));

  it('does not submit a second time when already in submitting state', fakeAsync(() => {
    const env = new TestEnvironment();
    let resolveSubmit!: (value: string) => void;
    when(mockOnboardingRequestService.submitOnboardingRequest(anything(), anything())).thenReturn(
      new Promise<string>(resolve => (resolveSubmit = resolve))
    );
    env.init();
    tick();

    env.fillRequiredFields();
    void env.component.onSubmit();
    // Both calls pass the initial uiState guard synchronously (uiState is still 'editing' at this point).
    // The post-await guard in onSubmit() catches the second call once the first has set uiState to 'submitting'.
    void env.component.onSubmit();

    resolveSubmit('req01');
    tick();

    verify(mockOnboardingRequestService.submitOnboardingRequest(anything(), anything())).once();
  }));

  // --- cancel() ---

  it('navigates to draft-generation page for the current project when cancelled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.cancel();

    verify(mockRouter.navigate(deepEqual(['/projects', projectId, 'draft-generation']))).once();
    expect(env.component.isEditing).toBeTrue();
  }));

  // --- State getters ---

  it('isEditing, isSubmitting, isSubmitted reflect the current uiState', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();
    tick();

    env.component.uiState = 'editing';
    expect(env.component.isEditing).toBeTrue();
    expect(env.component.isSubmitting).toBeFalse();
    expect(env.component.isSubmitted).toBeFalse();

    env.component.uiState = 'submitting';
    expect(env.component.isEditing).toBeFalse();
    expect(env.component.isSubmitting).toBeTrue();
    expect(env.component.isSubmitted).toBeFalse();

    env.component.uiState = 'submitted';
    expect(env.component.isEditing).toBeFalse();
    expect(env.component.isSubmitting).toBeFalse();
    expect(env.component.isSubmitted).toBeTrue();
  }));
});
