import { HttpErrorResponse } from '@angular/common/http';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { saveAs } from 'file-saver';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { DraftConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { BuildDto, ServalBuildDiagnostic, ServalDiagnosticSeverity } from '../machine-api/build-dto';
import { BuildStates } from '../machine-api/build-states';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import {
  OnboardingRequestService,
  OpenOnboardingRequest
} from '../translate/draft-generation/onboarding-request.service';
import { TrainingDataService } from '../translate/draft-generation/training-data/training-data.service';
import { ServalAdministrationService } from './serval-administration.service';
import { ServalProjectComponent } from './serval-project.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockActivatedRoute = mock(ActivatedRoute);
const mockAuthService = mock(AuthService);
const mockDraftGenerationService = mock(DraftGenerationService);
const mockFileService = mock(FileService);
const mockNoticeService = mock(NoticeService);
const mockOnboardingRequestService = mock(OnboardingRequestService);
const mockSFProjectService = mock(SFProjectService);
const mockServalAdministrationService = mock(ServalAdministrationService);
const mockTrainingDataService = mock(TrainingDataService);
const mockUserService = mock(UserService);

describe('ServalProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: AuthService, useMock: mockAuthService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: FileService, useMock: mockFileService },
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: OnboardingRequestService, useMock: mockOnboardingRequestService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ServalAdministrationService, useMock: mockServalAdministrationService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  describe('header', () => {
    it('shows the project label and language tag', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.heading.textContent).toBe('P1 - Project 01');
      expect(env.languageTag.textContent).toBe('en');
    }));

    it('links to the onboarding request with its status when the project has one', fakeAsync(() => {
      const env = new TestEnvironment({ onboardingRequest: { status: 'in_progress' } });
      expect(env.onboardingRequestLink).not.toBeNull();
      expect(env.onboardingRequestLink!.textContent).toContain('Onboarding request');
      expect(env.onboardingRequestLink!.textContent).toContain('In Progress');
      expect(env.component.onboardingRequestLink).toEqual([
        '/serval-administration',
        'onboarding-requests',
        'request01'
      ]);
    }));

    it('does not show an onboarding request link when the project has none', fakeAsync(() => {
      const env = new TestEnvironment();
      verify(mockOnboardingRequestService.getOpenOnboardingRequest(env.mockProjectId)).once();
      expect(env.onboardingRequestLink).toBeNull();
    }));

    it('does not look up the onboarding request when offline', fakeAsync(() => {
      const env = new TestEnvironment({ online: false, onboardingRequest: { status: 'new' } });
      verify(mockOnboardingRequestService.getOpenOnboardingRequest(anything())).never();
      expect(env.onboardingRequestLink).toBeNull();
    }));

    it('leaves out the onboarding request link when the lookup fails', fakeAsync(() => {
      const env = new TestEnvironment({ onboardingRequestError: true });
      expect(env.onboardingRequestLink).toBeNull();
    }));
  });

  describe('pre-translation drafting toggle', () => {
    it('should allow enabling pre-translation drafting', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: false });
      expect(env.preTranslateToggle.getAttribute('aria-checked')).toBe('false');
      env.clickElement(env.preTranslateToggle);
      expect(env.preTranslateToggle.getAttribute('aria-checked')).toBe('true');
      verify(mockSFProjectService.onlineSetPreTranslate(env.mockProjectId, true)).once();
    }));

    it('should allow disabling pre-translation drafting', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.preTranslateToggle.getAttribute('aria-checked')).toBe('true');
      env.clickElement(env.preTranslateToggle);
      expect(env.preTranslateToggle.getAttribute('aria-checked')).toBe('false');
      verify(mockSFProjectService.onlineSetPreTranslate(env.mockProjectId, false)).once();
    }));

    it('should disable the pre-translation drafting toggle when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.preTranslateToggle.disabled).toBe(true);
    }));
  });

  describe('run retrieve pre-translations button', () => {
    it('should disable the run retrieve pre-translations button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.retrievePreTranslationsButton.disabled).toBe(true);
    }));

    it('should allow running the retrieve pre-translations', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: false });
      expect(env.retrievePreTranslationsButton.disabled).toBe(false);
      env.clickElement(env.retrievePreTranslationsButton);
      verify(mockServalAdministrationService.onlineRetrievePreTranslationStatus(env.mockProjectId)).once();
      verify(mockNoticeService.show(anything())).once();
    }));
  });

  describe('view event log button', () => {
    it('should disable the view event log button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.viewEventLogButton['disabled']).toBe(true);
    }));

    it('should not disable the view event log button when online', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = true;
      expect(env.viewEventLogButton['disabled']).toBeFalsy();
    }));
  });

  describe('download button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.sourceDownloadButtons[0].innerText).toContain('Download');
      expect(env.sourceDownloadButtons[0].disabled).toBe(true);
    }));

    it('should display a notice if the project cannot be downloaded', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      expect(env.sourceDownloadButtons[0].innerText).toContain('Download');
      expect(env.sourceDownloadButtons[0].disabled).toBe(false);
      env.clickElement(env.sourceDownloadButtons[0]);
      verify(mockNoticeService.showError(anything())).once();
    }));

    it('should have a download button for the target and every source', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.sourceDownloadButtons.length).toBe(4);
      expect(env.sourceDownloadButtons[0].innerText).toContain('Download');
      expect(env.sourceDownloadButtons[0].disabled).toBe(false);
    }));

    it('should allow clicking of the button to download', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.sourceDownloadButtons[0].innerText).toContain('Download');
      expect(env.sourceDownloadButtons[0].disabled).toBe(false);
      env.clickElement(env.sourceDownloadButtons[0]);
      expect(saveAs).toHaveBeenCalled();
    }));
  });

  describe('download draft button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      env.onlineStatus = false;
      expect(env.downloadDraftButton.disabled).toBe(true);
    }));

    it('should disable the download button when there is no last completed build', fakeAsync(() => {
      const env = new TestEnvironment({
        latestBuild: TestEnvironment.build({ id: 'build02', state: BuildStates.Faulted })
      });
      expect(env.downloadDraftButton.disabled).toBe(true);
      expect(env.downloadDraftButton.textContent).toContain('Download draft');
    }));

    it('should have an enabled download draft button when there is a last completed build', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      expect(env.downloadDraftButton.disabled).toBe(false);
      expect(env.downloadDraftButton.textContent!.trim()).toBe('download Download draft');
    }));

    it('says the draft is from a previous build when a newer build is running', fakeAsync(() => {
      const env = new TestEnvironment({
        lastCompletedBuild: TestEnvironment.completedBuild(),
        latestBuild: TestEnvironment.build({ id: 'build02', state: BuildStates.Active })
      });
      expect(env.downloadDraftButton.disabled).toBe(false);
      expect(env.downloadDraftButton.textContent).toContain('Download draft from previous build');
    }));

    it('should allow clicking of the download draft button to download a zip file', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      when(mockDraftGenerationService.downloadDraft(anything(), anything())).thenReturn(NEVER);
      expect(env.downloadDraftButton.disabled).toBe(false);
      env.clickElement(env.downloadDraftButton);
      expect(env.component.downloadingDraft).toBe(true);
    }));

    it('should display any errors when downloading a zip file', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      when(mockDraftGenerationService.downloadDraft(anything(), anything())).thenReturn(throwError(() => new Error()));
      expect(env.downloadDraftButton.disabled).toBe(false);
      env.clickElement(env.downloadDraftButton);
      expect(env.component.downloadingDraft).toBe(false);
      verify(mockNoticeService.showError(anything())).once();
    }));
  });

  describe('latest build', () => {
    it('says when no draft has been generated', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: false });
      expect(env.noBuildsMessage).not.toBeNull();
      expect(env.downloadDraftButton).toBeNull();
    }));

    it('does not get builds if project does not have draft books', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: false });
      tick();
      env.fixture.detectChanges();
      expect(env.component.preTranslate).toBe(false);
      verify(mockDraftGenerationService.getLastCompletedBuild(anything())).never();
      verify(mockDraftGenerationService.getLastPreTranslationBuild(anything())).never();
    }));

    it('gets the last completed and latest builds if drafting enabled and draft books exist', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      tick();
      env.fixture.detectChanges();
      expect(env.component.preTranslate).toBe(true);
      verify(mockDraftGenerationService.getLastCompletedBuild(env.mockProjectId)).once();
      verify(mockDraftGenerationService.getLastPreTranslationBuild(env.mockProjectId)).once();
      verify(mockDraftGenerationService.getRawBuild('build01')).once();
    }));

    it('summarizes a completed build', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      expect(env.buildState.textContent!.trim()).toBe('Completed');
      expect(env.buildStateIcon.textContent!.trim()).toBe('done');
      expect(env.buildStateIcon.parentElement!.classList).toContain('status-is-completed');
      expect(env.buildSummaryLabels).toEqual([
        'State',
        'Finished',
        'Requested by',
        'Training pairs',
        'Verses drafted',
        'Diagnostics'
      ]);
      expect(env.buildDate.textContent!.trim()).not.toBe('—');
      expect(env.requestedByName!.textContent!.trim()).toBe('Ruth Banda');
      expect(env.diagnosticCount.textContent!.trim()).toBe('2');
    }));

    it('shows progress instead of counts while a build is running', fakeAsync(() => {
      const env = new TestEnvironment({
        latestBuild: TestEnvironment.build({
          id: 'build02',
          state: BuildStates.Active,
          percentCompleted: 0.42,
          queueDepth: 1
        })
      });
      expect(env.buildState.textContent!.trim()).toBe('Running');
      expect(env.buildSummaryLabels).toEqual([
        'State',
        'Requested',
        'Requested by',
        'Progress',
        'Queue depth',
        'Diagnostics'
      ]);
    }));

    it('shows a dash when the requester is unknown', fakeAsync(() => {
      const env = new TestEnvironment({
        lastCompletedBuild: TestEnvironment.build({
          id: 'build01',
          state: BuildStates.Completed,
          requester: null
        })
      });
      expect(env.requestedByName).toBeNull();
      expect(env.requestedBy.textContent!.trim()).toBe('—');
      verify(mockUserService.getProfile(anything())).never();
    }));

    it('shows only the first three diagnostics until asked for the rest', fakeAsync(() => {
      const env = new TestEnvironment({
        lastCompletedBuild: TestEnvironment.build({
          id: 'build01',
          state: BuildStates.Completed,
          diagnostics: ['w1', 'w2', 'w3', 'w4', 'w5'].map(message => TestEnvironment.diagnostic(message))
        })
      });
      expect(env.diagnosticNotices.length).toBe(3);
      expect(env.showAllDiagnosticsButton).not.toBeNull();
      expect(env.showAllDiagnosticsButton!.textContent).toContain('Show 2 more diagnostics');

      // SUT
      env.clickElement(env.showAllDiagnosticsButton!);
      expect(env.diagnosticNotices.length).toBe(5);
      expect(env.showAllDiagnosticsButton).toBeNull();
    }));

    it('shows all diagnostics without a button when there are few', fakeAsync(() => {
      const env = new TestEnvironment({ lastCompletedBuild: TestEnvironment.completedBuild() });
      expect(env.diagnosticNotices.length).toBe(2);
      expect(env.showAllDiagnosticsButton).toBeNull();
    }));

    it('styles each diagnostic by its severity', fakeAsync(() => {
      const env = new TestEnvironment({
        lastCompletedBuild: TestEnvironment.build({
          id: 'build01',
          state: BuildStates.Completed,
          diagnostics: [
            TestEnvironment.diagnostic('Bad', ServalDiagnosticSeverity.Error),
            TestEnvironment.diagnostic('Hmm', ServalDiagnosticSeverity.Warn),
            TestEnvironment.diagnostic('FYI', ServalDiagnosticSeverity.Info)
          ]
        })
      });
      const notices: HTMLElement[] = Array.from(env.diagnosticNotices);
      expect(notices.map(n => n.querySelector('.notice-content')!.textContent!.trim())).toEqual(['Bad', 'Hmm', 'FYI']);
      expect(notices.map(n => n.querySelector('mat-icon')!.textContent!.trim())).toEqual(['error', 'warning', 'info']);
    }));

    it('marks the diagnostic count as a lower bound when Serval truncated the list', fakeAsync(() => {
      const env = new TestEnvironment({
        lastCompletedBuild: TestEnvironment.build({
          id: 'build01',
          state: BuildStates.Completed,
          diagnostics: [TestEnvironment.diagnostic('w1')],
          diagnosticsTruncated: true
        })
      });
      expect(env.diagnosticCount.textContent!.trim()).toBe('1+');
    }));
  });

  describe('training files', () => {
    it('should show training data saved on a project', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      expect(env.component.trainingDataFiles).toBeDefined();
      expect(env.component.trainingDataFiles.length).toBe(1);
      expect(env.component.trainingDataFiles[0].dataId).toBe('dataId01');
      expect(env.component.trainingDataFiles[0].fileUrl).toBe('file-url');
      expect(env.trainingFileNames).toEqual(['training-data-01.csv']);
      verify(
        mockTrainingDataService.getTrainingData(env.mockProjectId, anything(), deepEqual({ includeDeleted: true }))
      ).once();
    }));

    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.trainingDataDownloadButtons[0].disabled).toBe(true);
    }));

    it('can download the training data', fakeAsync(() => {
      const env = new TestEnvironment();
      tick();
      env.fixture.detectChanges();
      expect(env.trainingDataDownloadButtons[0]).not.toBeNull();
      env.clickElement(env.trainingDataDownloadButtons[0]);
      verify(mockFileService.onlineDownloadFile(FileType.TrainingData, 'file-url', 'training-data-01.csv')).once();
    }));

    it('says whether each file was used in the last draft', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: TestEnvironment.lastDraft({
          lastSelectedTrainingDataFiles: ['dataId01']
        })
      });
      expect(env.trainingFileUsedCells).toEqual(['Yes']);
      expect(env.sourcesChangedNotice).toBeNull();
    }));

    it('does not call an unused file a change when it is not known whether it existed', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: TestEnvironment.lastDraft()
      });
      expect(env.trainingFileUsedCells).toEqual(['No']);
      expect(env.sourcesChangedNotice).toBeNull();
    }));

    it('does not call a deliberately deselected file a change', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: TestEnvironment.lastDraft({
          lastSelectedTrainingDataFiles: [],
          lastAvailableTrainingDataFiles: ['dataId01']
        })
      });
      expect(env.trainingFileUsedCells).toEqual(['No']);
      expect(env.trainingFileNames).toEqual(['training-data-01.csv']);
      expect(env.sourcesChangedNotice).toBeNull();
    }));

    it('says the sources changed when a file was uploaded after the last draft', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: TestEnvironment.lastDraft({
          lastSelectedTrainingDataFiles: [],
          lastAvailableTrainingDataFiles: []
        })
      });
      expect(env.trainingFileUsedCells).toEqual(['No']);
      expect(env.trainingFileNames[0]).toContain('Uploaded since the last draft');
      expect(env.sourcesChangedNotice).not.toBeNull();
      expect(env.sourcesChangedNotice!.textContent).toContain(
        'A training file has been uploaded since the last draft.'
      );
      expect(env.sourcesChangedNotice!.textContent).not.toContain('former');
    }));

    it('lists a file the last draft used that has since been deleted', fakeAsync(() => {
      const env = new TestEnvironment({
        trainingDataFiles: [
          { fileUrl: 'file-url', dataId: 'dataId01', title: 'training-data-01.csv' } as TrainingData,
          { fileUrl: 'old-url', dataId: 'dataId02', title: 'old-glossary.csv', deleted: true } as TrainingData,
          { fileUrl: 'unused-url', dataId: 'dataId03', title: 'never-used.csv', deleted: true } as TrainingData
        ],
        draftConfig: TestEnvironment.lastDraft({
          lastSelectedTrainingDataFiles: ['dataId01', 'dataId02']
        })
      });
      // The deleted file the last draft never used is not listed at all
      expect(env.trainingFileNames.length).toBe(2);
      expect(env.trainingFileNames[0]).toBe('training-data-01.csv');
      expect(env.trainingFileNames[1]).toContain('old-glossary.csv');
      expect(env.trainingFileNames[1]).toContain('Deleted since the last draft');
      expect(env.trainingFileUsedCells).toEqual(['Yes', 'Yes']);
      expect(env.trainingDataDownloadButtons.length).toBe(1);
      expect(env.sourcesChangedNotice!.textContent).toContain(
        'A training file the last draft used has since been deleted.'
      );
    }));

    it('lists a file the last draft used by id when its record is gone', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: {
          lastSelectedTrainingScriptureRanges: [{ projectId: 'project04', scriptureRange: 'GEN' }],
          lastSelectedTrainingDataFiles: ['dataId01', 'goneDataId']
        }
      });
      expect(env.trainingFileNames[1]).toContain('goneDataId');
      expect(env.trainingFileNames[1]).toContain('Deleted since the last draft');
      expect(env.trainingDataDownloadButtons.length).toBe(1);
      expect(env.sourcesChangedNotice).not.toBeNull();
    }));
  });

  describe('sources', () => {
    it('lists the target, draft sources and reference projects', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.sourceRoles).toEqual(['Target', 'Draft source', 'Reference project', 'Reference project']);
      expect(env.sourceLabels).toEqual(['P1 - Project 01', 'P3 - Project 03', 'P4 - Project 04', 'P5 - Project 05']);
    }));

    it('shows dashes when there has never been a draft', fakeAsync(() => {
      const env = new TestEnvironment({ draftConfig: {} });
      expect(env.trainingBooksCells).toEqual(['—', '—', '—', '—']);
      expect(env.translationBooksCells).toEqual(['—', '—', '—', '—']);
      expect(env.sourcesChangedNotice).toBeNull();
    }));

    it('shows the books the last draft used under each source', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: {
          lastSelectedTrainingScriptureRanges: [
            { projectId: 'project04', scriptureRange: 'GEN;EXO' },
            { projectId: 'project05', scriptureRange: 'GEN' }
          ],
          lastSelectedTranslationScriptureRanges: [{ projectId: 'project03', scriptureRange: 'LEV;NUM' }],
          lastSelectedTrainingDataFiles: ['dataId01']
        }
      });
      expect(env.trainingBooksCells).toEqual(['—', '—', 'GEN; EXO', 'GEN']);
      expect(env.translationBooksCells).toEqual(['—', 'LEV; NUM', '—', '—']);
      expect(env.sourcesChangedNotice).toBeNull();
    }));

    it('folds the target training entry into the sources as chapter detail instead of listing it', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: {
          lastSelectedTrainingScriptureRanges: [
            { projectId: 'project04', scriptureRange: 'GEN;EXO' },
            // The entry for the target project itself carries the chapter-level selection
            { projectId: 'project01', scriptureRange: 'GEN1-3;EXO1-40' }
          ],
          lastSelectedTranslationScriptureRanges: [{ projectId: 'project03', scriptureRange: 'LEV2-5' }]
        }
      });
      expect(env.sourceRoles.length).toBe(4);
      expect(env.trainingBooksCells).toEqual(['—', '—', 'GEN 1-3; EXO', 'Not used']);
      expect(env.translationBooksCells).toEqual(['—', 'LEV 2-5', '—', '—']);
    }));

    it('marks a configured source the last draft did not use without calling that a change', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: {
          lastSelectedTrainingScriptureRanges: [{ projectId: 'project04', scriptureRange: 'GEN' }],
          lastSelectedTranslationScriptureRanges: [{ projectId: 'project03', scriptureRange: 'LEV' }]
        }
      });
      expect(env.trainingBooksCells).toEqual(['—', '—', 'GEN', 'Not used']);
      expect(env.translationBooksCells).toEqual(['—', 'LEV', '—', '—']);
      expect(env.sourcesChangedNotice).toBeNull();
    }));

    it('attributes drafted books to the draft source role, never to a reference project', fakeAsync(() => {
      // The last draft was drafted from project04, which is now configured only as a reference project
      const env = new TestEnvironment({
        draftConfig: TestEnvironment.lastDraft({
          lastSelectedTranslationScriptureRanges: [{ projectId: 'project04', scriptureRange: 'LEV' }]
        })
      });
      expect(env.sourceRoles).toEqual([
        'Target',
        'Draft source',
        'Reference project',
        'Reference project',
        'Former draft source'
      ]);
      expect(env.trainingBooksCells).toEqual(['—', '—', 'GEN', 'GEN', '—']);
      expect(env.translationBooksCells).toEqual(['—', 'Not used', '—', '—', 'LEV']);
      expect(env.sourceLabels[4]).toBe('project04');
    }));

    it('adds rows for projects the last draft used that are no longer configured', fakeAsync(() => {
      const env = new TestEnvironment({
        draftConfig: {
          lastSelectedTrainingScriptureRanges: [
            { projectId: 'project04', scriptureRange: 'GEN' },
            { projectId: 'project05', scriptureRange: 'GEN' },
            { projectId: 'project06', scriptureRange: 'EXO' }
          ],
          lastSelectedTranslationScriptureRanges: [{ projectId: 'project07', scriptureRange: 'LEV' }]
        }
      });
      expect(env.sourceRoles).toEqual([
        'Target',
        'Draft source',
        'Reference project',
        'Reference project',
        'Former draft source',
        'Former reference project'
      ]);
      expect(env.sourceLabels[4]).toBe('project07');
      expect(env.sourceLabelCells[4]).toContain('No longer configured as a source');
      expect(env.sourceLabels[5]).toBe('project06');
      expect(env.trainingBooksCells[5]).toBe('EXO');
      expect(env.translationBooksCells[4]).toBe('LEV');
      // Former sources can still be downloaded, so there is a button for every row
      expect(env.sourceDownloadButtons.length).toBe(6);
      expect(env.sourcesChangedNotice).not.toBeNull();
    }));
  });

  describe('serval configuration', () => {
    it('should change serval config value', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.servalConfigTextArea.value).toBe('');
      expect(env.statusDone(env.servalConfigStatus)).toBeNull();

      env.setServalConfigValue('{}');
      env.clickElement(env.saveServalConfigButton);

      verify(mockSFProjectService.onlineSetServalConfig(env.mockProjectId, anything())).once();
      expect(env.statusDone(env.servalConfigStatus)).not.toBeNull();
    }));

    it('should clear the serval config value', fakeAsync(() => {
      const env = new TestEnvironment({ draftConfig: { servalConfig: '{}' } });
      expect(env.servalConfigTextArea.value).toBe('{}');
      expect(env.statusDone(env.servalConfigStatus)).toBeNull();

      env.setServalConfigValue('');
      env.clickElement(env.saveServalConfigButton);

      verify(mockSFProjectService.onlineSetServalConfig(env.mockProjectId, anything())).once();
      expect(env.statusDone(env.servalConfigStatus)).not.toBeNull();
    }));

    it('should not update an unchanged serval config value', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.servalConfigTextArea.value).toBe('');
      expect(env.statusDone(env.servalConfigStatus)).toBeNull();

      env.setServalConfigValue('');
      env.clickElement(env.saveServalConfigButton);

      verify(mockSFProjectService.onlineSetServalConfig(env.mockProjectId, anything())).never();
      expect(env.statusDone(env.servalConfigStatus)).toBeNull();
    }));

    it('should notify of a backend error', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockSFProjectService.onlineSetServalConfig(env.mockProjectId, anything())).thenReject(
        new CommandError(CommandErrorCode.InternalError, 'error')
      );
      expect(env.servalConfigTextArea.value).toBe('');
      expect(env.statusError(env.servalConfigStatus)).toBeNull();

      env.setServalConfigValue('{}');
      env.clickElement(env.saveServalConfigButton);

      verify(mockSFProjectService.onlineSetServalConfig(env.mockProjectId, anything())).once();
      expect(env.statusError(env.servalConfigStatus)).not.toBeNull();
    }));
  });

  class TestEnvironment {
    readonly component: ServalProjectComponent;
    readonly fixture: ComponentFixture<ServalProjectComponent>;
    readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
      OnlineStatusService
    ) as TestOnlineStatusService;

    mockProjectId = 'project01';

    /** A last draft trained on project04 and project05 and drafted from project03, with any overrides applied. */
    static lastDraft(overrides: Partial<DraftConfig> = {}): Partial<DraftConfig> {
      return {
        lastSelectedTrainingScriptureRanges: [
          { projectId: 'project04', scriptureRange: 'GEN' },
          { projectId: 'project05', scriptureRange: 'GEN' }
        ],
        lastSelectedTranslationScriptureRanges: [{ projectId: 'project03', scriptureRange: 'LEV' }],
        ...overrides
      };
    }

    /** A completed build with two warning diagnostics, requested by user01. */
    static completedBuild(): BuildDto {
      return TestEnvironment.build({
        id: 'build01',
        state: BuildStates.Completed,
        diagnostics: [TestEnvironment.diagnostic('Warning one'), TestEnvironment.diagnostic('Warning two')]
      });
    }

    static diagnostic(
      message: string,
      severity: ServalDiagnosticSeverity = ServalDiagnosticSeverity.Warn
    ): ServalBuildDiagnostic {
      return { code: 'TEST-0001', category: 'TEST', message, severity, data: {} };
    }

    static build({
      id,
      state,
      diagnostics = [],
      diagnosticsTruncated,
      percentCompleted = 1,
      queueDepth = 0,
      requester = 'user01'
    }: {
      id: string;
      state: BuildStates;
      diagnostics?: ServalBuildDiagnostic[];
      diagnosticsTruncated?: boolean;
      percentCompleted?: number;
      queueDepth?: number;
      /** The requesting user's id, or null for a build with no recorded requester. */
      requester?: string | null;
    }): BuildDto {
      return {
        id: id,
        href: '',
        revision: 1,
        engine: { id: 'engine01', href: '' },
        percentCompleted: percentCompleted,
        message: '',
        state: state,
        queueDepth: queueDepth,
        additionalInfo: {
          buildId: id,
          step: 1,
          trainingScriptureRanges: [],
          translationScriptureRanges: [],
          trainingDataFileIds: [],
          translationEngineId: 'engine01',
          dateRequested: '2026-09-04T11:47:00Z',
          dateFinished: '2026-09-04T14:12:00Z',
          requestedByUserId: requester ?? undefined,
          canDenormalizeQuotes: false
        },
        executionData: { trainCount: 31204, pretranslateCount: 1151, diagnostics, diagnosticsTruncated }
      };
    }

    constructor({
      preTranslate = true,
      lastCompletedBuild,
      latestBuild = lastCompletedBuild,
      draftConfig = {},
      trainingDataFiles = [{ fileUrl: 'file-url', dataId: 'dataId01', title: 'training-data-01.csv' } as TrainingData],
      online = true,
      onboardingRequest,
      onboardingRequestError = false
    }: {
      preTranslate?: boolean;
      lastCompletedBuild?: BuildDto;
      /** Defaults to the last completed build, as it does when no newer build has started. */
      latestBuild?: BuildDto;
      draftConfig?: Partial<DraftConfig>;
      trainingDataFiles?: TrainingData[];
      online?: boolean;
      onboardingRequest?: Partial<OpenOnboardingRequest>;
      onboardingRequestError?: boolean;
    } = {}) {
      const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
      const mockProjectDoc = {
        id: this.mockProjectId,
        data: createTestProjectProfile({
          name: 'Project 01',
          shortName: 'P1',
          writingSystem: { tag: 'en' },
          texts: [
            { bookNum: 1, chapters: [{ number: 1 }] },
            { bookNum: 2, chapters: [{ number: 1 }] },
            { bookNum: 3, chapters: [{ number: 1 }] },
            { bookNum: 4, chapters: [{ number: 1 }] }
          ],
          translateConfig: {
            draftConfig: {
              draftingSources: [
                {
                  paratextId: 'ptproject03',
                  projectRef: 'project03',
                  name: 'Project 03',
                  shortName: 'P3',
                  writingSystem: { tag: 'en' }
                }
              ],
              trainingSources: [
                {
                  paratextId: 'ptproject04',
                  projectRef: 'project04',
                  name: 'Project 04',
                  shortName: 'P4',
                  writingSystem: { tag: 'en' }
                },
                {
                  paratextId: 'ptproject05',
                  projectRef: 'project05',
                  name: 'Project 05',
                  shortName: 'P5',
                  writingSystem: { tag: 'en' }
                }
              ],
              lastSelectedTrainingScriptureRanges: draftConfig.lastSelectedTrainingScriptureRanges ?? undefined,
              lastSelectedTranslationScriptureRanges: draftConfig.lastSelectedTranslationScriptureRanges ?? undefined,
              lastSelectedTrainingDataFiles: draftConfig.lastSelectedTrainingDataFiles ?? [],
              lastAvailableTrainingDataFiles: draftConfig.lastAvailableTrainingDataFiles ?? undefined,
              servalConfig: draftConfig.servalConfig ?? undefined
            },
            preTranslate: preTranslate,
            source: {
              paratextId: 'ptproject02',
              projectRef: 'project02',
              name: 'Project 02',
              shortName: 'P2'
            }
          }
        })
      } as SFProjectProfileDoc;
      const mockProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockProjectDoc);

      when(mockActivatedProjectService.projectId).thenReturn(this.mockProjectId);
      when(mockActivatedProjectService.projectId$).thenReturn(mockProjectId$);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(mockProjectDoc$);

      when(mockDraftGenerationService.getLastCompletedBuild(this.mockProjectId)).thenReturn(of(lastCompletedBuild));
      when(mockDraftGenerationService.getLastPreTranslationBuild(this.mockProjectId)).thenReturn(of(latestBuild));
      when(mockDraftGenerationService.getRawBuild(anything())).thenReturn(of({ raw: true }));
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(of(new Blob()));
      when(mockAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
      when(mockSFProjectService.hasDraft(anything())).thenReturn(preTranslate);
      when(mockSFProjectService.onlineSetServalConfig(this.mockProjectId, anything())).thenResolve();
      when(mockUserService.getProfile('user01')).thenResolve({
        data: { displayName: 'Ruth Banda', avatarUrl: '' }
      } as UserProfileDoc);
      when(mockTrainingDataService.getTrainingData(anything(), anything(), anything())).thenReturn(
        of(trainingDataFiles)
      );
      if (onboardingRequestError) {
        when(mockOnboardingRequestService.getOpenOnboardingRequest(this.mockProjectId)).thenReject(
          new CommandError(CommandErrorCode.Forbidden, 'forbidden')
        );
      } else {
        when(mockOnboardingRequestService.getOpenOnboardingRequest(this.mockProjectId)).thenResolve(
          onboardingRequest == null
            ? null
            : {
                id: 'request01',
                submittedAt: '2026-08-01T00:00:00Z',
                submittedBy: { name: 'User One', email: 'user01@example.com' },
                status: 'new',
                contactEmail: null,
                ...onboardingRequest
              }
        );
      }
      when(mockOnboardingRequestService.getStatus(anything())).thenCall((status: string) =>
        status === 'in_progress' ? { value: 'in_progress', label: 'In Progress' } : { value: 'new', label: 'New' }
      );

      spyOn(saveAs, 'saveAs').and.stub();

      this.testOnlineStatusService.setIsOnline(online);
      this.fixture = TestBed.createComponent(ServalProjectComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }

    get heading(): HTMLElement {
      return this.fixture.nativeElement.querySelector('h1');
    }

    get languageTag(): HTMLElement {
      return this.fixture.nativeElement.querySelector('.language-tag');
    }

    get onboardingRequestLink(): HTMLAnchorElement | null {
      return this.fixture.nativeElement.querySelector('#view-onboarding-request');
    }

    get preTranslateToggle(): HTMLButtonElement {
      return this.fixture.nativeElement.querySelector('#pre-translate-toggle button');
    }

    get retrievePreTranslationsButton(): HTMLButtonElement {
      return this.fixture.nativeElement.querySelector('#retrieve-pre-translations');
    }

    get viewEventLogButton(): HTMLButtonElement {
      return this.fixture.nativeElement.querySelector('#view-event-log');
    }

    get sourceDownloadButtons(): NodeListOf<HTMLButtonElement> {
      return this.fixture.nativeElement.querySelectorAll('.draft-sources-table td button');
    }

    get sourceRoles(): string[] {
      return this.cellTexts('.draft-sources-table td.role-cell');
    }

    get sourceLabels(): string[] {
      return this.cellTexts('.draft-sources-table td .source-label');
    }

    get sourceLabelCells(): string[] {
      return this.cellTexts('.draft-sources-table td.mat-column-label');
    }

    get trainingBooksCells(): string[] {
      return this.cellTexts('.draft-sources-table td.training');
    }

    get translationBooksCells(): string[] {
      return this.cellTexts('.draft-sources-table td.translation');
    }

    get sourcesChangedNotice(): HTMLElement | null {
      return this.fixture.nativeElement.querySelector('#sources-changed-notice');
    }

    get noBuildsMessage(): HTMLElement | null {
      return this.fixture.nativeElement.querySelector('#no-builds');
    }

    get buildState(): HTMLElement {
      return this.fixture.nativeElement.querySelector('#build-state .build-state-label');
    }

    get buildStateIcon(): HTMLElement {
      return this.fixture.nativeElement.querySelector('#build-state mat-icon');
    }

    get buildDate(): HTMLElement {
      return this.fixture.nativeElement.querySelector('#build-date');
    }

    get requestedBy(): HTMLElement {
      return this.fixture.nativeElement.querySelector('#requested-by');
    }

    get requestedByName(): HTMLElement | null {
      return this.fixture.nativeElement.querySelector('#requested-by app-owner .name');
    }

    get diagnosticCount(): HTMLElement {
      return this.fixture.nativeElement.querySelector('#diagnostic-count');
    }

    get buildSummaryLabels(): string[] {
      return this.cellTexts('.build-summary dt');
    }

    get diagnosticNotices(): NodeListOf<HTMLElement> {
      return this.fixture.nativeElement.querySelectorAll('.build-diagnostic');
    }

    get showAllDiagnosticsButton(): HTMLButtonElement | null {
      return this.fixture.nativeElement.querySelector('#show-all-diagnostics');
    }

    get downloadDraftButton(): HTMLButtonElement {
      return this.fixture.nativeElement.querySelector('#download-draft');
    }

    get trainingDataDownloadButtons(): NodeListOf<HTMLButtonElement> {
      return this.fixture.nativeElement.querySelectorAll('.training-data-table td button');
    }

    get trainingFileNames(): string[] {
      return this.cellTexts('.training-data-table td.mat-column-title');
    }

    get trainingFileUsedCells(): string[] {
      return this.cellTexts('.training-data-table td.used-in-last-draft');
    }

    get saveServalConfigButton(): HTMLButtonElement {
      return this.fixture.nativeElement.querySelector('#save-serval-config');
    }

    get servalConfigStatus(): DebugElement {
      return this.fixture.debugElement.query(By.css('#serval-config-status'));
    }

    get servalConfigTextArea(): HTMLTextAreaElement {
      return this.fixture.nativeElement.querySelector('#serval-config') as HTMLTextAreaElement;
    }

    set onlineStatus(hasConnection: boolean) {
      this.testOnlineStatusService.setIsOnline(hasConnection);
      tick();
      this.fixture.detectChanges();
    }

    clickElement(button: HTMLElement): void {
      button.click();
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }

    setServalConfigValue(value: string): void {
      this.servalConfigTextArea.value = value;
      this.servalConfigTextArea.dispatchEvent(new Event('input'));
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }

    statusDone(element: DebugElement): HTMLElement {
      return element.nativeElement.querySelector('.check-icon') as HTMLElement;
    }

    statusError(element: DebugElement): HTMLElement {
      return element.nativeElement.querySelector('.error-icon') as HTMLElement;
    }

    /** The trimmed, whitespace-collapsed text of every element matching the selector. */
    private cellTexts(selector: string): string[] {
      const cells: NodeListOf<HTMLElement> = this.fixture.nativeElement.querySelectorAll(selector);
      return Array.from(cells).map(cell => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());
    }
  }
});
