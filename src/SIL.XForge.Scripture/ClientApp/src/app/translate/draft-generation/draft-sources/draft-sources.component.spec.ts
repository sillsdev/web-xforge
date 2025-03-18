import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectSettings } from '../../../core/models/sf-project-settings';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { translateSourceToSelectableProjectWithLanguageTag } from '../draft-utils';
import { DraftSourcesComponent, sourceArraysToSettingsChange } from './draft-sources.component';

const mockedParatextService = mock(ParatextService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedSFProjectService = mock(SFProjectService);
const mockedSFUserProjectsService = mock(SFUserProjectsService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedAuthService = mock(AuthService);

describe('DraftSourcesComponent', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), NoopAnimationsModule, TestTranslocoModule],
    declarations: [],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: DraftSourcesService, useMock: mockedDraftSourcesService },
      { provide: SFUserProjectsService, useMock: mockedSFUserProjectsService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService },
      { provide: AuthService, useMock: mockedAuthService }
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

  it('loads projects and resources on init', fakeAsync(() => {
    const env = new TestEnvironment();
    verify(mockedParatextService.getProjects()).once();
    verify(mockedParatextService.getResources()).once();
    expect(env.component.projects).toBeDefined();
    expect(env.component.resources).toBeDefined();
  }));

  describe('save', () => {
    it('should save the settings', fakeAsync(() => {
      const env = new TestEnvironment();
      const draftingSource: SelectableProjectWithLanguageCode = {
        paratextId: 'drafting-source-pt-id'
      } as SelectableProjectWithLanguageCode;
      const trainingSource1: SelectableProjectWithLanguageCode = {
        paratextId: 'training-source-pt-id-1'
      } as SelectableProjectWithLanguageCode;
      const trainingSource2: SelectableProjectWithLanguageCode = {
        paratextId: 'training-source-pt-id-2'
      } as SelectableProjectWithLanguageCode;
      const trainingTarget: SFProjectProfile = env.activatedProjectDoc.data!;

      // Set component state.
      env.component.draftingSources = [draftingSource];
      env.component.trainingSources = [trainingSource1, trainingSource2];
      env.component.trainingTargets = [trainingTarget];
      env.component.languageCodesConfirmed = true;

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual({});
    }));
  });

  describe('sourceArraysToSettingsChange', () => {
    const currentProjectParatextId = 'project01';
    const mockProject1: DraftSource = {
      paratextId: 'pt01',
      name: 'Project 1',
      shortName: 'PRJ1',
      projectRef: '',
      writingSystem: { tag: 'en' },
      texts: []
    };
    const mockProject2: DraftSource = {
      paratextId: 'pt02',
      name: 'Project 2',
      shortName: 'PRJ2',
      projectRef: '',
      writingSystem: { tag: 'en' },
      texts: []
    };
    const mockTarget: DraftSource = {
      paratextId: currentProjectParatextId,
      texts: [],
      projectRef: '',
      name: '',
      shortName: '',
      writingSystem: { tag: 'en' }
    };
    const someOtherTarget: DraftSource = {
      paratextId: 'some-other-id',
      texts: [],
      projectRef: '',
      name: '',
      shortName: '',
      writingSystem: { tag: 'en' }
    };

    it('should handle empty sources', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [],
        trainingTargets: [mockTarget]
      };

      const result = sourceArraysToSettingsChange(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );

      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: 'unset'
      });
    });

    it('should handle one training source', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [mockProject1],
        trainingTargets: [mockTarget]
      };

      const result = sourceArraysToSettingsChange(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId: mockProject1.paratextId
      });
    });

    it('should handle two training sources', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [mockProject1, mockProject2],
        trainingTargets: [mockTarget]
      };

      const result = sourceArraysToSettingsChange(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId: mockProject2.paratextId,
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId: mockProject1.paratextId
      });
    });

    it('should handle one drafting source', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [mockProject1],
        trainingSources: [],
        trainingTargets: [mockTarget]
      };

      const result = sourceArraysToSettingsChange(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: true,
        alternateSourceParatextId: mockProject1.paratextId,
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: 'unset'
      });
    });

    it('should handle full configuration', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [mockProject1],
        trainingSources: [mockProject1, mockProject2],
        trainingTargets: [mockTarget]
      };

      const result = sourceArraysToSettingsChange(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId: mockProject2.paratextId,
        alternateSourceEnabled: true,
        alternateSourceParatextId: mockProject1.paratextId,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId: mockProject1.paratextId
      });
    });

    it('should throw error if training target is not current project', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [],
        trainingTargets: [someOtherTarget]
      };

      expect(() =>
        sourceArraysToSettingsChange(
          sources.trainingSources,
          sources.draftingSources,
          sources.trainingTargets,
          currentProjectParatextId
        )
      ).toThrow();
    });

    it('should handle undefined sources in arrays', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [],
        trainingTargets: [mockTarget]
      };

      const result = sourceArraysToSettingsChange(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: 'unset'
      });
    });
  });
});

