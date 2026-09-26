import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject, of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
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
const mockedOnlineStatusService = mock(OnlineStatusService);

describe('UserFeedbackDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule(), UserFeedbackDialogComponent, ChildViewContainerComponent],
    providers: [
      provideNoopAnimations(),
      { provide: SFUserProjectsService, useMock: mockedUserProjectsService },
      { provide: BrandingService, useMock: mockedBrandingService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: OnlineStatusService, useMock: mockedOnlineStatusService }
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

  it('defaults the selected project to be the current active project', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({ activeProjectParatextId: 'paratext01', projectDocs: [projectDoc] });
    expect(env.isProjectSelectVisible).toBe(true);
    expect(env.component.feedbackForm.controls.paratextId.value).toBe('paratext01');
  }));

  it('lists the projects the user is connected to, excluding resources', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const resourceDoc = {
      id: 'resource01',
      data: { paratextId: 'resource16char01', name: 'Resource 01', shortName: 'RES1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({ projectDocs: [projectDoc, resourceDoc] });
    expect(env.component.projects).toEqual([projectDoc.data!]);
  }));

  it('waits until online to load projects', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({ projectDocs: [projectDoc], isOnline: false });
    expect(env.component.projects).toBeUndefined();

    env.isOnline = true;
    expect(env.component.projects).toEqual([projectDoc.data!]);
  }));

  it('shows the project select when the user is not connected to any projects', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.isProjectSelectVisible).toBe(true);
    expect(env.component.projects).toEqual([]);
  }));

  it('shows no selected project if there is no currently active project', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.feedbackForm.controls.paratextId.value).toBe('');
  }));

  it('submits the feedback', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({ activeProjectParatextId: 'paratext01', projectDocs: [projectDoc] });

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.setFeedbackText('Great feature!');
    env.clickSubmit();

    expect(result).toEqual({
      sfProjectId: 'project01',
      feedbackParams: {
        type: FeedbackType.HowSfImpactedProject,
        source: PageSource.GenerateDraftPage,
        permission: FeedbackPermission.Private,
        feedback: 'Great feature!'
      }
    });
  }));

  it('submits the feedback with empty project field', fakeAsync(() => {
    const env = new TestEnvironment(undefined);

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.setFeedbackText('No project selected for feedback');
    env.clickSubmit();

    expect(result).toEqual({
      sfProjectId: '',
      feedbackParams: {
        type: FeedbackType.HowSfImpactedProject,
        source: PageSource.GenerateDraftPage,
        permission: FeedbackPermission.Private,
        feedback: 'No project selected for feedback'
      }
    });
  }));

  it('does not submit the feedback when the feedback field is empty', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({ activeProjectParatextId: 'paratext01', projectDocs: [projectDoc] });

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.clickSubmit();
    expect(env.component.feedbackForm.valid).toBe(false);

    expect(result).toBeUndefined();
  }));

  it('does not submit the feedback when the feedback field only has whitespace', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({ activeProjectParatextId: 'paratext01', projectDocs: [projectDoc] });

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.setFeedbackText('   ');
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

  it('does not submit feedback if a user is offline', fakeAsync(() => {
    const projectDoc = {
      id: 'project01',
      data: { paratextId: 'paratext01', name: 'Project 01', shortName: 'PR1' }
    } as SFProjectProfileDoc;
    const env = new TestEnvironment({
      activeProjectParatextId: 'paratext01',
      projectDocs: [projectDoc],
      isOnline: false
    });

    let result: UserFeedbackDialogResult | undefined;
    env.dialogRef.afterClosed().subscribe(r => (result = r));

    env.setFeedbackText('Some feedback that should not be submitted while offline');
    env.clickSubmit();

    expect(result).toBeUndefined();
  }));
});

interface TestEnvironmentArgs {
  activeProjectParatextId?: string;
  projectDocs?: SFProjectProfileDoc[];
  isOnline?: boolean;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: UserFeedbackDialogComponent;
  readonly dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult>;
  private readonly onlineStatus$: BehaviorSubject<boolean>;

  constructor(args: TestEnvironmentArgs = {}) {
    this.onlineStatus$ = new BehaviorSubject<boolean>(args.isOnline ?? true);
    when(mockedBrandingService.siteName).thenReturn('Scripture Forge');
    when(mockedUserProjectsService.projectDocs).thenReturn(args.projectDocs ?? []);
    when(mockedUserProjectsService.projectDocs$).thenReturn(of(args.projectDocs ?? []));
    when(mockedOnlineStatusService.isOnline).thenCall(() => this.onlineStatus$.value);
    when(mockedOnlineStatusService.onlineStatus$).thenReturn(this.onlineStatus$);
    const projectDoc: SFProjectProfileDoc | undefined =
      args.activeProjectParatextId == null
        ? undefined
        : ({ data: { paratextId: args.activeProjectParatextId } } as SFProjectProfileDoc);
    when(mockedActivatedProjectService.projectDoc).thenReturn(projectDoc);
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(UserFeedbackDialogComponent, {
      viewContainerRef: this.fixture.componentInstance.childViewContainer
    });
    this.component = this.dialogRef.componentInstance;
    tick();
    this.fixture.detectChanges();
    tick();
  }

  set isOnline(value: boolean) {
    this.onlineStatus$.next(value);
    tick();
    this.fixture.detectChanges();
  }

  get isProjectSelectVisible(): boolean {
    return this.overlayContainerElement.querySelector('app-project-select') != null;
  }

  private get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  private get feedbackTextarea(): HTMLTextAreaElement {
    return this.overlayContainerElement.querySelector('#feedback-input') as HTMLTextAreaElement;
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
