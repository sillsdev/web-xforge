import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import {
  MatLegacyDialogRef as MatDialogRef,
  MatLegacyDialogState as MatDialogState
} from '@angular/material/legacy-dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { EMPTY, of } from 'rxjs';
import { instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { DraftGenerationComponent } from './draft-generation.component';
import { DraftGenerationService } from './draft-generation.service';
import { PreTranslationSignupUrlService } from './pretranslation-signup-url.service';

describe('DraftGenerationComponent', () => {
  let mockFeatureFlagService: jasmine.SpyObj<FeatureFlagService>;
  let mockDialogService: jasmine.SpyObj<DialogService>;
  let mockDraftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let mockActivatedProjectService: jasmine.SpyObj<ActivatedProjectService>;
  let mockProjectService: jasmine.SpyObj<SFProjectService>;
  let mockI18nService: jasmine.SpyObj<I18nService>;
  let mockPreTranslationSignupUrlService: jasmine.SpyObj<PreTranslationSignupUrlService>;

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

  const locale: Locale = {
    localName: 'Test',
    englishName: 'Test',
    canonicalTag: 'en',
    direction: 'ltr',
    tags: ['test'],
    production: false
  };

  class TestEnvironment {
    readonly testOnlineStatusService: TestOnlineStatusService;
    component!: DraftGenerationComponent;
    fixture!: ComponentFixture<DraftGenerationComponent>;

    constructor(preInit?: () => void) {
      this.setup();

      if (preInit) {
        preInit();
      }

      TestBed.configureTestingModule({
        imports: [
          TestOnlineStatusModule.forRoot(),
          RouterTestingModule,
          TranslocoMarkupModule,
          TestTranslocoModule,
          NoopAnimationsModule
        ],
        providers: [
          { provide: FeatureFlagService, useValue: mockFeatureFlagService },
          { provide: DraftGenerationService, useValue: mockDraftGenerationService },
          { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
          { provide: SFProjectService, useValue: mockProjectService },
          { provide: DialogService, useValue: mockDialogService },
          { provide: I18nService, useValue: mockI18nService },
          { provide: PreTranslationSignupUrlService, useValue: mockPreTranslationSignupUrlService },
          { provide: OnlineStatusService, useClass: TestOnlineStatusService }
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
        { allowForwardTranslationNmtDrafting: createTestFeatureFlag(false) }
      );
      mockDialogService = jasmine.createSpyObj<DialogService>(['openGenericDialog']);
      mockI18nService = jasmine.createSpyObj<I18nService>(['getLanguageDisplayName', 'translate'], {
        locale$: of(locale)
      });
      mockDraftGenerationService = jasmine.createSpyObj<DraftGenerationService>([
        'startBuildOrGetActiveBuild',
        'cancelBuild',
        'getBuildProgress',
        'pollBuildProgress',
        'getLastCompletedBuild'
      ]);
      mockActivatedProjectService = jasmine.createSpyObj<ActivatedProjectService>([], {
        projectId: 'testProjectId',
        projectId$: of('testProjectId'),
        projectDoc$: of({
          id: 'testProjectId',
          data: createTestProjectProfile({
            writingSystem: {
              tag: 'en'
            },
            translateConfig: {
              projectType: ProjectType.BackTranslation,
              source: {
                projectRef: 'testSourceProjectId',
                writingSystem: {
                  tag: 'es'
                }
              }
            }
          })
        } as SFProjectProfileDoc)
      });
      mockProjectService = jasmine.createSpyObj<SFProjectService>(['getProfile']);
      mockPreTranslationSignupUrlService = jasmine.createSpyObj<PreTranslationSignupUrlService>(['generateSignupUrl']);

      mockI18nService.getLanguageDisplayName.and.returnValue('English');
      mockPreTranslationSignupUrlService.generateSignupUrl.and.returnValue(of('').toPromise());
      mockDraftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.pollBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.getLastCompletedBuild.and.returnValue(of(buildDto));
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
  }

  describe('ngOnInit', () => {
    it('should subscribe to build progress', () => {
      let env = new TestEnvironment();

      expect(env.component.draftJob).toEqual(buildDto);
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(mockDraftGenerationService.pollBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(env.component.draftViewerUrl).toEqual('/projects/testProjectId/draft-preview');
      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(true);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.targetLanguage).toBe('en');
    });

    it('should detect project requirements', () => {
      let env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: 'testProjectId',
          projectId$: of('testProjectId'),
          projectDoc$: of({
            data: createTestProjectProfile({
              writingSystem: {
                tag: 'xyz'
              },
              translateConfig: {
                projectType: ProjectType.Standard
              }
            })
          })
        });
      });

      expect(env.component.isBackTranslation).toBe(false);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(false);
    });

    it('should detect source language same as target language', () => {
      let env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: 'testProjectId',
          projectId$: of('testProjectId'),
          projectDoc$: of({
            data: createTestProjectProfile({
              writingSystem: {
                tag: 'xyz'
              },
              translateConfig: {
                projectType: ProjectType.BackTranslation,
                source: {
                  projectRef: 'testSourceProjectId',
                  writingSystem: {
                    tag: 'xyz'
                  }
                }
              }
            })
          })
        });
      });

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(false);
    });
  });

  describe('Online status', () => {
    it('should display offline message when offline', () => {
      let env = new TestEnvironment();
      env.testOnlineStatusService.setIsOnline(false);

      expect(env.offlineTextElement).toBeDefined();
    });

    it('should not display offline message when online', () => {
      let env = new TestEnvironment();

      expect(env.offlineTextElement).toBeNull();
    });
  });

  describe('warnings', () => {
    describe('source text missing', () => {
      it('should show warning when source text is missing AND target language is supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).not.toBe(null);
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).toBe(null);
      });

      it('should not show warning when source text is not missing', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).toBe(null);
      });
    });

    describe('source and target text must be different', () => {
      it('should show warning when source text is not missing AND source and target are same AND target language is supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-target-same')).not.toBe(null);
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-target-same')).toBe(null);
      });

      it('should not show warning when source and target text are different', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-target-same')).toBe(null);
      });
    });
  });

  describe('getInfoAlert', () => {
    it('should show "approval needed" info alert when isPreTranslationApproved is false and project is not in back translation mode', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          { allowForwardTranslationNmtDrafting: createTestFeatureFlag(true) }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isSourceAndTargetDifferent = false;
      env.component.isPreTranslationApproved = false;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(false);
      expect(env.getElementByTestId('approval-needed')).not.toBe(null);
    });

    it('should not show "approval needed" info alert when isPreTranslationApproved is true', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          { allowForwardTranslationNmtDrafting: createTestFeatureFlag(true) }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isSourceAndTargetDifferent = false;
      env.component.isPreTranslationApproved = true;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(false);
      expect(env.getElementByTestId('approval-needed')).toBe(null);
    });

    it('should not show "approval needed" info alert when project is in back translation mode', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          { allowForwardTranslationNmtDrafting: createTestFeatureFlag(true) }
        );
      });
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isSourceAndTargetDifferent = false;
      env.component.isPreTranslationApproved = true;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(true);
      expect(env.getElementByTestId('approval-needed')).toBe(null);
    });
  });

  describe('requirements', () => {
    it('should have `isTargetLanguageSupported == true` when project is forward translation', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          { allowForwardTranslationNmtDrafting: createTestFeatureFlag(true) }
        );

        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: 'testProjectId',
          projectId$: of('testProjectId'),
          projectDoc$: of({
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
          })
        });
      });
      expect(env.component.isForwardTranslationEnabled).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(true);
    });

    it('should enforce supported language for back translations even when forward translation feature flag is set', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          { allowForwardTranslationNmtDrafting: createTestFeatureFlag(true) }
        );

        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: 'testProjectId',
          projectId$: of('testProjectId'),
          projectDoc$: of({
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
          })
        });
      });
      expect(env.component.isForwardTranslationEnabled).toBe(true);
      expect(env.component.isBackTranslationMode).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
    });
  });

  describe('navigateToTab', () => {
    it('should navigate to pre-generate steps', fakeAsync(() => {
      let env = new TestEnvironment(() => {
        mockProjectService.getProfile.and.returnValue(
          new Promise<SFProjectProfileDoc>(() => ({
            data: createTestProjectProfile({ texts: [] })
          }))
        );
      });

      env.component.navigateToTab('pre-generate-steps');
      env.fixture.detectChanges();
      tick();
      expect(env.preGenerationStepper).not.toBeNull();
    }));
  });

  describe('startBuild', () => {
    it('should start the draft build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(of(buildDto));
      });

      env.component.startBuild([]);
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: 'testProjectId',
        trainingBooks: []
      });
    });

    it('should not attempt "cancel dialog" close for queued build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(
          of({ ...buildDto, state: BuildStates.Queued })
        );
      });

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild([]);
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: 'testProjectId',
        trainingBooks: []
      });
      verify(mockDialogRef.getState()).never();
      verify(mockDialogRef.close()).never();
    });

    it('should not attempt "cancel dialog" close for pending build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(
          of({ ...buildDto, state: BuildStates.Pending })
        );
      });

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild([]);
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: 'testProjectId',
        trainingBooks: []
      });
      verify(mockDialogRef.getState()).never();
      verify(mockDialogRef.close()).never();
    });

    it('should not attempt "cancel dialog" close for active build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(
          of({ ...buildDto, state: BuildStates.Active })
        );
      });

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild([]);
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: 'testProjectId',
        trainingBooks: []
      });
      verify(mockDialogRef.getState()).never();
      verify(mockDialogRef.close()).never();
    });

    it('should attempt "cancel dialog" close for cancelled build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(
          of({ ...buildDto, state: BuildStates.Canceled })
        );
      });

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      when(mockDialogRef.getState()).thenReturn(MatDialogState.OPEN);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.startBuild([]);
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith({
        projectId: 'testProjectId',
        trainingBooks: []
      });
      verify(mockDialogRef.close()).once();
    });
  });

  describe('cancel', () => {
    it('should cancel the draft build if user confirms "cancel" dialog', async () => {
      let env = new TestEnvironment(() => {
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
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
    });

    it('should not cancel the draft build if user exits "cancel" dialog', async () => {
      let env = new TestEnvironment(() => {
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

    it('should cancel the draft build without dialog if the build state is not active', async () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Queued };
      await env.component.cancel();
      env.component.draftJob = { ...buildDto, state: BuildStates.Canceled };
      env.fixture.detectChanges();
      expect(mockDialogService.openGenericDialog).not.toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
    });
  });

  describe('isDraftInProgress', () => {
    it('should return true if the draft build is in progress', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Active } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Pending } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Queued } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not in progress', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftQueued', () => {
    it('should return true if the draft build is queued', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftQueued({ state: BuildStates.Queued } as BuildDto)).toBe(true);
      expect(env.component.isDraftQueued({ state: BuildStates.Pending } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not queued', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftQueued({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftQueued({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftActive', () => {
    it('should return true if the draft build is active', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftActive({ state: BuildStates.Active } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not active', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftActive({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftActive({ state: BuildStates.Queued } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftComplete', () => {
    it('should return true if the draft build is complete', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftComplete({ state: BuildStates.Completed } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not complete', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftComplete({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftComplete({ state: BuildStates.Queued } as BuildDto)).toBe(false);
    });
  });

  describe('canCancel', () => {
    it('should return true if the draft build is in progress', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Active } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Pending } as BuildDto)).toBe(true);
      expect(env.component.isDraftInProgress({ state: BuildStates.Queued } as BuildDto)).toBe(true);
    });

    it('should return false if the draft build is not in progress', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftInProgress({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftInProgress({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });
});
