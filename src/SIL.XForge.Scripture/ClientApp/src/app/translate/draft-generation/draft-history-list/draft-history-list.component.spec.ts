import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService, ObservableFeatureFlag } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { SFProjectService } from '../../../core/sf-project.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { DraftGenerationService } from '../draft-generation.service';
import { PROJECT_CHANGE_THROTTLE_TIME } from '../draft-utils';
import { DraftHistoryListComponent } from './draft-history-list.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedI18nService = mock(I18nService);
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
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagsService }
    ]
  }));

  it('should handle a missing build history', fakeAsync(() => {
    const env = new TestEnvironment(undefined);
    expect(env.component.history).toEqual([]);
    expect(env.component.historicalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
    env.complete();
  }));

  it('should handle an empty build history', fakeAsync(() => {
    const env = new TestEnvironment([]);
    expect(env.component.history).toEqual([]);
    expect(env.component.historicalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(false);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
    env.complete();
  }));

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
    env.complete();
  }));

  it('should handle just one active build', fakeAsync(() => {
    const buildHistory = [{ state: BuildStates.Active } as BuildDto];
    const env = new TestEnvironment(buildHistory);
    expect(env.component.history).toEqual(buildHistory);
    expect(env.component.historicalBuilds).toEqual([]);
    expect(env.component.isBuildActive).toBe(true);
    expect(env.component.latestBuild).toBeUndefined();
    expect(env.component.lastCompletedBuildMessage).toBe('');
    expect(env.component.nonActiveBuilds).toEqual([]);
    env.complete();
  }));

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
    env.complete();
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
    env.complete();
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
    env.complete();
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
    env.emitProjectChange();
    expect(env.component.history).toEqual([newBuild, build]);
    env.complete();
  }));

  class TestEnvironment {
    component: DraftHistoryListComponent;
    fixture: ComponentFixture<DraftHistoryListComponent>;
    project$: BehaviorSubject<SFProjectProfileDoc>;

    private projectDoc: SFProjectProfileDoc = {
      id: 'project01',
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;

    constructor(buildHistory: BuildDto[] | undefined) {
      this.project$ = new BehaviorSubject<SFProjectProfileDoc>(this.projectDoc);
      // when(mockedActivatedProjectService.changes$).thenReturn(of(this.projectDoc));
      when(mockedDraftGenerationService.getBuildHistory('project01')).thenReturn(of(buildHistory));
      when(mockedActivatedProjectService.changes$).thenReturn(this.project$.asObservable());
      when(mockedDraftGenerationService.getBuildHistory('project01')).thenReturn(new BehaviorSubject(buildHistory));
      when(mockedFeatureFlagsService.usfmFormat).thenReturn({ enabled: true } as ObservableFeatureFlag);

      this.fixture = TestBed.createComponent(DraftHistoryListComponent);
      this.component = this.fixture.componentInstance;
      tick();
      this.fixture.detectChanges();
    }

    emitProjectChange(): void {
      this.project$.next(this.projectDoc);
      tick(PROJECT_CHANGE_THROTTLE_TIME);
      this.fixture.detectChanges();
    }

    complete(): void {
      this.project$.complete();
    }
  }
});