class TestEnvironment {
  readonly component: DraftSourcesComponent;
  readonly fixture: ComponentFixture<DraftSourcesComponent>;
  readonly realtimeService: TestRealtimeService;
  readonly activatedProjectDoc: SFProjectDoc;

  // private readonly mockProjects: SelectableProject[] = [
  //   { paratextId: 'paratextId1', name: 'Test project 1', shortName: 'P1' },
  //   { paratextId: 'paratextId2', name: 'Test project 2', shortName: 'P2' },
  //   { paratextId: 'paratextId3', name: 'Test project 3', shortName: 'P3' }
  // ];

  // private readonly mockResources: SelectableProjectWithLanguageCode[] = [
  //   { paratextId: 'resource01', name: 'Resource 1', shortName: 'RSC1', languageTag: 'en' },
  //   { paratextId: 'resource02', name: 'Resource 2', shortName: 'RSC2', languageTag: 'en' }
  // ];

  constructor() {
    const userSFProjectsCount: number = 6;
    // Make a set of projects and resources, already on SF, that the user has access to.
    const usersProjectsAndResourcesOnSF: SFProjectDoc[] = Array.from(
      { length: userSFProjectsCount },
      (_, i) =>
        ({
          id: `sf-id-${i}`,
          data: createTestProject({
            paratextId: `pt-id-${i}`,
            resourceConfig:
              i <= userSFProjectsCount / 2
                ? undefined
                : { createdTimestamp: new Date(), manifestChecksum: '1234', permissionsChecksum: '2345', revision: 1 }
          })
        }) as SFProjectDoc
    );

    // Put the non-resource projects into a ParatextProject array.
    const usersProjectsOnSF: ParatextProject[] = usersProjectsAndResourcesOnSF
      .filter(p => p.data != null)
      .filter(p => p.data!.resourceConfig == null)
      .map(p => ({
        ...translateSourceToSelectableProjectWithLanguageTag(p.data!),
        projectId: p.id,
        isConnectable: false,
        isConnected: true
      }));
    const userProjectsNotOnSF: ParatextProject[] = Array.from({ length: 3 }, (_, i) => ({
      paratextId: `pt-id-${userSFProjectsCount + i}`,
      name: `Test project ${userSFProjectsCount + i}`,
      shortName: `P${userSFProjectsCount + i}`,
      languageTag: 'en',
      projectId: undefined,
      isConnectable: true,
      isConnected: false
    }));
    const usersProjects = usersProjectsOnSF.concat(userProjectsNotOnSF);
    // Put the resources into a SelectableProjectWithLanguageCode array.
    const usersResourcesOnSF: SelectableProjectWithLanguageCode[] = usersProjectsAndResourcesOnSF
      .filter(p => p.data != null)
      .filter(p => p.data!.resourceConfig != null)
      .map(p => translateSourceToSelectableProjectWithLanguageTag(p.data!));

    this.realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

    when(mockedParatextService.getProjects()).thenResolve(usersProjects);
    when(mockedParatextService.getResources()).thenResolve(usersResourcesOnSF);
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of(usersProjectsAndResourcesOnSF));
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));

    this.activatedProjectDoc = {
      id: 'sfp1',
      data: createTestProject({
        translateConfig: {
          draftConfig: {
            alternateSourceEnabled: true,
            alternateSource: {
              paratextId: 'paratextId2',
              projectRef: 'sfp2',
              name: 'Test project 2',
              shortName: 'P2',
              writingSystem: { tag: 'en' },
              isRightToLeft: false
            },
            alternateTrainingSourceEnabled: true,
            alternateTrainingSource: {
              paratextId: 'resource02',
              projectRef: 'sfr2',
              name: 'Resource 2',
              shortName: 'RSC2',
              writingSystem: { tag: 'en' },
              isRightToLeft: false
            },
            additionalTrainingSourceEnabled: true,
            additionalTrainingSource: {
              paratextId: 'paratextId3',
              projectRef: 'sfp3',
              name: 'Test project 3',
              shortName: 'P3',
              writingSystem: { tag: 'en' },
              isRightToLeft: false
            }
          },
          source: {
            paratextId: 'resource01',
            projectRef: 'sfr1',
            name: 'Resource 1',
            shortName: 'RSC1',
            writingSystem: { tag: 'en' },
            isRightToLeft: false
          }
        }
      })
    } as SFProjectDoc;

    this.realtimeService.addSnapshots<SFProject>(SFProjectDoc.COLLECTION, [this.activatedProjectDoc]);

    when(mockedActivatedProjectService.changes$).thenReturn(of(this.activatedProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedActivatedProjectService.projectId).thenReturn(this.activatedProjectDoc.id);
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedFeatureFlagService.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(true));
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of([this.activatedProjectDoc]));

    this.fixture = TestBed.createComponent(DraftSourcesComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();
  }
}
