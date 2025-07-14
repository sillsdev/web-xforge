import { OverlayContainer } from '@angular/cdk/overlay';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of, Subject } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
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
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { translateSourceToSelectableProjectWithLanguageTag } from '../draft-utils';
import { TrainingDataService } from '../training-data/training-data.service';
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
const mockedDialogService = mock(DialogService);
const mockTrainingDataService = mock(TrainingDataService);
const mockedFileService = mock(FileService);

const mockTrainingDataQuery: RealtimeQuery<TrainingDataDoc> = mock(RealtimeQuery);
const trainingDataQueryLocalChanges$: Subject<void> = new Subject<void>();
when(mockTrainingDataQuery.localChanges$).thenReturn(trainingDataQueryLocalChanges$);
when(mockTrainingDataQuery.ready$).thenReturn(of(true));
when(mockTrainingDataQuery.remoteChanges$).thenReturn(of());
when(mockTrainingDataQuery.remoteDocChanges$).thenReturn(of());

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
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: ErrorReportingService, useMock: mock(ErrorReportingService) },
      { provide: FileService, useMock: mockedFileService }
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

  it('suppresses network errors', fakeAsync(() => {
    const env = new TestEnvironment({ projectLoadSuccessful: false });
    tick();
    env.fixture.detectChanges();
    expect(env.component.projects).toBeUndefined();
  }));

  it('loads projects and resources when returning online', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: false });
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
          env.activatedProjectDoc.data!.translateConfig.draftConfig.additionalTrainingSource!.paratextId,
        additionalTrainingDataFiles:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.lastSelectedTrainingDataFiles
      };

      // No unsaved changes
      env.component.confirmLeave();
      tick();
      env.fixture.detectChanges();
      verify(mockedDialogService.confirm(anything(), anything(), anything())).never();

      // SUT
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
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
        additionalTrainingSourceParatextId: DraftSourcesComponent.projectSettingValueUnset,
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
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
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
        additionalTrainingSourceParatextId: DraftSourcesComponent.projectSettingValueUnset,
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
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('fails to save and sync', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
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
      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
    }));

    it('can edit second source after first is cleared', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
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

    it('saves the selected training files', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      const expectedSettingsChangeRequest: SFProjectSettings = {
        alternateSourceEnabled: true,
        alternateSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateSource!.paratextId,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.alternateTrainingSource!.paratextId,
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId:
          env.activatedProjectDoc.data!.translateConfig.draftConfig.additionalTrainingSource!.paratextId,
        additionalTrainingDataFiles: ['test1', 'test2']
      };

      env.component.onTrainingDataSelect([{ dataId: 'test1' } as TrainingData, { dataId: 'test2' } as TrainingData]);

      env.component.save();
      tick();
      verify(mockedSFProjectService.onlineUpdateSettings(env.activatedProjectDoc.id, anything())).once();
      const actualSettingsChangeRequest: SFProjectSettings = capture(
        mockedSFProjectService.onlineUpdateSettings
      ).last()[1];
      expect(actualSettingsChangeRequest).toEqual(expectedSettingsChangeRequest);
    }));

    it('creates training data for added files', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      const savedFile = {} as TrainingData;
      when(mockTrainingDataQuery.docs).thenReturn([{ data: savedFile } as TrainingDataDoc]);
      trainingDataQueryLocalChanges$.next();

      expect(env.component.availableTrainingFiles.length).toEqual(1);

      const newFile = { dataId: 'test1' } as TrainingData;
      env.component.onTrainingDataSelect([newFile]);
      env.component.save();

      verify(mockTrainingDataService.createTrainingDataAsync(newFile)).once();
    }));

    it('deletes training data for removed files', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();

      const savedFile1 = { dataId: 'file1' } as TrainingData;
      const savedFile2 = { dataId: 'file2' } as TrainingData;
      when(mockTrainingDataQuery.docs).thenReturn([
        { data: savedFile1 } as TrainingDataDoc,
        { data: savedFile2 } as TrainingDataDoc
      ]);
      trainingDataQueryLocalChanges$.next();
      tick();

      expect(env.component.availableTrainingFiles.length).toEqual(2);

      env.component.onTrainingDataSelect([savedFile1]);
      env.component.save();
      tick();

      verify(mockTrainingDataService.deleteTrainingDataAsync(savedFile2)).once();
      verify(mockTrainingDataService.deleteTrainingDataAsync(savedFile1)).never();
      verify(mockTrainingDataService.createTrainingDataAsync(anything())).never();
    }));

    it('deletes added files on discard from confirmLeave', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      env.clickLanguageCodesConfirmationCheckbox();
      when(mockedDialogService.confirm(anything(), anything(), anything())).thenResolve(true);

      const savedFile = { dataId: 'saved_file', ownerRef: 'user01' } as TrainingData;
      when(mockTrainingDataQuery.docs).thenReturn([{ data: savedFile } as TrainingDataDoc]);
      trainingDataQueryLocalChanges$.next();
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

    it('preserves unsaved training file changes when query updates', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();

      const initialFile1 = { dataId: 'file1' } as TrainingData;
      const initialFile2 = { dataId: 'file2' } as TrainingData;
      when(mockTrainingDataQuery.docs).thenReturn([
        { data: initialFile1 } as TrainingDataDoc,
        { data: initialFile2 } as TrainingDataDoc
      ]);
      trainingDataQueryLocalChanges$.next();
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
      when(mockTrainingDataQuery.docs).thenReturn([
        { data: initialFile1 } as TrainingDataDoc,
        { data: initialFile2 } as TrainingDataDoc,
        { data: remoteFile } as TrainingDataDoc
      ]);
      trainingDataQueryLocalChanges$.next();
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
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: 'unset',
        additionalTrainingDataFiles: []
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
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId: mockProject1.paratextId,
        additionalTrainingDataFiles: []
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
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId: mockProject2.paratextId,
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId: mockProject1.paratextId,
        additionalTrainingDataFiles: []
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
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: true,
        alternateSourceParatextId: mockProject1.paratextId,
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: 'unset',
        additionalTrainingDataFiles: []
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
        additionalTrainingSourceEnabled: true,
        additionalTrainingSourceParatextId: mockProject2.paratextId,
        alternateSourceEnabled: true,
        alternateSourceParatextId: mockProject1.paratextId,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSourceParatextId: mockProject1.paratextId,
        additionalTrainingDataFiles: []
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
        additionalTrainingSourceEnabled: false,
        additionalTrainingSourceParatextId: 'unset',
        alternateSourceEnabled: false,
        alternateSourceParatextId: 'unset',
        alternateTrainingSourceEnabled: false,
        alternateTrainingSourceParatextId: 'unset',
        additionalTrainingDataFiles: []
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

  constructor(
    args: { isOnline?: boolean; projectLoadSuccessful?: boolean } = { isOnline: true, projectLoadSuccessful: true }
  ) {
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
    if (args.projectLoadSuccessful === false) {
      when(mockedParatextService.getProjects()).thenReject(new Error('504 Gateway Timeout'));
    }
    when(mockedSFUserProjectsService.projectDocs$).thenReturn(of(usersProjectsAndResourcesOnSF));
    when(mockedI18nService.getLanguageDisplayName(anything())).thenReturn('Test Language');
    when(mockedI18nService.enumerateList(anything())).thenCall(items => items.join(', '));
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.activatedProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    when(mockedActivatedProjectService.projectId).thenReturn(this.activatedProjectDoc.id);
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.activatedProjectDoc);
    this.testOnlineStatusService.setIsOnline(!!args.isOnline);

    when(mockTrainingDataService.queryTrainingDataAsync(anything(), anything())).thenResolve(
      instance(mockTrainingDataQuery)
    );
    when(mockTrainingDataQuery.docs).thenReturn([]);

    this.fixture = TestBed.createComponent(DraftSourcesComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();

    if (args.projectLoadSuccessful !== false) {
      this.loadingFinished();
    }
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
