import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
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
      tick();
      env.fixture.detectChanges();

      // Find the language codes confirmation checkbox and click it
      const languageCodesConfirmationComponent = env.fixture.debugElement.query(
        By.css('app-language-codes-confirmation')
      );
      const checkbox = languageCodesConfirmationComponent.query(By.css('input[type="checkbox"]'));
      checkbox.nativeElement.click();
      // Or if the checkbox is in a mat-checkbox:
      const matCheckbox = languageCodesConfirmationComponent.query(By.css('mat-checkbox'));
      matCheckbox.nativeElement.click();
      env.fixture.detectChanges();
      tick();

      const expectedSettingsChangeRequest: SFProjectSettings = {
        alternateSourceEnabled: true,
        alternateSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateSource!.paratextId,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateTrainingSource!.paratextId,
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.additionalTrainingSource!.paratextId
      };

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      // The save method should have passed a specific settings change request.
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('clearing second training source works', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();

      // Find the language codes confirmation checkbox and click it
      const languageCodesConfirmationComponent = env.fixture.debugElement.query(
        By.css('app-language-codes-confirmation')
      );
      const checkbox = languageCodesConfirmationComponent.query(By.css('input[type="checkbox"]'));
      checkbox.nativeElement.click();
      // Or if the checkbox is in a mat-checkbox:
      const matCheckbox = languageCodesConfirmationComponent.query(By.css('mat-checkbox'));
      matCheckbox.nativeElement.click();
      env.fixture.detectChanges();
      tick();

      const expectedSettingsChangeRequest: SFProjectSettings = {
        alternateSourceEnabled: true,
        alternateSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateSource!.paratextId,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateTrainingSource!.paratextId,
        //The second training source, the "additional training source", should not be set.
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: DraftSourcesComponent.projectSettingValueUnset
      };

      // Remove the second training source.
      env.component.trainingSources.pop();
      // Confirm that we have 1 training source.
      expect(env.component.trainingSources.length).toEqual(1);

      env.fixture.detectChanges();
      tick();

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      // The save method should have passed a specific settings change request.
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('clearing first training source works', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();

      // Find the language codes confirmation checkbox and click it
      const languageCodesConfirmationComponent = env.fixture.debugElement.query(
        By.css('app-language-codes-confirmation')
      );
      const checkbox = languageCodesConfirmationComponent.query(By.css('input[type="checkbox"]'));
      checkbox.nativeElement.click();
      // Or if the checkbox is in a mat-checkbox:
      const matCheckbox = languageCodesConfirmationComponent.query(By.css('mat-checkbox'));
      matCheckbox.nativeElement.click();
      env.fixture.detectChanges();
      tick();

      const expectedSettingsChangeRequest: SFProjectSettings = {
        alternateSourceEnabled: true,
        alternateSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateSource!.paratextId,
        //The first training source should be set and should be equal to what the second training source _was_.
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.additionalTrainingSource!.paratextId,
        // And the second training source, the "additional training source", should not be set.
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: DraftSourcesComponent.projectSettingValueUnset
      };

      // Remove the first training source.
      env.component.trainingSources[0] = undefined;
      // Confirm that we have 1 other training source.
      expect(env.component.trainingSources[1]).not.toBeNull();

      env.fixture.detectChanges();
      tick();

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      // The save method should have passed a specific settings change request.
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
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
  readonly usersResources: SelectableProjectWithLanguageCode[];
  readonly usersProjectsSP: SelectableProjectWithLanguageCode[];

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
    const sfProject0: SFProject = createTestProject(
      {
        paratextId: `pt-id-0`,
        resourceConfig: undefined
        // translateConfig: {
        //   draftConfig: {
        //     alternateSourceEnabled: true,
        //     alternateSource: {
        //       paratextId: 'paratextId2',
        //       projectRef: 'sfp2',
        //       name: 'Test project 2',
        //       shortName: 'P2',
        //       writingSystem: { tag: 'en' },
        //       isRightToLeft: false
        //     },
        //     alternateTrainingSourceEnabled: true,
        //     alternateTrainingSource: {
        //       paratextId: 'resource02',
        //       projectRef: 'sfr2',
        //       name: 'Resource 2',
        //       shortName: 'RSC2',
        //       writingSystem: { tag: 'en' },
        //       isRightToLeft: false
        //     },
        //     additionalTrainingSourceEnabled: true,
        //     additionalTrainingSource: {
        //       paratextId: 'paratextId3',
        //       projectRef: 'sfp3',
        //       name: 'Test project 3',
        //       shortName: 'P3',
        //       writingSystem: { tag: 'en' },
        //       isRightToLeft: false
        //     },
        //     additionalTrainingData: false,
        //     lastSelectedTrainingBooks: [],
        //     lastSelectedTrainingDataFiles: [],
        //     lastSelectedTranslationBooks: []
        //   },
        //   source: {
        //     paratextId: 'resource01',
        //     projectRef: 'sfr1',
        //     name: 'Resource 1',
        //     shortName: 'RSC1',
        //     writingSystem: { tag: 'en' },
        //     isRightToLeft: false
        //   },
        //   translationSuggestionsEnabled: false,
        //   preTranslate: true
        // }
      },
      0
    );
    const userSFProjectsAndResourcesCount: number = 6;
    const userNonSFProjectsCount: number = 3;
    const userNonSFResourcesCount: number = 3;
    // Make a set of projects and resources, already on SF, that the user has access to.
    const preparingUsersProjectsAndResourcesOnSF: SFProjectDoc[] = Array.from(
      { length: userSFProjectsAndResourcesCount },
      (_, i) =>
        ({
          id: `sf-id-${i}`,
          data:
            i === 0
              ? sfProject0
              : createTestProject(
                  {
                    paratextId: `pt-id-${i}`,
                    resourceConfig:
                      i < userSFProjectsAndResourcesCount / 2
                        ? undefined
                        : {
                            createdTimestamp: new Date(),
                            manifestChecksum: '1234',
                            permissionsChecksum: '2345',
                            revision: 1
                          }
                  },
                  i
                )
        }) as SFProjectDoc
    );

    this.realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

    // Take the drafted SFProfileDoc objects, and run them into and out of TestRealtimeService so they get fields like
    // `remoteChanges$`.
    this.realtimeService.addSnapshots<SFProject>(SFProjectDoc.COLLECTION, preparingUsersProjectsAndResourcesOnSF);
    const usersProjectsAndResourcesOnSF: SFProjectDoc[] = preparingUsersProjectsAndResourcesOnSF.map(o =>
      this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, o.id)
    );

    // Make a set of projects, not already on SF, that the user should have access to.
    const usersProjectsNotOnSF: ParatextProject[] = Array.from({ length: userNonSFProjectsCount }, (_, i) => ({
      paratextId: `pt-id-${userSFProjectsAndResourcesCount + i}`,
      name: `Test project ${userSFProjectsAndResourcesCount + i}`,
      shortName: `P${userSFProjectsAndResourcesCount + i}`,
      languageTag: 'en',
      projectId: undefined,
      isConnectable: true,
      isConnected: false
    }));

    // Make a set of resources, not already on SF, that the user should have access to.
    // TODO this maybe could just start life as a SPWLT instead of ParatextProject array.
    const usersResourcesNotOnSF: ParatextProject[] = Array.from({ length: userNonSFResourcesCount }, (_, i) => ({
      paratextId: `pt-id-${userSFProjectsAndResourcesCount + userNonSFProjectsCount + i}`,
      name: `Test project ${userSFProjectsAndResourcesCount + userNonSFProjectsCount + i}`,
      shortName: `P${userSFProjectsAndResourcesCount + userNonSFProjectsCount + i}`,
      languageTag: 'en',
      projectId: undefined,
      isConnectable: true,
      isConnected: false
    }));

    const usersProjectsOnSF: SFProjectDoc[] = usersProjectsAndResourcesOnSF
      .filter(p => p.data != null)
      .filter(p => p.data!.resourceConfig == null);
    // Put the non-resource SF projects into a ParatextProject array.
    const usersProjectsOnSFAsPP: ParatextProject[] = usersProjectsOnSF.map(p => ({
      ...translateSourceToSelectableProjectWithLanguageTag(p.data!),
      projectId: p.id,
      isConnectable: false,
      isConnected: true
    }));
    // Array of all non-resource projects the user has access to, whether on SF or not.
    const usersProjects: ParatextProject[] = usersProjectsOnSFAsPP.concat(usersProjectsNotOnSF);
    // All the non-resource projects, whether on SF or not, but as a SelectableProjectWithLanguageCode array.
    this.usersProjectsSP = usersProjects.map(p => ({
      name: p.name,
      shortName: p.shortName,
      paratextId: p.paratextId,
      languageTag: p.languageTag
    }));
    // Array of the user accessible SF resources, as a SelectableProjectWithLanguageCode array.
    const usersResourcesOnSF: SelectableProjectWithLanguageCode[] = usersProjectsAndResourcesOnSF
      .filter(p => p.data != null)
      .filter(p => p.data!.resourceConfig != null)
      .map(p => translateSourceToSelectableProjectWithLanguageTag(p.data!));
    // Array of the user accessible non-SF resources, as a SelectableProjectWithLanguageCode array.
    const usersResourcesNotOnSFSP: SelectableProjectWithLanguageCode[] = usersResourcesNotOnSF.map(p => ({
      name: p.name,
      shortName: p.shortName,
      paratextId: p.paratextId,
      languageTag: p.languageTag
    }));
    // Array of user accessible SF and non-SF resources, as a SelectableProjectWithLanguageCode array.
    this.usersResources = usersResourcesOnSF.concat(usersResourcesNotOnSFSP);

    const usersProjectsAsTS: TranslateSource[] = usersProjectsOnSF.map(p => ({
      paratextId: p.data!.paratextId,
      projectRef: p.id,
      name: p.data!.name,
      shortName: p.data!.shortName,
      writingSystem: p.data!.writingSystem,
      isRightToLeft: p.data!.isRightToLeft
    }));
    const usersResourcesAsTS: TranslateSource[] = usersProjectsAndResourcesOnSF
      .filter(p => p.data != null)
      .filter(p => p.data!.resourceConfig != null)
      .map(p => ({
        paratextId: p.data!.paratextId,
        projectRef: p.id,
        name: p.data!.name,
        shortName: p.data!.shortName,
        writingSystem: p.data!.writingSystem,
        isRightToLeft: p.data!.isRightToLeft
      }));

    // Now that various projects and resources are defined with known SF project ids, write the sf project 0's translate
    // config values.
    sfProject0.translateConfig.source = usersResourcesAsTS[0];
    sfProject0.translateConfig.draftConfig.alternateSourceEnabled = true;
    sfProject0.translateConfig.draftConfig.alternateSource = usersProjectsAsTS[1];
    sfProject0.translateConfig.draftConfig.alternateTrainingSourceEnabled = true;
    sfProject0.translateConfig.draftConfig.alternateTrainingSource = usersResourcesAsTS[2];
    sfProject0.translateConfig.draftConfig.additionalTrainingSourceEnabled = true;
    sfProject0.translateConfig.draftConfig.additionalTrainingSource = usersProjectsAsTS[2];
    sfProject0.translateConfig.draftConfig.additionalTrainingData = false;
    sfProject0.translateConfig.translationSuggestionsEnabled = false;
    sfProject0.translateConfig.preTranslate = true;

    when(mockedParatextService.getProjects()).thenResolve(usersProjects);
    when(mockedParatextService.getResources()).thenResolve(this.usersResources);
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of(usersProjectsAndResourcesOnSF));
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));

    this.activatedProjectDoc = usersProjectsAndResourcesOnSF[0];

    when(mockedActivatedProjectService.changes$).thenReturn(of(this.activatedProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedActivatedProjectService.projectId).thenReturn(this.activatedProjectDoc.id);
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedFeatureFlagService.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(true));

    this.fixture = TestBed.createComponent(DraftSourcesComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();
  }
}
