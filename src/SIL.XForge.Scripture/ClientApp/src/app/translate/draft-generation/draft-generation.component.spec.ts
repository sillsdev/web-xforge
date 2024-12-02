import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, EMPTY, Subject, of, throwError } from 'rxjs';
import { instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlagService, createTestFeatureFlag } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { RealtimeQuery } from '../../../xforge-common/models/realtime-query';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TrainingDataDoc } from '../../core/models/training-data-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { NllbLanguageService } from '../nllb-language.service';
import { DraftGenerationComponent } from './draft-generation.component';
import { DraftGenerationService } from './draft-generation.service';
import { DraftSource, DraftSourcesService } from './draft-sources.service';
import { PreTranslationSignupUrlService } from './pretranslation-signup-url.service';
import { TrainingDataService } from './training-data/training-data.service';

describe('DraftGenerationComponent', () => {
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockFeatureFlagService: jasmine.SpyObj<FeatureFlagService>;
  let mockDialogService: jasmine.SpyObj<DialogService>;
  let mockDraftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let mockDraftSourcesService: jasmine.SpyObj<DraftSourcesService>;
  let mockActivatedProjectService: jasmine.SpyObj<ActivatedProjectService>;
  let mockProjectService: jasmine.SpyObj<SFProjectService>;
  let mockUserService: jasmine.SpyObj<UserService>;
  let mockI18nService: jasmine.SpyObj<I18nService>;
  let mockNoticeService: jasmine.SpyObj<NoticeService>;
  let mockPreTranslationSignupUrlService: jasmine.SpyObj<PreTranslationSignupUrlService>;
  let mockNllbLanguageService: jasmine.SpyObj<NllbLanguageService>;
  let mockTrainingDataService: jasmine.SpyObj<TrainingDataService>;

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
        imports: [
          TestOnlineStatusModule.forRoot(),
          RouterModule.forRoot([]),
          TranslocoMarkupModule,
          TestTranslocoModule,
          NoopAnimationsModule,
          UICommonModule.forRoot()
        ],
        providers: [
          { provide: AuthService, useValue: mockAuthService },
          { provide: FeatureFlagService, useValue: mockFeatureFlagService },
          { provide: DraftGenerationService, useValue: mockDraftGenerationService },
          { provide: DraftSourcesService, useValue: mockDraftSourcesService },
          { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
          { provide: SFProjectService, useValue: mockProjectService },
          { provide: UserService, useValue: mockUserService },
          { provide: DialogService, useValue: mockDialogService },
          { provide: I18nService, useValue: mockI18nService },
          { provide: NoticeService, useValue: mockNoticeService },
          { provide: PreTranslationSignupUrlService, useValue: mockPreTranslationSignupUrlService },
          { provide: NllbLanguageService, useValue: mockNllbLanguageService },
          { provide: OnlineStatusService, useClass: TestOnlineStatusService },
          { provide: TrainingDataService, useValue: mockTrainingDataService }
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
          allowForwardTranslationNmtDrafting: createTestFeatureFlag(false),
          updatedLearningRateForServal: createTestFeatureFlag(true)
        }
      );
      mockDialogService = jasmine.createSpyObj<DialogService>(['openGenericDialog']);
      mockI18nService = jasmine.createSpyObj<I18nService>(
        ['getLanguageDisplayName', 'translate', 'interpolate', 'localizeBook'],
        {
          locale$: of(locale)
        }
      );
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
      mockPreTranslationSignupUrlService = jasmine.createSpyObj<PreTranslationSignupUrlService>(['generateSignupUrl']);

      mockI18nService.getLanguageDisplayName.and.returnValue('English');
      mockPreTranslationSignupUrlService.generateSignupUrl.and.returnValue(Promise.resolve(''));
      mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(this.startedOrActiveBuild$);
      mockDraftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.pollBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.getLastCompletedBuild.and.returnValue(of(buildDto));
      mockDraftGenerationService.getGeneratedDraftUsfm.and.returnValue(of('\\id Test USFM \\c 1 \\v 1 Test'));
      mockDraftSourcesService = jasmine.createSpyObj<DraftSourcesService>(['getDraftProjectSources']);
      mockDraftSourcesService.getDraftProjectSources.and.returnValue(of({}));
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

    get draftingRateNotice(): HTMLElement | null {
      return this.getElementByTestId('drafting-rate-notice');
    }

    get offlineTextElement(): HTMLElement | null {
      return (this.fixture.nativeElement as HTMLElement).querySelector('.offline-text');
    }

    get preGenerationStepper(): HTMLElement | null {
      return (this.fixture.nativeElement as HTMLElement).querySelector('app-draft-generation-steps');
    }

    get warningSourceTargetSame(): HTMLElement | null {
      return this.getElementByTestId('warning-source-target-same');
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
      let env = new TestEnvironment();

      expect(env.component.draftJob).toEqual(buildDto);
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(mockDraftGenerationService.pollBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(true);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(true);
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
      let env = new TestEnvironment(() => {
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

    it('should detect source language same as target language', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'xyz'
          },
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              alternateTrainingSourceEnabled: false
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'xyz'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(false);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(true);
      expect(env.component.isPreTranslationApproved).toBe(true);
      expect(env.warningSourceTargetSame).not.toBeNull();
    }));

    it('should show draft speed notice if back translation or pre-translate approved', fakeAsync(() => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = true;
      env.component.isPreTranslationApproved = false;
      env.fixture.detectChanges();
      tick();

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isPreTranslationApproved).toBe(false);
      expect(env.draftingRateNotice).not.toBeNull();

      env.component.isBackTranslation = false;
      env.component.isPreTranslationApproved = true;
      env.fixture.detectChanges();
      tick();

      expect(env.component.isBackTranslation).toBe(false);
      expect(env.component.isPreTranslationApproved).toBe(true);
      expect(env.draftingRateNotice).not.toBeNull();
    }));

    it('should not show drafting speed notice if not back translation nor pre-translate approved.', fakeAsync(() => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isPreTranslationApproved = false;
      env.fixture.detectChanges();
      tick();

      expect(env.draftingRateNotice).toBeNull();
    }));

    it('should detect alternate training source language when different to alternate source language', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'abc'
          },
          translateConfig: {
            draftConfig: {
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: {
                projectRef: 'alternateTrainingSourceProjectId',
                writingSystem: {
                  tag: 'def'
                }
              },
              alternateSourceEnabled: true,
              alternateSource: {
                projectRef: 'alternateSourceProjectId',
                writingSystem: {
                  tag: 'ghi'
                }
              }
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'def'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(false);
    }));

    it('should detect alternate training source language when different to source language', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'abc'
          },
          translateConfig: {
            draftConfig: {
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: {
                projectRef: 'alternateTrainingSourceProjectId',
                writingSystem: {
                  tag: 'def'
                }
              }
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'xyz'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(false);
    }));

    it('should not detect alternate training source language as different when enabled but null', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'abc'
          },
          translateConfig: {
            draftConfig: {
              alternateTrainingSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'xyz'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(true);
    }));

    it('should detect additional training source language when different to alternate training source language', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'abc'
          },
          translateConfig: {
            draftConfig: {
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: {
                projectRef: 'alternateTrainingSourceProjectId',
                writingSystem: {
                  tag: 'def'
                }
              },
              additionalTrainingSourceEnabled: true,
              additionalTrainingSource: {
                projectRef: 'additionalTrainingSourceProjectId',
                writingSystem: {
                  tag: 'ghi'
                }
              }
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'def'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(true);
      expect(env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical).toBe(false);
    }));

    it('should detect additional training source language when different to source language', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'abc'
          },
          translateConfig: {
            draftConfig: {
              additionalTrainingSourceEnabled: true,
              additionalTrainingSource: {
                projectRef: 'alternateTrainingSourceProjectId',
                writingSystem: {
                  tag: 'def'
                }
              }
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'xyz'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(true);
      expect(env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical).toBe(false);
    }));

    it('should not detect additional training source language as different when enabled but null', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          writingSystem: {
            tag: 'abc'
          },
          translateConfig: {
            draftConfig: {
              additionalTrainingSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation,
            source: {
              projectRef: 'testSourceProjectId',
              writingSystem: {
                tag: 'xyz'
              }
            }
          }
        })
      } as SFProjectProfileDoc;
      let env = new TestEnvironment(() => {
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

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageSupported).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.isSourceAndTrainingSourceLanguageIdentical).toBe(true);
    }));
  });

  describe('Online status', () => {
    it('should display offline message when offline', () => {
      let env = new TestEnvironment();
      env.testOnlineStatusService.setIsOnline(false);
      env.fixture.detectChanges();
      expect(env.offlineTextElement).not.toBeNull();

      env.component.currentPage = 'steps';
      env.fixture.detectChanges();
      expect(env.offlineTextElement).not.toBeNull();
    });

    it('should not display offline message when online', () => {
      let env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.offlineTextElement).toBeNull();

      env.component.currentPage = 'steps';
      env.fixture.detectChanges();
      expect(env.offlineTextElement).toBeNull();
    });
  });

  describe('warnings', () => {
    it('should not show any warnings if not a back translation nor pre-translate approved', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
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
      env.component.isSourceAndTargetDifferent = false;
      env.fixture.detectChanges();
      expect(env.warningSourceTargetSame).toBeNull();

      // source and alternate training source language are different
      env.component.isSourceAndTargetDifferent = true;
      env.component.isSourceAndTrainingSourceLanguageIdentical = false;
      env.fixture.detectChanges();
      expect(env.getElementByTestId('warning-source-training-different')).toBeNull();

      // source and additional training source language are different
      env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
      env.fixture.detectChanges();
      expect(env.getElementByTestId('warning-mix-source-different')).toBeNull();
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
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).toBeNull();
      });

      it('should not show warning when source text is not missing', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-text-missing')).toBeNull();
      });
    });

    describe('source and target text must be different', () => {
      it('should show warning with settings page link when source text is not missing AND source and target are same AND target language is supported, user is Paratext Admin', () => {
        const env = new TestEnvironment(() => TestEnvironment.initProject('user01'));
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.component.isProjectAdmin).toEqual(true);
        expect(env.getElementByTestId('warning-source-target-same')).not.toBeNull();
        expect(env.getElementByKey('draft_generation.info_alert_same_source_and_target_language')).not.toBeNull();
        expect(env.getElementByKey('draft_generation.non_pa_info_alert_same_source_and_target_language')).toBeNull();
      });

      it('should show warning to contact Paratext Admin when source text is not missing AND source and target are same AND target language is supported, user is Translator', () => {
        const env = new TestEnvironment(() => TestEnvironment.initProject('user02'));
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.component.isProjectAdmin).toEqual(false);
        expect(env.getElementByTestId('warning-source-target-same')).not.toBeNull();
        expect(env.getElementByKey('draft_generation.info_alert_same_source_and_target_language')).toBeNull();
        expect(env.getElementByKey('draft_generation.non_pa_info_alert_same_source_and_target_language')).not.toBe(
          null
        );
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-target-same')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-target-same')).toBeNull();
      });

      it('should not show warning when source and target text are different', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-target-same')).toBeNull();
      });
    });

    describe('source and alternate training source language must be the same', () => {
      it('should show warning when source and alternate training source are different AND target language is supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-training-different')).not.toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-training-different')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-training-different')).toBeNull();
      });

      it('should not show warning when the source and target language are the same', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-training-different')).toBeNull();
      });

      it('should not show warning when source and alternate training source language are the same', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-training-different')).toBeNull();
      });
    });

    describe('source and additional training source language must be the same', () => {
      it('should show warning with link to settings page when source and additional training source are different AND target language is supported, user is Paratext Admin', () => {
        const env = new TestEnvironment(() => TestEnvironment.initProject('user01'));
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.component.isProjectAdmin).toEqual(true);
        expect(env.getElementByTestId('warning-mix-source-different')).not.toBeNull();
        expect(
          env.getElementByKey('draft_generation.info_alert_different_additional_training_and_source_language')
        ).not.toBeNull();
        expect(
          env.getElementByKey('draft_generation.non_pa_info_alert_different_additional_training_and_source_language')
        ).toBeNull();
      });

      it('should show warning to contact Paratext Admin when source and additional training source are different AND target language is supported, user is Translator', () => {
        const env = new TestEnvironment(() => TestEnvironment.initProject('user02'));
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.component.isProjectAdmin).toEqual(false);
        expect(env.getElementByTestId('warning-mix-source-different')).not.toBeNull();
        expect(
          env.getElementByKey('draft_generation.info_alert_different_additional_training_and_source_language')
        ).toBeNull();
        expect(
          env.getElementByKey('draft_generation.non_pa_info_alert_different_additional_training_and_source_language')
        ).not.toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-different')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-different')).toBeNull();
      });

      it('should not show warning when the source and target language are the same', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-different')).toBeNull();
      });

      it('should not show warning when source and additional training source language are the same', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-different')).toBeNull();
      });

      it('should not show warning when source and alternate training source are different', () => {
        let env = new TestEnvironment();
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-different')).toBeNull();
      });
    });

    describe('user must have access to source project', () => {
      it('should show warning when no access to source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                name: 'source',
                shortName: 'SRC',
                texts: [],
                writingSystem: {
                  tag: 'es'
                },
                noAccess: true
              }
            })
          );
        });
        env.component.isPreTranslationApproved = true;
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        expect(env.getElementByTestId('warning-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to source project if project is not back translation nor pre-translate approved', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                name: 'source',
                shortName: 'SRC',
                texts: [],
                writingSystem: {
                  tag: 'es'
                },
                noAccess: true
              }
            })
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
              updatedLearningRateForServal: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when the source and target language are the same', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when source and alternate training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when source and additional training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });

      it('should not show warning when access to source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: false
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-source-no-access')).toBeNull();
      });
    });

    describe('user must have access to alternate source project', () => {
      it('should show warning when no access to alternate source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isPreTranslationApproved = true;
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to alternate source project and not back translation nor pre-translate approved', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
              updatedLearningRateForServal: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when the source and target language are the same', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when source and alternate training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when source and additional training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource,
              alternateSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-source-no-access')).toBeNull();
      });

      it('should not show warning when access to alternate source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: false
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-training-source-no-access')).toBeNull();
      });
    });

    describe('user must have access to alternate training source project', () => {
      it('should show warning when no access to alternate source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to alternate source project and not back translation nor pre-translate approved', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
              updatedLearningRateForServal: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when the source and target language are the same', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when source and alternate training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when source and additional training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource,
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to alternate source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource,
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });

      it('should not show warning when access to alternate training source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: false
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-alternate-training-source-no-access')).toBeNull();
      });
    });

    describe('user must have access to additional training source project', () => {
      it('should show warning when no access to additional training source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).not.toBeNull();
      });

      it('should not show warning when no access to additional training source project and not back translation nor pre-translate approved', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
          mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
            'FeatureFlagService',
            {},
            {
              allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
              updatedLearningRateForServal: createTestFeatureFlag(true)
            }
          );
        });
        env.component.isBackTranslation = false;
        env.component.isPreTranslationApproved = false;
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when target language is not supported', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = false;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when source project is not set', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = false;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when the source and target language are the same', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = false;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when source and alternate training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = false;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when source and additional training source language are different', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = false;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              source: {
                noAccess: true
              } as DraftSource,
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to alternate source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateSource: {
                noAccess: true
              } as DraftSource,
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when no access to alternate training source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              alternateTrainingSource: {
                noAccess: true
              } as DraftSource,
              additionalTrainingSource: {
                noAccess: true
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
        env.component.isTargetLanguageSupported = true;
        env.fixture.detectChanges();
        expect(env.getElementByTestId('warning-mix-source-no-access')).toBeNull();
      });

      it('should not show warning when access to additional training source project', () => {
        let env = new TestEnvironment(() => {
          mockDraftSourcesService.getDraftProjectSources.and.returnValue(
            of({
              additionalTrainingSource: {
                noAccess: false
              } as DraftSource
            })
          );
        });
        env.component.isSourceProjectSet = true;
        env.component.isSourceAndAdditionalTrainingSourceLanguageIdentical = true;
        env.component.isSourceAndTargetDifferent = true;
        env.component.isSourceAndTrainingSourceLanguageIdentical = true;
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
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isSourceAndTargetDifferent = false;
      env.component.isPreTranslationApproved = false;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(false);
      expect(env.getElementByTestId('approval-needed')).not.toBeNull();
    });

    it('should not show "approval needed" info alert when isPreTranslationApproved is true', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = false;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isSourceAndTargetDifferent = false;
      env.component.isPreTranslationApproved = true;
      env.fixture.detectChanges();
      expect(env.component.isBackTranslationMode).toBe(false);
      expect(env.getElementByTestId('approval-needed')).toBeNull();
    });

    it('should not show "approval needed" info alert when project is in back translation mode', () => {
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
          }
        );
      });
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      env.component.isSourceAndTargetDifferent = false;
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
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
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
      let env = new TestEnvironment(() => {
        mockFeatureFlagService = jasmine.createSpyObj<FeatureFlagService>(
          'FeatureFlagService',
          {},
          {
            allowForwardTranslationNmtDrafting: createTestFeatureFlag(true),
            updatedLearningRateForServal: createTestFeatureFlag(true)
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

  fdescribe('currentPage', () => {
    it('should navigate to pre-generate steps', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile()
      } as SFProjectProfileDoc;

      let env = new TestEnvironment(() => {
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
      let env = new TestEnvironment();

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
      let env = new TestEnvironment();

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
      let env = new TestEnvironment();

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
      let env = new TestEnvironment();

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
      let env = new TestEnvironment();

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

    it('should display the Paratext credentials update prompt when startBuild throws a forbidden error', fakeAsync(() => {
      let env = new TestEnvironment(() => {
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
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith(projectId);
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

  describe('isDraftFaulted', () => {
    it('should return true if the draft build is faulted', () => {
      let env = new TestEnvironment();
      env.component.draftJob = { ...buildDto, state: BuildStates.Faulted };
      env.fixture.detectChanges();
      expect(env.component.isDraftFaulted({ state: BuildStates.Faulted } as BuildDto)).toBe(true);
      expect(env.getElementByTestId('warning-generation-failed')).not.toBeNull();
      expect(env.getElementByTestId('technical-details')).not.toBeNull();
    });

    it('should return false if the draft build is not faulted', () => {
      let env = new TestEnvironment();
      expect(env.component.isDraftFaulted({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(env.component.isDraftFaulted({ state: BuildStates.Queued } as BuildDto)).toBe(false);
      expect(env.getElementByTestId('warning-generation-failed')).toBeNull();
      expect(env.getElementByTestId('technical-details')).toBeNull();
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

    it('button should not display if there is no completed build while a build is faulter', () => {
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
