import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
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

describe('DraftHistoryListComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('should handle a missing build history', () => {
    const env = new TestEnvironment(undefined);
    expect(env.component.history).toEqual([]);
    expect(env.component.historicalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
  });

  it('should handle an empty build history', () => {
    const env = new TestEnvironment([]);
    expect(env.component.history).toEqual([]);
    expect(env.component.historicalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
  });

  it('should handle completed and active builds', fakeAsync(() => {
    const activeBuild = { state: BuildStates.Active } as BuildDto;
    const completedBuild = { state: BuildStates.Completed } as BuildDto;
    const env = new TestEnvironment([completedBuild, activeBuild]);
    expect(env.component.history).toEqual([activeBuild, completedBuild]);
    expect(env.component.historicalBuilds).toEqual([completedBuild]);
    expect(env.component.isBuildActive).toBe(true);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([completedBuild]);
  }));

  it('should handle just one active build', () => {
    const buildHistory = [{ state: BuildStates.Active } as BuildDto];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.historicalBuilds).toEqual([]);
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
    expect(env.component.historicalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBe(build);
    expect(env.component.lastCompletedBuildMessage).not.toBe('');
    expect(env.component.nonActiveBuilds).toEqual(buildHistory);
  }));

  it('should handle just one completed build', fakeAsync(() => {
    const build = { state: BuildStates.Completed } as BuildDto;
    const buildHistory = [build];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.historicalBuilds).toEqual([]);
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
    expect(env.component.historicalBuilds).toEqual([]);
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

      this.fixture = TestBed.createComponent(DraftHistoryListComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }
  }
});
