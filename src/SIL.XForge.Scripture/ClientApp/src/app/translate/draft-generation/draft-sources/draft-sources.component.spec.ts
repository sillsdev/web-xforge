import { OverlayContainer } from '@angular/cdk/overlay';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of, Subject } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { hasData, notNull, WithData } from '../../../../type-utils';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectSettings } from '../../../core/models/sf-project-settings';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { translateSourceToSelectableProjectWithLanguageTag } from '../draft-utils';
import { DraftSourcesComponent, sourceArraysToSettingsChange } from './draft-sources.component';

/** This interface allows specification of a project using multiple types at once, to help the spec provide the
 * different types required by the component. */
interface MultiTypeProjectDescription {
  paratextProject: ParatextProject;
  selectableProjectWithLanguageCode: SelectableProjectWithLanguageCode;
  projectType: 'project' | 'resource';
  /** sfProjectDoc may be undefined if the project is not in SF. */
  sfProjectDoc: WithData<SFProjectDoc> | undefined;
  /** translateSource may be undefined if the project is not in SF. */
  translateSource: TranslateSource | undefined;
}

const mockedParatextService = mock(ParatextService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedSFProjectService = mock(SFProjectService);
const mockedSFUserProjectsService = mock(SFUserProjectsService);
const mockedAuthService = mock(AuthService);

describe('DraftSourcesComponent', () => {
  configureTestingModule(() => ({
    imports: [
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NoopAnimationsModule,
      TestTranslocoModule
    ],
    declarations: [],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: DraftSourcesService, useMock: mockedDraftSourcesService },
      { provide: SFUserProjectsService, useMock: mockedSFUserProjectsService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
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
      expect(env.component['changesMade']).toBe(false);
      env.clickLanguageCodesConfirmationCheckbox();
      // Suppose the user loads up the sources configuration page, changes no projects, and clicks Save. The settings
      // change request will just correspond to what the project already has for its settings.
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
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
      expect(env.component.needsConfirmation()).toBe(false);
    }));

    it('clearing second training source works', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();
      expect(env.component['changesMade']).toBe(false);

      // Suppose the user loads up the page, clears the second training/reference project box, and clicks Save. The
      // settings change request will show a requested change for unsetting the additional-training-source.
      const expectedSettingsChangeRequest: SFProjectSettings = {
        alternateSourceEnabled: true,
        alternateSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateSource!.paratextId,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateTrainingSource!.paratextId,
        // The second training source, the "additional training source", should not be set.
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: DraftSourcesComponent.projectSettingValueUnset
      };

      // Remove the second training source.
      env.component.trainingSources.pop();
      // Confirm that we have 1 training source.
      expect(env.component.trainingSources.length).toEqual(1);
      env.component['changesMade'] = true;
      env.fixture.detectChanges();
      tick();
      expect(env.component.needsConfirmation()).toBe(true);

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
      expect(env.component.needsConfirmation()).toBe(false);
    }));

    it('clearing first training source works', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      expect(env.component['changesMade']).toBe(false);
      env.clickLanguageCodesConfirmationCheckbox();

      // Suppose the user comes to the page, leaves the second reference/training project selection alone, and clears
      // the first reference/training project selection. Let's respond by clearing the additional-training-source, and
      // setting the alternate-training-source to the remaining reference/training project that is still specified.
      const expectedSettingsChangeRequest: SFProjectSettings = {
        alternateSourceEnabled: true,
        alternateSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateSource!.paratextId,
        // The first training source should be set and should be equal to what the second training source _was_.
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
      env.component['changesMade'] = true;
      env.fixture.detectChanges();
      tick();
      expect(env.component.needsConfirmation()).toBe(true);

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
      expect(env.component.needsConfirmation()).toBe(false);
    }));

    it('fails to save and sync', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      expect(env.component.needsConfirmation()).toBe(false);
      env.clickLanguageCodesConfirmationCheckbox();

      // Remove the second training source.
      env.component.trainingSources.pop();
      // Confirm that we have 1 training source.
      expect(env.component.trainingSources.length).toEqual(1);
      env.component['changesMade'] = true;
      env.fixture.detectChanges();
      tick();

      // Simulate failed response
      when(mockedSFProjectService.onlineUpdateSettings(anything(), anything())).thenReject(
        new CommandError(CommandErrorCode.Other, '504 Gateway Timeout')
      );
      expect(env.component.needsConfirmation()).toBe(true);

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      expect(env.component.needsConfirmation()).toBe(false);
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

    it('should disable save and sync button and display offline message when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.testOnlineStatusService.setIsOnline(false);
      env.fixture.detectChanges();
      tick();

      const offlineMessage: DebugElement = env.fixture.debugElement.query(By.css('#offline-message'));
      expect(offlineMessage).not.toBeNull();

      const saveButton: DebugElement = env.fixture.debugElement.query(By.css('#save_button'));
      expect(saveButton.attributes.disabled).toBe('true');
    }));

    it('should enable save & sync button and not display offline message when online', fakeAsync(() => {
      const env = new TestEnvironment();
      env.testOnlineStatusService.setIsOnline(true);
      env.fixture.detectChanges();
      tick();

      const offlineMessage: DebugElement = env.fixture.debugElement.query(By.css('#offline-message'));
      expect(offlineMessage).toBeNull();

      const saveButton: DebugElement = env.fixture.debugElement.query(By.css('#save_button'));
      expect(saveButton.attributes.disabled).toBeUndefined();
    }));
  });
});

