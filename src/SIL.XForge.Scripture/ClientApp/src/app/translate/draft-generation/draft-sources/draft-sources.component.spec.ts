import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { TestActivatedProjectModule } from '../../../../xforge-common/activated-project.service';
import {
  createTestFeatureFlag,
  FeatureFlagService
} from '../../../../xforge-common/feature-flags/feature-flag.service';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { ElementState } from '../../../../xforge-common/models/element-state';
import { NoticeService } from '../../../../xforge-common/notice.service';
import { SFUserProjectsService } from '../../../../xforge-common/user-projects.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ParatextService, SelectableProject, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { PermissionsService } from '../../../core/permissions.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { DraftSourcesComponent, sourceArraysToSettingsChange } from './draft-sources.component';

interface PTProjectMultiMetadata {
  sfProjectId?: string;
  selectableProject?: SelectableProject;
  selectableProjectWithLanguageCode?: SelectableProjectWithLanguageCode;
  paratextProject?: ParatextProject;
  sfProjectProfile?: SFProjectProfile;
  sfProject?: SFProject;
  isResource?: boolean;
}

const mockedParatextService = mock(ParatextService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedSFProjectService = mock(SFProjectService);
const mockedSFUserProjectsService = mock(SFUserProjectsService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedPermissionsService = mock(PermissionsService);

describe('DraftSourcesComponent', () => {
  configureTestingModule(() => ({
    imports: [
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NoopAnimationsModule,
      TestTranslocoModule,
      TestActivatedProjectModule.forRoot('project01', mockedSFProjectService, mockedPermissionsService)
    ],
    declarations: [],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: DraftSourcesService, useMock: mockedDraftSourcesService },
      { provide: SFUserProjectsService, useMock: mockedSFUserProjectsService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService }
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

  it('should not save when language codes are not confirmed', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.languageCodesConfirmed = false;

    env.component.save();
    tick();

    verify(mockedSFProjectService.onlineUpdateSettings(anything(), anything())).never();
  }));

  it('updates control state during save', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedSFProjectService.onlineUpdateSettings(anything(), anything())).thenResolve();
    env.component.languageCodesConfirmed = true;

    env.component.save();
    tick();

    expect(env.component.getControlState('projectSettings')).toBe(ElementState.Submitted);
    verify(mockedSFProjectService.onlineUpdateSettings('project01', anything())).once();
  }));

  it('shows error state when save fails', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedSFProjectService.onlineUpdateSettings(anything(), anything())).thenReject(new Error('error saving'));
    env.component.languageCodesConfirmed = true;

    env.component.save();
    tick();

    expect(env.component.getControlState('projectSettings')).toBe(ElementState.Error);
    verify(mockedSFProjectService.onlineUpdateSettings('project01', anything())).once();
  }));

  it('shows submitting state while saving', fakeAsync(() => {
    const env = new TestEnvironment();
    let resolvePromise: () => void;
    const savePromise = new Promise<void>(resolve => {
      resolvePromise = resolve;
    });
    when(mockedSFProjectService.onlineUpdateSettings(anything(), anything())).thenReturn(savePromise);
    env.component.languageCodesConfirmed = true;

    env.component.save();
    tick();

    expect(env.component.getControlState('projectSettings')).toBe(ElementState.Submitted);
    resolvePromise!();
    tick();
    expect(env.component.getControlState('projectSettings')).toBe(ElementState.Submitted);
  }));

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
        draftingSources: [undefined],
        trainingSources: [undefined, undefined],
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

  constructor() {
    this.realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

    const sfProjectDocs: SFProjectDoc[] = [
      {
        id: 'sfp1',
        data: createTestProject({
          paratextId: 'ptp1',
          shortName: 'PRJ1',
          writingSystem: { tag: 'en' }
        })
      },
      {
        id: 'sfp2',
        data: createTestProject({
          paratextId: 'ptp2',
          shortName: 'PRJ2',
          writingSystem: { tag: 'en' }
        })
      },
      {
        id: 'sfp3',
        data: createTestProject({
          paratextId: 'ptp3',
          shortName: 'PRJ3',
          writingSystem: { tag: 'en' },
          resourceConfig: {
            createdTimestamp: Date.now(),
            manifestChecksum: '123',
            permissionsChecksum: '123',
            revision: 1
          }
        })
      }
    ] as SFProjectDoc[];

    // Projects that are not in SF yet.
    const moreProjects: SelectableProjectWithLanguageCode[] = [
      { paratextId: 'project01', name: 'Project 1', shortName: 'PRJ1', languageTag: 'en' },
      { paratextId: 'project02', name: 'Project 2', shortName: 'PRJ2', languageTag: 'en' }
    ];

    const userPTProjectsAsMulti: PTProjectMultiMetadata[] = sfProjectDocs.map<PTProjectMultiMetadata>(doc => ({
      sfProjectId: doc.id,
      sfProject: doc.data,
      paratextProject: {
        paratextId: doc.data!.paratextId,
        name: doc.data!.name,
        shortName: doc.data!.shortName,
        languageTag: doc.data!.writingSystem.tag,
        projectId: doc.id,
        isConnectable: true,
        isConnected: true
      }
    }));

    const moreProjectsAsMulti: PTProjectMultiMetadata[] = moreProjects.map<PTProjectMultiMetadata>(project => ({
      paratextProject: {
        paratextId: project.paratextId,
        name: project.name,
        shortName: project.shortName,
        languageTag: project.languageTag,
        isConnectable: true,
        isConnected: false
      }
    }));

    const userPTResourcesAsMulti: PTProjectMultiMetadata[] = sfProjectDocs
      .filter(x => x.data!.resourceConfig != null)
      .map<PTProjectMultiMetadata>(doc => ({
        sfProjectId: doc.id,
        selectableProjectWithLanguageCode: {
          name: doc.data!.name,
          shortName: doc.data!.shortName,
          paratextId: doc.data!.paratextId,
          languageTag: doc.data!.writingSystem.tag
        }
      }));

    // Resources that are not in SF yet.
    const moreResources: SelectableProjectWithLanguageCode[] = [
      { paratextId: 'resource01', name: 'Resource 1', shortName: 'RSC1', languageTag: 'en' },
      { paratextId: 'resource02', name: 'Resource 2', shortName: 'RSC2', languageTag: 'en' }
    ];

    when(mockedParatextService.getProjects()).thenResolve(
      [...userPTProjectsAsMulti.map(x => x.paratextProject), ...moreProjectsAsMulti.map(x => x.paratextProject)].filter(
        x => x != null
      )
    );
    when(mockedParatextService.getResources()).thenResolve(
      [...userPTResourcesAsMulti.map(x => x.selectableProjectWithLanguageCode), ...moreResources].filter(x => x != null)
    );
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));
    // const draftProjectSources: DraftSourcesAsArrays = {
    //   trainingSources: [instance(mock<DraftSource>()), instance(mock<DraftSource>())],
    //   trainingTargets: [
    //     {
    //       paratextId: 'project01',
    //       shortName: 'PRJ1',
    //       writingSystem: { tag: 'en' }
    //     } as DraftSource
    //   ],
    //   draftingSources: [instance(mock<DraftSource>())]
    // };
    // when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(of(draftProjectSources));
    when(mockedFeatureFlagService.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(true));
    // TODO return actual list
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of(sfProjectDocs));

    // when(mockedActivatedProjectService.projectId).thenReturn('project01');
    // when(mockedActivatedProjectService.projectDoc).thenReturn({
    //   id: 'project01',
    //   data: {
    //     paratextId: 'project01',
    //     shortName: 'PRJ1',
    //     writingSystem: { tag: 'en' }
    //   }
    // } as SFProjectProfileDoc);

    this.fixture = TestBed.createComponent(DraftSourcesComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();
  }
}
