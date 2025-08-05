import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHistoryListComponent } from './draft-history-list.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedI18nService = mock(I18nService);
const mockedProjectNotificationService = mock(ProjectNotificationService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedFeatureFlagsService = mock(FeatureFlagService);

describe('DraftHistoryListComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      RouterModule.forRoot([])
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagsService }
    ]
  }));

  it('should handle a missing build history', () => {
    const env = new TestEnvironment(undefined);
    expect(env.component.history).toEqual([]);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
  });

  it('should handle an empty build history', () => {
    const env = new TestEnvironment([]);
    expect(env.component.history).toEqual([]);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
  });

  it('should handle completed and active builds', fakeAsync(() => {
    const activeBuild = { state: BuildStates.Active } as BuildDto;
    const completedBuild = {
      state: BuildStates.Completed,
      additionalInfo: { dateGenerated: '2025-08-01T12:00:00.000Z' }
    } as BuildDto;
    const env = new TestEnvironment([completedBuild, activeBuild]);
    expect(env.component.history).toEqual([activeBuild, completedBuild]);
    expect(env.component.savedHistoricalBuilds).toEqual([completedBuild]);
    expect(env.component.isBuildActive).toBe(true);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([completedBuild]);
  }));

  it('should handle just one active build', () => {
    const buildHistory = [{ state: BuildStates.Active } as BuildDto];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(true);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
  });

  it('should handle just one canceled build', fakeAsync(() => {
    const build = { state: BuildStates.Canceled } as BuildDto;
    const buildHistory = [build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);
    expect(env.component.lastCompletedBuildMessage).not.toBe('');
    expect(env.component.nonActiveBuilds).toEqual(buildHistory);
  }));

  it('should handle just one completed build', fakeAsync(() => {
    const build = {
      state: BuildStates.Completed,
      additionalInfo: { dateGenerated: '2025-08-01T12:00:00.000Z' }
    } as BuildDto;
    const buildHistory = [build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);
    expect(env.component.lastCompletedBuildMessage).not.toBe('');
    expect(env.component.nonActiveBuilds).toEqual(buildHistory);
  }));

  it('should handle just one faulted build', fakeAsync(() => {
    const build = { state: BuildStates.Faulted } as BuildDto;
    const buildHistory = [build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);
    expect(env.component.lastCompletedBuildMessage).not.toBe('');
    expect(env.component.nonActiveBuilds).toEqual(buildHistory);
  }));

  it('should handle new build started', fakeAsync(() => {
    const build = { state: BuildStates.Completed } as BuildDto;
    const buildHistory = [build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);

    const newBuild = { state: BuildStates.Active } as BuildDto;
    when(mockedDraftGenerationService.getBuildHistory('project01')).thenReturn(of([build, newBuild]));
    // simulate when project notification is updated
    env.component.loadHistory('project01');
    env.fixture.detectChanges();
    expect(env.component.history).toEqual([newBuild, build]);
  }));

  it('should filter draft history and hide builds that are not saved to the database', fakeAsync(() => {
    const build = {
      state: BuildStates.Completed,
      additionalInfo: { dateGenerated: '2025-08-01T12:00:00.000Z' }
    } as BuildDto;
    const olderBuild = {
      state: BuildStates.Completed
    } as BuildDto;
    const buildHistory = [olderBuild, build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.savedHistoricalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);
    expect(env.component.lastCompletedBuildMessage).not.toBe('');
    expect(env.component.nonActiveBuilds).toEqual(buildHistory);
    expect(env.olderDraftsMessage).not.toBeNull();
  }));

  it('should show history with faulted and canceled builds', fakeAsync(() => {
    const build = {
      id: 'completed',
      state: BuildStates.Completed,
      additionalInfo: { dateGenerated: '2025-08-01T12:00:00.000Z' }
    } as BuildDto;
    const canceled = {
      id: 'canceled',
      state: BuildStates.Canceled
    } as BuildDto;
    const faulted = {
      id: 'faulted',
      state: BuildStates.Faulted
    } as BuildDto;
    const buildHistory = [faulted, canceled, build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.savedHistoricalBuilds).toEqual([canceled, faulted]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);
    expect(env.component.lastCompletedBuildMessage).not.toBe('');
    expect(env.component.nonActiveBuilds).toEqual(buildHistory);
  }));

  class TestEnvironment {
    component: DraftHistoryListComponent;
    fixture: ComponentFixture<DraftHistoryListComponent>;

    constructor(buildHistory: BuildDto[] | undefined) {
      when(mockedActivatedProjectService.projectId$).thenReturn(of('project01'));
      when(mockedActivatedProjectService.changes$).thenReturn(of(undefined)); // Required for DraftPreviewBooksComponent
      when(mockedDraftGenerationService.getBuildHistory('project01')).thenReturn(new BehaviorSubject(buildHistory));
      when(mockedFeatureFlagsService.usfmFormat).thenReturn(createTestFeatureFlag(true));

      this.fixture = TestBed.createComponent(DraftHistoryListComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    get olderDraftsMessage(): HTMLElement {
      return this.fixture.nativeElement.querySelector('.older-drafts');
    }
  }
});
