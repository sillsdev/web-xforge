import { OverlayContainer } from '@angular/cdk/overlay';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of, Subject } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { hasData, notNull, WithData } from '../../../../type-utils';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SelectableProjectWithLanguageCode } from '../../../core/models/selectable-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectSettings } from '../../../core/models/sf-project-settings';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays } from '../draft-source';
import { translateSourceToSelectableProjectWithLanguageTag } from '../draft-utils';
import { TrainingDataService } from '../training-data/training-data.service';
import { ConfigureSourcesComponent, sourceArraysToSettingsChange } from './configure-sources.component';

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
const mockedSFProjectService = mock(SFProjectService);
const mockedSFUserProjectsService = mock(SFUserProjectsService);
const mockedAuthService = mock(AuthService);
const mockedDialogService = mock(DialogService);
const mockTrainingDataService = mock(TrainingDataService);
const mockedFileService = mock(FileService);

describe('ConfigureSourcesComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: SFUserProjectsService, useMock: mockedSFUserProjectsService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: ErrorReportingService, useMock: mock(ErrorReportingService) },
      { provide: FileService, useMock: mockedFileService },
      { provide: ExternalUrlService, useClass: ExternalUrlService }
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

  it('loads projects and resources on init', fakeAsync(async () => {
    const env = await TestEnvironment.create();
    verify(mockedParatextService.getProjects()).once();
    verify(mockedParatextService.getResources()).once();
    expect(env.component.projects).toBeDefined();
    expect(env.component.resources).toBeDefined();
  }));

  it('suppresses network errors', fakeAsync(async () => {
    const env = await TestEnvironment.create({ projectLoadSuccessful: false });
    env.fixture.detectChanges();
    expect(env.component.projects).toBeUndefined();
  }));

  it('loads projects and resources when returning online', fakeAsync(async () => {
    const env = await TestEnvironment.create({ isOnline: false });
    verify(mockedParatextService.getProjects()).never();
    verify(mockedParatextService.getResources()).never();
    expect(env.component.projects).toBeUndefined();
    expect(env.component.resources).toBeUndefined();

    // Simulate going online
    env.testOnlineStatusService.setIsOnline(true);
    tick();
    env.fixture.detectChanges();
    verify(mockedParatextService.getProjects()).once();
    verify(mockedParatextService.getResources()).once();
    expect(env.component.projects).toBeDefined();
    expect(env.component.resources).toBeDefined();
  }));

  describe('save', () => {
    it('should save the settings', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      expect(env.component['changesMade']).toBe(false);
      env.clickLanguageCodesConfirmationCheckbox();
      // Suppose the user loads up the sources configuration page, changes no projects, and clicks Save. The settings
      // change request will just correspond to what the project already has for its settings.
      const expectedSettingsChangeRequest: SFProjectSettings = {
        draftingSourcesParatextIds: env.activatedProjectDoc.data!.translateConfig.draftConfig.draftingSources.map(
          s => s.paratextId
        ),
        trainingSourcesParatextIds: env.activatedProjectDoc.data!.translateConfig.draftConfig.trainingSources.map(
          s => s.paratextId
        ),
        additionalTrainingDataFiles:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.lastSelectedTrainingDataFiles
      };

      // No unsaved changes
      env.component.confirmLeave();
      tick();
      env.fixture.detectChanges();
      verify(mockedDialogService.confirm(anything(), anything(), anything())).never();

      // SUT
      await env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('clearing second training source works', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();
      expect(env.component['changesMade']).toBe(false);

      // Suppose the user loads up the page, clears the second training/reference project box, and clicks Save. The
      // settings change request will show a requested change for unsetting the additional-training-source.
      const expectedSettingsChangeRequest: SFProjectSettings = {
        draftingSourcesParatextIds: env.activatedProjectDoc.data!.translateConfig.draftConfig.draftingSources.map(
          s => s.paratextId
        ),
        trainingSourcesParatextIds: [
          env.activatedProjectDoc.data!.translateConfig.draftConfig.trainingSources[0].paratextId
        ],
        additionalTrainingDataFiles:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.lastSelectedTrainingDataFiles
      };

      // Remove the second training source.
      env.component.trainingSources.pop();
      // Confirm that we have 1 training source.
      expect(env.component.trainingSources.length).toEqual(1);
      env.component['changesMade'] = true;
      // user is prompted if user is navigating away
      env.component.confirmLeave();
      tick();
      env.fixture.detectChanges();
      verify(mockedDialogService.confirm(anything(), anything(), anything())).once();

      // SUT
      await env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('clearing first training source works', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      expect(env.component['changesMade']).toBe(false);
      env.clickLanguageCodesConfirmationCheckbox();

      // Suppose the user comes to the page, leaves the second reference/training project selection alone, and clears
      // the first reference/training project selection. Let's respond by clearing the additional-training-source, and
      // setting the first-training-source to the remaining reference/training project that is still specified.
      const expectedSettingsChangeRequest: SFProjectSettings = {
        draftingSourcesParatextIds: env.activatedProjectDoc.data!.translateConfig.draftConfig.draftingSources.map(
          s => s.paratextId
        ),
        trainingSourcesParatextIds: [
          env.activatedProjectDoc.data!.translateConfig.draftConfig.trainingSources[1].paratextId
        ],
        additionalTrainingDataFiles:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.lastSelectedTrainingDataFiles
      };

      // Remove the first training source.
      env.component.trainingSources[0] = undefined;
      // Confirm that we have 1 other training source.
      expect(env.component.trainingSources[1]).not.toBeNull();
      env.fixture.detectChanges();
      tick();

      // SUT
      await env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('fails to save and sync', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      // Remove the second training source.
      env.component.trainingSources.pop();
      // Confirm that we have 1 training source.
      expect(env.component.trainingSources.length).toEqual(1);
      env.fixture.detectChanges();
      tick();

      // Simulate failed response
      when(mockedSFProjectService.onlineUpdateSettings(anything(), anything())).thenReject(
        new CommandError(CommandErrorCode.Other, '504 Gateway Timeout')
      );

      // SUT
      await env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
    }));

    it('can edit second source after first is cleared', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      // Remove the first training source.
      env.component.sourceSelected(env.component.trainingSources, 0, undefined);
      // Confirm that we have 1 other training source.
      expect(env.component.trainingSources[1]).not.toBeNull();
      env.fixture.detectChanges();
      tick();

      // SUT
      env.component.sourceSelected(env.component.trainingSources, 1, undefined);
      env.fixture.detectChanges();
      tick();
      expect(env.component.trainingSources.length).toEqual(2);
    }));

    it('saves the selected training files', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      const expectedSettingsChangeRequest: SFProjectSettings = {
        draftingSourcesParatextIds: env.activatedProjectDoc.data!.translateConfig.draftConfig.draftingSources.map(
          s => s.paratextId
        ),
        trainingSourcesParatextIds: env.activatedProjectDoc.data!.translateConfig.draftConfig.trainingSources.map(
          s => s.paratextId
        ),
        additionalTrainingDataFiles: ['test1', 'test2']
      };

      env.component.onTrainingDataSelect([{ dataId: 'test1' } as TrainingData, { dataId: 'test2' } as TrainingData]);

      await env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('creates training data for added files', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      const savedFile = {} as TrainingData;
      env.activeTrainingData$.next([savedFile]);

      expect(env.component.availableTrainingFiles.length).toEqual(1);

      const newFile = { dataId: 'test1' } as TrainingData;
      env.component.onTrainingDataSelect([newFile]);
      await env.component.save();

      verify(mockTrainingDataService.createTrainingDataAsync(newFile)).once();
    }));

    it('deletes training data for removed files', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      const savedFile1 = { dataId: 'file1' } as TrainingData;
      const savedFile2 = { dataId: 'file2' } as TrainingData;
      env.activeTrainingData$.next([savedFile1, savedFile2]);
      tick();

      expect(env.component.availableTrainingFiles.length).toEqual(2);

      env.component.onTrainingDataSelect([savedFile1]);
      await env.component.save();
      tick();

      verify(mockTrainingDataService.deleteTrainingDataAsync(savedFile2)).once();
      verify(mockTrainingDataService.deleteTrainingDataAsync(savedFile1)).never();
      verify(mockTrainingDataService.createTrainingDataAsync(anything())).never();
    }));

    it('deletes added files on discard from confirmLeave', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();
      when(mockedDialogService.confirm(anything(), anything(), anything())).thenResolve(true);

      const savedFile = { dataId: 'saved_file', ownerRef: 'user01' } as TrainingData;
      env.activeTrainingData$.next([savedFile]);
      tick();

      expect(env.component.availableTrainingFiles.length).toEqual(1);

      const newFile = { dataId: 'new_file', ownerRef: 'user01' } as TrainingData;
      env.component.onTrainingDataSelect([savedFile, newFile]);
      env.component['changesMade'] = true;
      tick();

      // SUT
      env.component.confirmLeave();
      tick();

      verify(
        mockedFileService.deleteFile(
          FileType.TrainingData,
          env.activatedProjectDoc.id,
          TrainingDataDoc.COLLECTION,
          newFile.dataId,
          newFile.ownerRef
        )
      ).once();
      verify(
        mockedFileService.deleteFile(
          FileType.TrainingData,
          env.activatedProjectDoc.id,
          TrainingDataDoc.COLLECTION,
          savedFile.dataId,
          savedFile.ownerRef
        )
      ).never();
      verify(mockTrainingDataService.createTrainingDataAsync(anything())).never();
      verify(mockTrainingDataService.deleteTrainingDataAsync(anything())).never();
    }));

    it('preserves unsaved training file changes when query updates', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.fixture.detectChanges();

      const initialFile1 = { dataId: 'file1' } as TrainingData;
      const initialFile2 = { dataId: 'file2' } as TrainingData;
      env.activeTrainingData$.next([initialFile1, initialFile2]);
      tick();

      expect(env.component.availableTrainingFiles).toEqual([initialFile1, initialFile2]);
      expect(env.component['savedTrainingFiles']).toEqual([initialFile1, initialFile2]);

      // User removes a file and adds a new one
      const addedFile = { dataId: 'added_file' } as TrainingData;
      env.component.onTrainingDataSelect([initialFile2, addedFile]);
      tick();

      expect(env.component.availableTrainingFiles).toEqual([initialFile2, addedFile]);

      // Another client updates the query
      const remoteFile = { dataId: 'remote_file' } as TrainingData;
      env.activeTrainingData$.next([initialFile1, initialFile2, remoteFile]);
      tick();

      // The user's unsaved changes should be preserved
      expect(env.component.availableTrainingFiles.map(f => f.dataId).sort()).toEqual(
        ['added_file', 'file2', 'remote_file'].sort()
      );
      expect(env.component['savedTrainingFiles']!.map(f => f.dataId).sort()).toEqual(
        ['file1', 'file2', 'remote_file'].sort()
      );
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
        [],
        currentProjectParatextId
      );

      expect(result).toEqual({
        additionalTrainingDataFiles: [],
        trainingSourcesParatextIds: [],
        draftingSourcesParatextIds: []
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
        [],
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingDataFiles: [],
        trainingSourcesParatextIds: [mockProject1.paratextId],
        draftingSourcesParatextIds: []
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
        [],
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingDataFiles: [],
        trainingSourcesParatextIds: [mockProject1.paratextId, mockProject2.paratextId],
        draftingSourcesParatextIds: []
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
        [],
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingDataFiles: [],
        trainingSourcesParatextIds: [],
        draftingSourcesParatextIds: [mockProject1.paratextId]
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
        [],
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingDataFiles: [],
        trainingSourcesParatextIds: [mockProject1.paratextId, mockProject2.paratextId],
        draftingSourcesParatextIds: [mockProject1.paratextId]
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
          [],
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
        [],
        currentProjectParatextId
      );
      expect(result).toEqual({
        additionalTrainingDataFiles: [],
        trainingSourcesParatextIds: [],
        draftingSourcesParatextIds: []
      });
    });

    it('should disable save and sync button and display offline message when offline', fakeAsync(async () => {
      const env = await TestEnvironment.create();
      env.testOnlineStatusService.setIsOnline(false);
      env.fixture.detectChanges();
      tick();

      const offlineMessage: DebugElement = env.fixture.debugElement.query(By.css('#offline-message'));
      expect(offlineMessage).not.toBeNull();

      const saveButton: DebugElement = env.fixture.debugElement.query(By.css('#save_button'));
      expect(saveButton.attributes.disabled).toBe('true');
    }));

    it('should enable save & sync button and not display offline message when online', fakeAsync(async () => {
      const env = await TestEnvironment.create();
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
  private _component: ConfigureSourcesComponent | undefined;
  private _fixture: ComponentFixture<ConfigureSourcesComponent> | undefined;
  readonly realtimeService: TestRealtimeService;
  private _activatedProjectDoc: WithData<SFProjectDoc> | undefined;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly activeTrainingData$: Subject<TrainingData[]> = new Subject<TrainingData[]>();
  private projectsLoaded$: Subject<void> = new Subject<void>();

  private constructor() {
    this.realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  }

  static async create({
    isOnline = true,
    projectLoadSuccessful = true
  }: { isOnline?: boolean; projectLoadSuccessful?: boolean } = {}): Promise<TestEnvironment> {
    const env = new TestEnvironment();
    await env.init({ isOnline, projectLoadSuccessful });
    return env;
  }

  private async init({
    isOnline = true,
    projectLoadSuccessful = true
  }: { isOnline?: boolean; projectLoadSuccessful?: boolean } = {}): Promise<void> {
    const userSFProjectsAndResourcesCount: number = 6;
    const userNonSFProjectsCount: number = 3;
    const userNonSFResourcesCount: number = 3;

    // Make some projects and resources, already on SF, that the user has access to. These will be available as a
    // variety of types.

    const projects: MultiTypeProjectDescription[] = (
      await Promise.all(
        Array.from(
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
        ).map(async o => {
          // Run it into and out of realtime service so it has fields like `remoteChanges$`.
          this.realtimeService.addSnapshot(SFProjectDoc.COLLECTION, o);
          return await this.realtimeService.get<SFProjectDoc>(
            SFProjectDoc.COLLECTION,
            o.id,
            new DocSubscription('spec')
          );
        })
      )
    )
      .filter(hasData)
      .map(o => ({
        sfProjectDoc: o,
        paratextProject: {
          ...translateSourceToSelectableProjectWithLanguageTag(o.data),
          projectId: o.id,
          isConnectable: false,
          isConnected: true,
          hasUserRoleChanged: false,
          hasUpdate: false,
          role: SFProjectRole.ParatextObserver
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
        isConnected: false,
        hasUserRoleChanged: false,
        hasUpdate: false,
        role: SFProjectRole.ParatextObserver
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
        isConnected: false,
        hasUserRoleChanged: false,
        hasUpdate: false,
        role: SFProjectRole.ParatextObserver
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

    this._activatedProjectDoc = usersProjectsAndResourcesOnSF[0];

    // Now that various projects and resources are defined with known SF project ids, and as various needed types, write
    // the sf project 0's translate config values.
    const sfProject0: SFProject = this.activatedProjectDoc.data;
    sfProject0.translateConfig.source = usersSFResources[0];
    sfProject0.translateConfig.draftConfig.draftingSources = [usersSFProjects[1]];
    sfProject0.translateConfig.draftConfig.trainingSources = [usersSFResources[2], usersSFProjects[2]];
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
    if (projectLoadSuccessful === false) {
      when(mockedParatextService.getProjects()).thenReject(new Error('504 Gateway Timeout'));
    }
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of(usersProjectsAndResourcesOnSF));
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));
    when(mockedI18nService.locale).thenReturn({ helps: '' } as any);
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.activatedProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedActivatedProjectService.projectId).thenReturn(this.activatedProjectDoc.id);
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    this.testOnlineStatusService.setIsOnline(!!isOnline);

    when(mockTrainingDataService.getTrainingData(anything(), anything())).thenReturn(this.activeTrainingData$);
    this.activeTrainingData$.next([]);

    this._fixture = TestBed.createComponent(ConfigureSourcesComponent);
    this._component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();

    if (projectLoadSuccessful !== false) {
      this.loadingFinished();
    }
    tick();
    this.fixture.detectChanges();
  }

  get component(): ConfigureSourcesComponent {
    if (this._component == null) throw new Error('Uninitialized');
    return this._component;
  }

  get fixture(): ComponentFixture<ConfigureSourcesComponent> {
    if (this._fixture == null) throw new Error('Uninitialized');
    return this._fixture;
  }

  get activatedProjectDoc(): WithData<SFProjectDoc> {
    if (this._activatedProjectDoc == null) throw new Error('Uninitialized');
    return this._activatedProjectDoc;
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
