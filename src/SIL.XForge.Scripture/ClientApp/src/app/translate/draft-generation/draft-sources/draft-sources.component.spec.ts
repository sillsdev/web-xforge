import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { NoticeService } from '../../../../xforge-common/notice.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ParatextService, SelectableProject } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { draftSourceArraysToDraftSourcesConfig, DraftSourcesComponent } from './draft-sources.component';

const mockedParatextService = mock(ParatextService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedSFProjectService = mock(SFProjectService);

describe('DraftSourcesComponent', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), TestTranslocoModule],
    declarations: [],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: DraftSourcesService, useMock: mockedDraftSourcesService }
    ]
  }));

  it('loads projects and resources on init', fakeAsync(() => {
    const env = new TestEnvironment();
    verify(mockedParatextService.getProjects()).once();
    verify(mockedParatextService.getResources()).once();
    expect(env.component.projects).toBeDefined();
    expect(env.component.resources).toBeDefined();
  }));

  describe('draftSourceArraysToDraftSourcesConfig', () => {
    const currentProjectParatextId = 'project01';
    const mockProject1: DraftSource = {
      paratextId: 'pt01',
      name: 'Project 1',
      shortName: 'PRJ1',
      projectRef: '',
      writingSystem: undefined,
      texts: []
    };
    const mockProject2: DraftSource = {
      paratextId: 'pt02',
      name: 'Project 2',
      shortName: 'PRJ2',
      projectRef: '',
      writingSystem: undefined,
      texts: []
    };
    const mockTarget: DraftSource = {
      paratextId: currentProjectParatextId,
      texts: [],
      projectRef: '',
      name: '',
      shortName: '',
      writingSystem: undefined
    };
    const someOtherTarget: DraftSource = {
      paratextId: 'some-other-id',
      texts: [],
      projectRef: '',
      name: '',
      shortName: '',
      writingSystem: undefined
    };

    it('should handle empty sources', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [],
        trainingTargets: [mockTarget]
      };

      const result = draftSourceArraysToDraftSourcesConfig(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );

      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: undefined,
        alternateSourceEnabled: false,
        alternateSourceParatextId: undefined,
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: undefined
      });
    });

    it('should handle one training source', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [],
        trainingSources: [mockProject1],
        trainingTargets: [mockTarget]
      };

      const result = draftSourceArraysToDraftSourcesConfig(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: undefined,
        alternateSourceEnabled: false,
        alternateSourceParatextId: undefined,
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

      const result = draftSourceArraysToDraftSourcesConfig(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId: mockProject2.paratextId,
        alternateSourceEnabled: false,
        alternateSourceParatextId: undefined,
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

      const result = draftSourceArraysToDraftSourcesConfig(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: undefined,
        alternateSourceEnabled: true,
        alternateSourceParatextId: mockProject1.paratextId,
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: undefined
      });
    });

    it('should handle full configuration', () => {
      const sources: DraftSourcesAsArrays = {
        draftingSources: [mockProject1],
        trainingSources: [mockProject1, mockProject2],
        trainingTargets: [mockTarget]
      };

      const result = draftSourceArraysToDraftSourcesConfig(
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
        draftSourceArraysToDraftSourcesConfig(
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

      const result = draftSourceArraysToDraftSourcesConfig(
        sources.trainingSources,
        sources.draftingSources,
        sources.trainingTargets,
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: undefined,
        alternateSourceEnabled: false,
        alternateSourceParatextId: undefined,
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: undefined
      });
    });
  });
});

class TestEnvironment {
  readonly component: DraftSourcesComponent;
  readonly fixture: ComponentFixture<DraftSourcesComponent>;
  readonly realtimeService: TestRealtimeService;

  private readonly mockProjects: SelectableProject[] = [
    { paratextId: 'project01', name: 'Project 1', shortName: 'PRJ1' },
    { paratextId: 'project02', name: 'Project 2', shortName: 'PRJ2' }
  ];

  private readonly mockResources: SelectableProject[] = [
    { paratextId: 'resource01', name: 'Resource 1', shortName: 'RSC1' },
    { paratextId: 'resource02', name: 'Resource 2', shortName: 'RSC2' }
  ];

  constructor() {
    this.realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

    when(mockedParatextService.getProjects()).thenResolve(this.mockProjects as ParatextProject[]);
    when(mockedParatextService.getResources()).thenResolve(this.mockResources);
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));
    when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(of(instance(mock<DraftSourcesAsArrays>())));

    this.fixture = TestBed.createComponent(DraftSourcesComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();
  }
}