class TestEnvironment {
  readonly component: DraftSourcesComponent;
  readonly fixture: ComponentFixture<DraftSourcesComponent>;
  readonly realtimeService: TestRealtimeService;
  readonly activatedProjectDoc: WithData<SFProjectDoc>;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private projectsLoaded$: Subject<void> = new Subject<void>();

  constructor() {
    const userSFProjectsAndResourcesCount: number = 6;
    const userNonSFProjectsCount: number = 3;
    const userNonSFResourcesCount: number = 3;

    this.realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

    // Make some projects and resources, already on SF, that the user has access to. These will be available as a
    // variety of types.

    const projects: MultiTypeProjectDescription[] = Array.from(
      { length: userSFProjectsAndResourcesCount },
      (_, i) =>
        ({
          id: `sf-id-${i}`,
          data: createTestProject(
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
    )
      .map(o => {
        // Run it into and out of realtime service so it has fields like `remoteChanges$`.
        this.realtimeService.addSnapshot(SFProjectDoc.COLLECTION, o);
        return this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, o.id);
      })
      .filter(hasData)
      .map(o => ({
        sfProjectDoc: o,
        paratextProject: {
          ...translateSourceToSelectableProjectWithLanguageTag(o.data),
          projectId: o.id,
          isConnectable: false,
          isConnected: true
        },
        selectableProjectWithLanguageCode: translateSourceToSelectableProjectWithLanguageTag(o.data),
        translateSource: {
          paratextId: o.data.paratextId,
          projectRef: o.id,
          name: o.data.name,
          shortName: o.data.shortName,
          writingSystem: o.data.writingSystem,
          isRightToLeft: o.data.isRightToLeft
        },
        projectType: o.data.resourceConfig == null ? 'project' : 'resource'
      }));
    const usersProjectsAndResourcesOnSF: WithData<SFProjectDoc>[] = projects.map(o => o.sfProjectDoc).filter(hasData);

    // Set of projects, not already on SF, that the user should have access to.
    projects.push(
      ...Array.from({ length: userNonSFProjectsCount }, (_, i) => ({
        paratextId: `pt-id-${userSFProjectsAndResourcesCount + i}`,
        name: `Test project ${userSFProjectsAndResourcesCount + i}`,
        shortName: `P${userSFProjectsAndResourcesCount + i}`,
        languageTag: 'en',
        projectId: undefined,
        isConnectable: true,
        isConnected: false
      })).map((o: ParatextProject) => ({
        paratextProject: o,
        selectableProjectWithLanguageCode: o,
        projectType: 'project' as const,
        sfProjectDoc: undefined,
        translateSource: undefined
      }))
    );

    // Set of resources, not already on SF, that the user should have access to.
    projects.push(
      ...Array.from({ length: userNonSFResourcesCount }, (_, i) => ({
        paratextId: `pt-id-${userSFProjectsAndResourcesCount + userNonSFProjectsCount + i}`,
        name: `Test project ${userSFProjectsAndResourcesCount + userNonSFProjectsCount + i}`,
        shortName: `P${userSFProjectsAndResourcesCount + userNonSFProjectsCount + i}`,
        languageTag: 'en',
        projectId: undefined,
        isConnectable: true,
        isConnected: false
      })).map((o: ParatextProject) => ({
        paratextProject: o,
        selectableProjectWithLanguageCode: o,
        projectType: 'resource' as const,
        sfProjectDoc: undefined,
        translateSource: undefined
      }))
    );

    const usersSFResources: TranslateSource[] = projects
      .filter(o => o.projectType === 'resource')
      .map(o => o.translateSource)
      .filter(notNull);
    const usersSFProjects: TranslateSource[] = projects
      .filter(o => o.projectType === 'project')
      .map(o => o.translateSource)
      .filter(notNull);

    this.activatedProjectDoc = usersProjectsAndResourcesOnSF[0];

    // Now that various projects and resources are defined with known SF project ids, and as various needed types, write
    // the sf project 0's translate config values.
    const sfProject0: SFProject = this.activatedProjectDoc.data;
    sfProject0.translateConfig.source = usersSFResources[0];
    sfProject0.translateConfig.draftConfig.alternateSourceEnabled = true;
    sfProject0.translateConfig.draftConfig.alternateSource = usersSFProjects[1];
    sfProject0.translateConfig.draftConfig.alternateTrainingSourceEnabled = true;
    sfProject0.translateConfig.draftConfig.alternateTrainingSource = usersSFResources[2];
    sfProject0.translateConfig.draftConfig.additionalTrainingSourceEnabled = true;
    sfProject0.translateConfig.draftConfig.additionalTrainingSource = usersSFProjects[2];
    sfProject0.translateConfig.draftConfig.additionalTrainingData = false;
    sfProject0.translateConfig.translationSuggestionsEnabled = false;
    sfProject0.translateConfig.preTranslate = true;

    // Use a promise that resolves after the component is created to simulate the loading of projects
    // and resources which disables the form
    const projectPromise = new Promise<ParatextProject[] | undefined>(resolve => {
      this.projectsLoaded$.subscribe(() =>
        resolve(projects.filter(o => o.projectType === 'project').map(o => o.paratextProject))
      );
    });
    when(mockedParatextService.getProjects()).thenReturn(projectPromise);
    when(mockedParatextService.getResources()).thenResolve(
      projects.filter(o => o.projectType === 'resource').map(o => o.selectableProjectWithLanguageCode)
    );
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of(usersProjectsAndResourcesOnSF));
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.activatedProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedActivatedProjectService.projectId).thenReturn(this.activatedProjectDoc.id);
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);

    this.fixture = TestBed.createComponent(DraftSourcesComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();

    this.loadingFinished();
    tick();
    this.fixture.detectChanges();
  }

  clickLanguageCodesConfirmationCheckbox(): void {
    const languageCodesConfirmationComponent: DebugElement = this.fixture.debugElement.query(
      By.css('app-language-codes-confirmation')
    );
    const checkbox: DebugElement = languageCodesConfirmationComponent.query(By.css('input[type="checkbox"]'));
    checkbox.nativeElement.click();
    tick();
    this.fixture.detectChanges();
  }

  private loadingFinished(): void {
    this.projectsLoaded$.next();
  }
}
