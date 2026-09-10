import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ChildViewContainerComponent, configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { BrandingService } from '../../core/branding.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import {
  FeedbackPermission,
  FeedbackType,
  PageSource,
  UserFeedbackDialogComponent,
  UserFeedbackDialogResult
} from './user-feedback-dialog.component';

const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedBrandingService = mock(BrandingService);
const mockedActivatedProjectService = mock(ActivatedProjectService);

fdescribe('UserFeedbackDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule(), UserFeedbackDialogComponent, ChildViewContainerComponent],
    providers: [
      provideNoopAnimations(),
      { provide: SFUserProjectsService, useMock: mockedUserProjectsService },
      { provide: BrandingService, useMock: mockedBrandingService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService }
    ]
  }));

  let overlayContainer: OverlayContainer;

  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  it('defaults the selected project to be the current active project', () => {
    const env = new TestEnvironment('paratext01');
    expect(env.component.feedbackForm.controls.paratextId.value).toBe('paratext01');
  });

  it('shows no selected project if there is no currently active project', () => {
    const env = new TestEnvironment(undefined);
    expect(env.component.feedbackForm.controls.paratextId.value).toBe('');
  });

  it('submits the feedback', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment('paratext01', [projectDoc]);

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.setFeedbackText('Great feature!');
    env.clickSubmit();

    expect(result).toEqual({
      sfProjectId: 'project01',
      feedback: 'Great feature!',
      feedbackParams: {
        type: FeedbackType.HowSfImpactedProject,
        source: PageSource.GenerateDraftPage,
        permission: FeedbackPermission.Private,
        feedback: 'Great feature!'
      }
    });
  }));

  it('does not submit the feedback when the feedback field is empty', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment('paratext01', [projectDoc]);

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.clickSubmit();
    expect(env.component.feedbackForm.valid).toBe(false);

    expect(result).toBeUndefined();
  }));

  it('does not submit the feedback when the user cancels', fakeAsync(() => {
    const env = new TestEnvironment(undefined);

    let closed = false;
    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => {
      closed = true;
      result = r;
    });

    env.setFeedbackText('Some feedback that should not be submitted');
    env.clickCancel();

    expect(closed).toBe(true);
    expect(result).toBeUndefined();
  }));
});

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: UserFeedbackDialogComponent;
  readonly dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult>;

  constructor(activeProjectParatextId: string | undefined, projectDocs: SFProjectProfileDoc[] = []) {
    when(mockedBrandingService.siteName).thenReturn('Scripture Forge');
    when(mockedUserProjectsService.projectDocs).thenReturn(projectDocs);
    when(mockedActivatedProjectService.projectDoc).thenReturn(
      activeProjectParatextId == null
        ? undefined
        : ({ data: { paratextId: activeProjectParatextId } } as SFProjectProfileDoc)
    );

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(UserFeedbackDialogComponent, {
      viewContainerRef: this.fixture.componentInstance.childViewContainer
    });
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
  }

  private get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  private get feedbackTextarea(): HTMLTextAreaElement {
    return this.overlayContainerElement.querySelector('#feedback') as HTMLTextAreaElement;
  }

  private get submitButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('#submit-button') as HTMLElement;
  }

  private get cancelButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('#cancel-button') as HTMLElement;
  }

  setFeedbackText(value: string): void {
    this.feedbackTextarea.value = value;
    this.feedbackTextarea.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
  }

  clickSubmit(): void {
    this.submitButton.click();
    flush();
    this.fixture.detectChanges();
    tick();
  }

  clickCancel(): void {
    this.cancelButton.click();
    flush();
    this.fixture.detectChanges();
    tick();
  }
}
