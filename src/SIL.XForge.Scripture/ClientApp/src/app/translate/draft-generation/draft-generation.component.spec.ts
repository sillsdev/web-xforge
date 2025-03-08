import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, EMPTY, of, Subject, throwError } from 'rxjs';
import { instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TrainingDataDoc } from '../../core/models/training-data-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { ProgressService } from '../../shared/progress-service/progress.service';
import { NllbLanguageService } from '../nllb-language.service';
import { DraftGenerationComponent } from './draft-generation.component';
import { DraftGenerationService } from './draft-generation.service';
import { DraftHandlingService } from './draft-handling.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from './draft-sources.service';
import { TrainingDataService } from './training-data/training-data.service';

describe('DraftGenerationComponent', () => {
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockFeatureFlagService: jasmine.SpyObj<FeatureFlagService>;
  let mockDialogService: jasmine.SpyObj<DialogService>;
  let mockDraftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let mockDraftSourcesService: jasmine.SpyObj<DraftSourcesService>;
  let mockDraftHandlingService: jasmine.SpyObj<DraftHandlingService>;
  let mockActivatedProjectService: jasmine.SpyObj<ActivatedProjectService>;
  let mockProjectService: jasmine.SpyObj<SFProjectService>;
  let mockUserService: jasmine.SpyObj<UserService>;
  let mockTextDocService: jasmine.SpyObj<TextDocService>;
  let mockNoticeService: jasmine.SpyObj<NoticeService>;
  let mockNllbLanguageService: jasmine.SpyObj<NllbLanguageService>;
  let mockTrainingDataService: jasmine.SpyObj<TrainingDataService>;
  let mockProgressService: jasmine.SpyObj<ProgressService>;

  const buildDto: BuildDto = {
    id: 'testId',
    href: 'testHref',
    revision: 0,
    engine: {
      id: 'testEngineId',
      href: 'testEngineHref'
    },
    percentCompleted: 0,
    message: '',
    state: BuildStates.Queued,
    queueDepth: 0
  };

  const projectId = 'testProjectId';

  class TestEnvironment {
    readonly testOnlineStatusService: TestOnlineStatusService;
    readonly startedOrActiveBuild$ = new Subject<BuildDto>();
    component!: DraftGenerationComponent;
    fixture!: ComponentFixture<DraftGenerationComponent>;

    constructor(preInit?: () => void) {
      this.setup();

      if (preInit) {
        preInit();
      }

      TestBed.configureTestingModule({
        imports: [TestOnlineStatusModule.forRoot(), RouterModule.forRoot([]), TestTranslocoModule],
        providers: [
          { provide: AuthService, useValue: mockAuthService },
          { provide: FeatureFlagService, useValue: mockFeatureFlagService },
          { provide: DraftGenerationService, useValue: mockDraftGenerationService },
          { provide: DraftSourcesService, useValue: mockDraftSourcesService },
          { provide: DraftHandlingService, useValue: mockDraftHandlingService },
          { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
          { provide: SFProjectService, useValue: mockProjectService },
          { provide: UserService, useValue: mockUserService },
          { provide: TextDocService, useValue: mockTextDocService },
          { provide: DialogService, useValue: mockDialogService },
          { provide: NoticeService, useValue: mockNoticeService },
          { provide: NllbLanguageService, useValue: mockNllbLanguageService },
          { provide: OnlineStatusService, useClass: TestOnlineStatusService },
          { provide: TrainingDataService, useValue: mockTrainingDataService },
          { provide: ProgressService, useValue: mockProgressService }
        ]
      });

      this.testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
      this.fixture = TestBed.createComponent(DraftGenerationComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    // Default setup
    setup(): void {
      mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
        'FeatureFlagService',
        {},
        {
          allowForwardTranslationNmtDrafting: createTestFeatureFlag(false)
        }
      );
      mockDialogService = jasmine.createSpyObj<DialogService>(['openGenericDialog']);
      mockNoticeService = jasmine.createSpyObj<NoticeService>(['loadingStarted', 'loadingFinished', 'showError']);
      mockDraftGenerationService = jasmine.createSpyObj<DraftGenerationService>([
        'startBuildOrGetActiveBuild',
        'cancelBuild',
        'getBuildProgress',
        'pollBuildProgress',
        'getGeneratedDraftUsfm',
        'getLastCompletedBuild',
        'downloadGeneratedDraftZip'
      ]);
      TestEnvironment.initProject('user01');
      mockUserService = jasmine.createSpyObj<UserService>(['getCurrentUser']);

      mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(this.startedOrActiveBuild$);
      mockDraftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.pollBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.getLastCompletedBuild.and.returnValue(of(buildDto));
      mockDraftGenerationService.getGeneratedDraftUsfm.and.returnValue(of('\\id Test USFM \\c 1 \\v 1 Test'));
      mockDraftSourcesService = jasmine.createSpyObj<DraftSourcesService>(['getDraftProjectSources']);
      mockDraftSourcesService.getDraftProjectSources.and.returnValue(
        of({
          draftingSources: [],
          trainingSources: [],
          trainingTargets: []
        } as DraftSourcesAsArrays)
      );
      mockNllbLanguageService = jasmine.createSpyObj<NllbLanguageService>(['isNllbLanguageAsync']);
      mockNllbLanguageService.isNllbLanguageAsync.and.returnValue(Promise.resolve(false));

      const mockTrainingDataQuery: RealtimeQuery<TrainingDataDoc> = mock(RealtimeQuery);
      when(mockTrainingDataQuery.localChanges$).thenReturn(of());
      when(mockTrainingDataQuery.ready$).thenReturn(of(true));
      when(mockTrainingDataQuery.remoteChanges$).thenReturn(of());
      when(mockTrainingDataQuery.remoteDocChanges$).thenReturn(of());
      mockTrainingDataService = jasmine.createSpyObj<TrainingDataService>(['queryTrainingDataAsync']);
      mockTrainingDataService.queryTrainingDataAsync.and.returnValue(Promise.resolve(instance(mockTrainingDataQuery)));
    }

    static initProject(currentUserId: string, preTranslate: boolean = true): void {
      const projectDoc = {
        id: projectId,
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'en'
          },
          translateConfig: {
            preTranslate,
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'es'
              }
            },
            draftConfig: {
              lastSelectedTrainingBooks: preTranslate ? [1] : [],
              lastSelectedTranslationBooks: preTranslate ? [2] : [],
              lastSelectedTrainingScriptureRange: preTranslate ? 'GEN' : undefined,
              lastSelectedTranslationScriptureRange: preTranslate ? 'EXO' : undefined
            }
          },
          texts: [
            { bookNum: 1, chapters: [{ number: 1 }], permissions: { user01: TextInfoPermission.Write } },
            {
              bookNum: 2,
              chapters: [{ number: 1, hasDraft: preTranslate }],
              permissions: { user01: TextInfoPermission.Write }
            }
          ],
          userRoles: {
            user01: SFProjectRole.ParatextAdministrator,
            user02: SFProjectRole.ParatextTranslator
          },
          sync: {
            lastSyncSuccessful: true
          }
        })
      } as SFProjectProfileDoc;
      mockAuthService = jasmine.createSpyObj<AuthService>(['requestParatextCredentialUpdate'], {
        currentUserId,
        currentUserRoles: [SystemRole.User]
      });
      mockActivatedProjectService = jasmine.createSpyObj<ActivatedProjectService>([], {
        projectId: projectId,
        projectId$: of(projectId),
        projectDoc: projectDoc,
        projectDoc$: of(projectDoc),
        changes$: of(projectDoc)
      });
    }

    get downloadButton(): HTMLElement | null {
      return this.getElementByTestId('download-button');
    }

    get downloadSpinner(): HTMLElement | null {
      return this.getElementByTestId('download-spinner');
    }

    get offlineTextElement(): HTMLElement | null {
      return (this.fixture.nativeElement as HTMLElement).querySelector('.offline-text');
    }

    get preGenerationStepper(): HTMLElement | null {
      return (this.fixture.nativeElement as HTMLElement).querySelector('app-draft-generation-steps');
    }

    getElementByTestId(testId: string): HTMLElement | null {
      return this.fixture.nativeElement.querySelector(`[data-test-id="${testId}"]`);
    }

    getElementByKey(key: string): HTMLElement | null {
      return this.fixture.nativeElement.querySelector(`[key="${key}"]`);
    }
  }

  describe('ngOnInit', () => {
    it('should subscribe to build progress', () => {
      const env = new TestEnvironment();

      expect(env.component.draftJob).toEqual(buildDto);
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(mockDraftGenerationService.pollBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(true);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.targetLanguage).toBe('en');
    });

    it('does not subscribe to build when project does not have drafting enabled', () => {
      const _ = new TestEnvironment(() => TestEnvironment.initProject('user01', false));
      expect(mockDraftGenerationService.getLastCompletedBuild).not.toHaveBeenCalled();
      expect(mockDraftGenerationService.getBuildProgress).not.toHaveBeenCalled();
    });

    it('should detect project requirements', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'xyz'
          },
          translateConfig: {
            projectType: ProjectType.Standard
          }
        })
      } as SFProjectProfileDoc;
      const env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: projectId,
          projectId$: of(projectId),
          projectDoc: projectDoc,
          projectDoc$: of(projectDoc),
          changes$: of(projectDoc)
        });
      });
      env.fixture.detectChanges();
      tick();

      expect(env.component.isBackTranslation).toBe(false);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(false);
    }));
  });

  describe('Online status', () => {
    it('should display offline message when offline', () => {
      const env = new TestEnvironment();
      env.testOnlineStatusService.setIsOnline(false);
      env.fixture.detectChanges();
      expect(env.offlineTextElement).not.toBeNull();

      env.component.currentPage = 'steps';
      env.fixture.detectChanges();
      expect(env.offlineTextElement).not.toBeNull();
    });

    it('should not display offline message when online', () => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.offlineTextElement).toBeNull();

      env.component.currentPage = 'steps';
      env.fixture.detectChanges();
      expect(env.offlineTextElement).toBeNull();
    });
  });

  describe('warnings', () => {
    it('should not show any warnings if not a back translation nor pre-translate approved', () => {
      const env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isPreTranslationApproved = false;

      // source text is missing
      env.component.isSourceProjectSet = false;
      env.component.isTargetLanguageSupported = true;
      env.fixture.detectChanges();
      expect(env.getElementByTestId('warning-source-text-missing')).toBeNull();

      // source and target text are the same
      env.component.isSourceProjectSet = true;
      env.fixture.detectChanges();
    });
    describe('source text missing', () => {
      it('should show warning with settings link when source text is missing AND target language is supported, user is Paratext Admin', () => {
        const env = new TestEnvironment(() => TestEnvironment.initProject('user01'));
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.component.isProjectAdmin).toEqual(true);
        expect(env.getElementByTestId('warning-source-text-missing')).not.toBeNull();
        expect(env.getElementByKey('draft_generation.info_alert_source_text_not_selected')).not.toBeNull();
        expect(env.getElementByKey('draft_generation.non_pa_info_alert_source_text_not_selected')).toBeNull();
      });

      it('should show warning to contact Paratext Admin when source text is missing AND target language is supported, user is Translator', () => {
        const env = new TestEnvironment(() => TestEnvironment.initProject('user02'));
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.component.isProjectAdmin).toBe(false);
        expect(env.getElementByTestId('warning-source-text-missing')).not.toBeNull();
        expect(env.getElementByKey('draft_generation.info_alert_source_text_not_selected')).toBeNull();
        expect(env.getElementByKey('draft_generation.non_pa_info_alert_source_text_not_selected')).not.toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        const env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).toBeNull();
      });

      it('should not show warning when source text is not missing', () => {
        const env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).toBeNull();
      });
    });

    describe('user must have access to source project', () => {
      it('should show warning when no access to source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  name: 'source',
                  shortName: 'SRC',
                  projectRef: 'source',
                  paratextId: 'PT_SRC',
                  texts: [],
                  writingSystem: {
                    tag: 'es'
                  },
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isPreTranslationApproved = true;
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        expect(env.getElementByTestId('warning-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to source project if project is not back translation nor pre-translate approved', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  name: 'source',
                  shortName: 'SRC',
                  projectRef: 'source',
                  paratextId: 'PT_SRC',
                  texts: [],
                  writingSystem: {
                    tag: 'es'
                  },
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when access to source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  noAccess: false
                } as DraftSource
              ],
              trainingSources: [],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });
    });

    describe('user must have access to training source project', () => {
      it('should show warning when no access to training source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isPreTranslationApproved = true;
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-training-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to alternate source project and not back translation nor pre-translate approved', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to alternate source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when access to alternate training source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                undefined
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });
    });

    describe('user must have access to additional training source project', () => {
      it('should show warning when no access to additional training source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                undefined,
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to additional training source project and not back translation nor pre-translate approved', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                undefined,
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                undefined,
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                undefined,
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingSources: [
                undefined,
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to training source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                {
                  noAccess: true
                } as DraftSource,
                {
                  noAccess: true
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when access to additional training source project', () => {
        const env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              draftingSources: [],
              trainingSources: [
                undefined,
                {
                  noAccess: false
                } as DraftSource
              ],
              trainingTargets: []
            } as DraftSourcesAsArrays)
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });
    });

    describe('synchronization', () => {
      describe('synchronization failed warning', () => {
        let env: TestEnvironment;

        beforeEach(() => {
          const projectDoc = {
            data: createTestProjectProfile({
              sync: { lastSyncSuccessful: false }
            })
          };
          env = new TestEnvironment(() => {
            mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
              projectId: projectId,
              projectId$: of(projectId),
              projectDoc: projectDoc,
              projectDoc$: of(projectDoc),
              changes$: of(projectDoc)
            });
          });
        });

        it('should not show the synchronization failed warning if a build is queued', () => {
          env.component.draftJob = { ...buildDto, state: BuildStates.Queued };
          env.component.isBackTranslation = true;
          env.fixture.detectChanges();
          expect(env.component.lastSyncSuccessful).toBeFalsy();
          expect(env.getElementByTestId('notice-project-will-sync')).toBeNull();
          expect(env.getElementByTestId('warning-last-sync-failed')).toBeNull();
        });

        it('should show the synchronization failed warning for approved translations', () => {
          env.component.draftJob = { ...buildDto, state: BuildStates.Completed };
          env.component.isPreTranslationApproved = true;
          env.fixture.detectChanges();
          expect(env.component.lastSyncSuccessful).toBeFalsy();
          expect(env.getElementByTestId('notice-project-will-sync')).toBeNull();
          expect(env.getElementByTestId('warning-last-sync-failed')).not.toBeNull();
        });

        it('should show the synchronization failed warning for back translations', () => {
          env.component.draftJob = { ...buildDto, state: BuildStates.Completed };
          env.component.isBackTranslation = true;
          env.fixture.detectChanges();
          expect(env.component.lastSyncSuccessful).toBeFalsy();
          expect(env.getElementByTestId('notice-project-will-sync')).toBeNull();
          expect(env.getElementByTestId('warning-last-sync-failed')).not.toBeNull();
        });
      });
    });
  });

  describe('getInfoAlert', () => {
    it('should show "approval needed" info alert when isPreTranslationApproved is false and project is not in back translation mode', () => {
      const env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isPreTranslationApproved = false;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(false);
      expect(env.getElementByTestId('approval-needed')).not.toBeNull();
    });

    it('should not show "approval needed" info alert when isPreTranslationApproved is true', () => {
      const env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isPreTranslationApproved = true;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(false);
      expect(env.getElementByTestId('approval-needed')).toBeNull();
    });

    it('should not show "approval needed" info alert when project is in back translation mode', () => {
      const env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isPreTranslationApproved = true;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(true);
      expect(env.getElementByTestId('approval-needed')).toBeNull();
    });
  });

  describe('requirements', () => {
    it('should have `isTargetLanguageSupported == true` when project is forward translation', () => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'xyz'
          },
          translateConfig: {
            projectType: ProjectType.Standard,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'zyx'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      const env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
          }
        );

        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: projectId,
          projectId$: of(projectId),
          projectDoc: projectDoc,
          projectDoc$: of(projectDoc),
          changes$: of(projectDoc)
        });
      });
      expect(env.component.isForwardTranslationEnabled).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(true);
    });

    it('should enforce supported language for back translations even when forward translation feature flag is set', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'xyz'
          },
          translateConfig: {
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'zyx'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      const env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true)
          }
        );

        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: projectId,
          projectId$: of(projectId),
          projectDoc: projectDoc,
          projectDoc$: of(projectDoc),
          changes$: of(projectDoc)
        });
      });
      env.fixture.detectChanges();
      tick();
      expect(env.component.isForwardTranslationEnabled).toBe(true);
      expect(env.component.isBackTranslationMode).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
    }));
  });

  describe('currentPage', () => {
    it('should navigate to pre-generate steps', fakeAsync(() => {
      const env = new TestEnvironment(() => {
        mockUserService.getCurrentUser.and.returnValue(
          new Promise<UserDoc>(() => ({
            data: createTestUser()
          }))
        );
        const projectDoc = {
          data: createTestProjectProfile()
        };

        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: projectId,
          projectId$: of(projectId),
          projectDoc: projectDoc,
          projectDoc$: of(projectDoc),
          changes$: of(null)
        });
      });

      env.component.currentPage = 'steps';
      env.fixture.detectChanges();
      tick();
      expect(env.preGenerationStepper).not.toBeNull();
    }));
  });

  describe('startBuild', () => {
    it('should start the draft build', () => {
      const env = new TestEnvironment();

      env.component.currentPage = 'steps';
      env.component.startBuild({
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false,
        projectId: projectId
      });
      env.fixture.detectChanges();
      expect(env.component.currentPage).toBe('steps');
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: projectId,
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false
      });
      env.startedOrActiveBuild$.next(buildDto);
      env.fixture.detectChanges();
      expect(env.component.currentPage).toBe('initial');
    });

    it('should not attempt "cancel dialog" close for queued build', () => {
      const env = new TestEnvironment();

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild({
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false,
        projectId: projectId
      });
      env.startedOrActiveBuild$.next({ ...buildDto, state: BuildStates.Queued });
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: projectId,
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false
      });
      verify(mockDialogRef.getState()).never();
      verify(mockDialogRef.close()).never();
    });

    it('should not attempt "cancel dialog" close for pending build', () => {
      const env = new TestEnvironment();

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild({
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false,
        projectId: projectId
      });
      env.startedOrActiveBuild$.next({ ...buildDto, state: BuildStates.Pending });
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: projectId,
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false
      });
      verify(mockDialogRef.getState()).never();
      verify(mockDialogRef.close()).never();
    });

    it('should not attempt "cancel dialog" close for active build', () => {
      const env = new TestEnvironment();

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild({
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false,
        projectId: projectId
      });
      env.startedOrActiveBuild$.next({ ...buildDto, state: BuildStates.Active });
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: projectId,
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false
      });
      verify(mockDialogRef.getState()).never();
      verify(mockDialogRef.close()).never();
    });

    it('should attempt "cancel dialog" close for cancelled build', () => {
      const env = new TestEnvironment();

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      when(mockDialogRef.getState()).thenReturn(MatDialogState.OPEN);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild({
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false,
        projectId: projectId
      });
      env.startedOrActiveBuild$.next({ ...buildDto, state: BuildStates.Canceled });
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: projectId,
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false
      });
      verify(mockDialogRef.close()).once();
    });

    it('should track whether the current project is not syncing', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      tick();

      expect(env.component.isSyncing()).toBe(false);
    }));

    it('should track whether the current project is syncing', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'xyz'
          },
          translateConfig: {
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'en'
              }
            }
          },
          sync: {
            queuedCount: 1
          }
        })
      } as SFProjectProfileDoc;
      const env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: projectId,
          projectId$: of(projectId),
          projectDoc: projectDoc,
          projectDoc$: of(projectDoc),
          changes$: of(projectDoc)
        });
      });
      env.fixture.detectChanges();
      tick();

      expect(env.component.isSyncing()).toBe(true);
    }));

    it('should display the Paratext credentials update prompt when startBuild throws a forbidden error', fakeAsync(() => {
      const env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 401 }))
        );
      });

      env.component.startBuild({
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false,
        projectId: projectId
      });
      tick();

      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: projectId,
        trainingDataFiles: [],
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        fastTraining: false
      });
      expect(mockAuthService.requestParatextCredentialUpdate).toHaveBeenCalled();
    }));
  });

  describe('cancel', () => {
    it('should cancel the draft build if user confirms "cancel" dialog', async () => {
      const env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue({
          dialogRef: {} as MatDialogRef<any>,
          result: Promise.resolve(true)
        });
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Active };
      await env.component.cancel();
      env.component.draftJob = { ...buildDto, state: BuildStates.Canceled };
      env.fixture.detectChanges();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith(projectId);
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
    });

    it('should not cancel the draft build if user exits "cancel" dialog', async () => {
      const env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue({
          dialogRef: {} as MatDialogRef<any>,
          result: Promise.resolve(false)
        });
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Active };
      await env.component.cancel();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).not.toHaveBeenCalled();
    });

    it('should cancel pending draft build if user confirms "cancel" dialog', async () => {
      const env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue({
          dialogRef: {} as MatDialogRef<any>,
          result: Promise.resolve(true)
        });
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Pending };
      await env.component.cancel();
      env.component.draftJob = { ...buildDto, state: BuildStates.Canceled };
      env.fixture.detectChanges();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
    });

    it('should not cancel pending draft build if user exits "cancel" dialog', async () => {
      const env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue({
          dialogRef: {} as MatDialogRef<any>,
          result: Promise.resolve(false)
        });
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Pending };
      await env.component.cancel();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).not.toHaveBeenCalled();
    });

    it('should cancel queued draft build if user confirms "cancel" dialog', async () => {
      const env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue({
          dialogRef: {} as MatDialogRef<any>,
          result: Promise.resolve(true)
        });
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Queued };
      await env.component.cancel();
      env.component.draftJob = { ...buildDto, state: BuildStates.Canceled };
      env.fixture.detectChanges();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
    });

    it('should not cancel queued draft build if user exits "cancel" dialog', async () => {
      const env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue({
          dialogRef: {} as MatDialogRef<any>,
          result: Promise.resolve(false)
        });
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Queued };
      await env.component.cancel();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).not.toHaveBeenCalled();
    });
  });

  describe('isDraftInProgress', () => {
    it('should return true if the draft build is in progress', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Active } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Pending } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Queued } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Finishing } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not in progress', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftQueued', () => {
    it('should return true if the draft build is queued', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftQueued({ state: BuildStates.Queued } as BuildDto)).toBe(true);
      expect(env.component.isDraftQueued({ state: BuildStates.Pending } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not queued', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftQueued({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Finishing } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftActive', () => {
    it('should return true if the draft build is active', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftActive({ state: BuildStates.Active } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not active', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftActive({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Queued } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Finishing } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftFinishing', () => {
    it('should return true if the draft build is finishing', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftFinishing({ state: BuildStates.Finishing } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not active', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftFinishing({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftFinishing({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftFinishing({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftFinishing({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(env.component.isDraftFinishing({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftFinishing({ state: BuildStates.Queued } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftComplete', () => {
    it('should return true if the draft build is complete', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftComplete({ state: BuildStates.Completed } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not complete', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftComplete({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Queued } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Finishing } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftFaulted', () => {
    it('should return true if the draft build is faulted', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.fixture.detectChanges();
      expect(env.component.isDraftFaulted({ state: BuildStates.Faulted } as BuildDto)).toBe(true);
      expect(env.getElementByTestId('warning-generation-failed')).not.toBeNull();
      expect(env.getElementByTestId('technical-details')).not.toBeNull();
    });

    it('should return false if the draft build is not faulted', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftFaulted({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Queued } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Finishing } as BuildDto)).toBe(false);
      expect(env.getElementByTestId('warning-generation-failed')).toBeNull();
      expect(env.getElementByTestId('technical-details')).toBeNull();
    });
  });

  describe('canCancel', () => {
    it('should return true if the draft build is in progress', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Active } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Pending } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Queued } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not in progress', () => {
      const env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });

  describe('downloadProgress', () => {
    it('should show number between 0 and 100', () => {
      const env = new TestEnvironment();
      env.component.downloadBooksProgress = 4;
      env.component.downloadBooksTotal = 8;
      expect(env.component.downloadProgress).toBe(50);
    });

    it('should not divide by zero', () => {
      const env = new TestEnvironment();
      env.component.downloadBooksProgress = 4;
      env.component.downloadBooksTotal = 0;
      expect(env.component.downloadProgress).toBe(0);
    });
  });

  describe('download draft button', () => {
    it('button should display if there are draft books available', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.hasDraftBooksAvailable = true;
      env.fixture.detectChanges();
      expect(env.downloadButton).not.toBeNull();
    });

    it('button should display if there is a completed build while a build is faulted', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.lastCompletedBuild = { ...buildDto, state: BuildStates.Completed };
      env.component.hasDraftBooksAvailable = true;
      env.fixture.detectChanges();

      expect(env.downloadButton).not.toBeNull();
    });

    it('button should display if there is a completed build while a build is queued', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Queued };
      env.component.lastCompletedBuild = { ...buildDto, state: BuildStates.Completed };
      env.component.hasDraftBooksAvailable = true;
      env.fixture.detectChanges();

      expect(env.downloadButton).not.toBeNull();
    });

    it('button should not display if there is no completed build while a build is faulted', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.lastCompletedBuild = undefined;
      env.component.hasDraftBooksAvailable = true;
      env.fixture.detectChanges();

      expect(env.downloadButton).toBeNull();
    });

    it('button should display if the project updates the hasDraft field', () => {
      // Setup the project and subject
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          translateConfig: {
            preTranslate: true,
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'es'
              }
            }
          },
          texts: [{ bookNum: 1, chapters: [{ number: 1, hasDraft: false }] }]
        })
      } as SFProjectProfileDoc;
      const projectSubject = new BehaviorSubject<SFProjectProfileDoc>(projectDoc);
      const projectObservable = projectSubject.asObservable();
      const buildSubject = new BehaviorSubject<BuildDto>(buildDto);
      const buildObservable = buildSubject.asObservable();

      // Setup the initial environment
      const env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [], {
          projectDoc: projectDoc,
          projectDoc$: projectObservable,
          changes$: projectObservable
        });
        mockDraftGenerationService.getBuildProgress.and.returnValue(buildObservable);
        mockDraftGenerationService.pollBuildProgress.and.returnValue(buildObservable);
        mockDraftGenerationService.getLastCompletedBuild.and.returnValue(buildObservable);
      });
      env.fixture.detectChanges();

      // Verify the button is not visible
      expect(env.downloadButton).toBeNull();

      // Update the has draft flag for the project
      projectDoc.data!.texts[0].chapters[0].hasDraft = true;
      projectDoc.data!.translateConfig.draftConfig.lastSelectedTranslationScriptureRange = 'GEN';
      projectSubject.next(projectDoc);
      buildSubject.next({ ...buildDto, state: BuildStates.Completed });

      env.fixture.detectChanges();

      // Verify the button is visible
      expect(env.downloadButton).not.toBeNull();
    });

    it('button should start the download', () => {
      const env = new TestEnvironment();
      spyOn(env.component, 'downloadDraft').and.stub();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.hasDraftBooksAvailable = true;
      env.fixture.detectChanges();

      env.downloadButton!.click();
      expect(env.component.downloadDraft).toHaveBeenCalled();
    });

    it('button should not display if there are no draft books available', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.hasDraftBooksAvailable = false;
      env.fixture.detectChanges();

      expect(env.downloadButton).toBeNull();
    });

    it('spinner should display while the download is in progress', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.hasDraftBooksAvailable = true;
      env.component.downloadBooksProgress = 2;
      env.component.downloadBooksTotal = 4;
      env.fixture.detectChanges();

      expect(env.downloadSpinner).not.toBeNull();
    });

    it('spinner should not display while no download is in progress', () => {
      const env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.component.hasDraftBooksAvailable = true;
      env.component.downloadBooksProgress = 0;
      env.component.downloadBooksTotal = 0;
      env.fixture.detectChanges();

      expect(env.downloadSpinner).toBeNull();
    });
  });

  describe('downloadDraft', () => {
    it('should display an error if one occurs', () => {
      const env = new TestEnvironment();
      mockDraftGenerationService.downloadGeneratedDraftZip.and.returnValue(throwError(() => new Error()));

      env.component.downloadDraft();
      expect(mockNoticeService.showError).toHaveBeenCalledTimes(1);
    });

    it('should emit draft progress', () => {
      const env = new TestEnvironment();
      mockDraftGenerationService.downloadGeneratedDraftZip.and.returnValue(of({ current: 1, total: 2 }));

      env.component.downloadDraft();
      expect(env.component.downloadBooksProgress).toBe(1);
      expect(env.component.downloadBooksTotal).toBe(2);
    });
  });
});
