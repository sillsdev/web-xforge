import { ComponentFixture, TestBed, flush, tick, fakeAsync } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { EMPTY, of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { BuildStates } from 'src/app/machine-api/build-states';
import { SharedModule } from 'src/app/shared/shared.module';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ACTIVE_BUILD_STATES } from './draft-generation';
import { DraftGenerationComponent, InfoAlert } from './draft-generation.component';
import { DraftGenerationService } from './draft-generation.service';

describe('DraftGenerationComponent', () => {
  let mockMatDialog: jasmine.SpyObj<MatDialog>;
  let mockDialogService: jasmine.SpyObj<DialogService>;
  let mockDraftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let mockActivatedProjectService: jasmine.SpyObj<ActivatedProjectService>;
  let mockI18nService: jasmine.SpyObj<I18nService>;

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
    state: BuildStates.Queued
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
    component!: DraftGenerationComponent;
    fixture!: ComponentFixture<DraftGenerationComponent>;

    constructor(preInit?: () => void) {
      this.setup();

      if (preInit) {
        preInit();
      }

      this.init();
    }

    // Default setup
    setup(): void {
      mockMatDialog = jasmine.createSpyObj('MatDialog', ['closeAll']);
      mockDialogService = jasmine.createSpyObj('DialogService', ['openGenericDialog']);
      mockI18nService = jasmine.createSpyObj('I18nService', [''], { locale$: of(locale) });
      mockDraftGenerationService = jasmine.createSpyObj('DraftGenerationService', [
        'startBuild',
        'cancelBuild',
        'getBuildProgress',
        'pollBuildProgress',
        'getLastCompletedBuild'
      ]);
      mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
        projectId: 'testProjectId',
        projectId$: of('testProjectId'),
        projectDoc$: of({
          data: {
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
          }
        })
      });

      mockDraftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.pollBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.getLastCompletedBuild.and.returnValue(of(buildDto));
    }

    init(): void {
      TestBed.configureTestingModule({
        declarations: [DraftGenerationComponent],
        imports: [UICommonModule, SharedModule],
        providers: [
          { provide: DraftGenerationService, useValue: mockDraftGenerationService },
          { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
          { provide: MatDialog, useValue: mockMatDialog },
          { provide: DialogService, useValue: mockDialogService },
          { provide: I18nService, useValue: mockI18nService },
          { provide: ACTIVE_BUILD_STATES, useValue: [BuildStates.Active, BuildStates.Pending, BuildStates.Queued] }
        ]
      });

      this.fixture = TestBed.createComponent(DraftGenerationComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }
  }

  describe('ngOnInit', () => {
    it('should subscribe to build progress', () => {
      let env = new TestEnvironment();

      expect(env.component.draftJob).toEqual(buildDto);
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(mockDraftGenerationService.pollBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(mockDraftGenerationService.getLastCompletedBuild).toHaveBeenCalledWith(
        mockActivatedProjectService.projectId!
      );
      expect(env.component.draftViewerUrl).toEqual('/projects/testProjectId/draft-preview');
      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageNllb).toBe(true);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(true);
      expect(env.component.targetLanguage).toBe('en');
      expect(env.component.targetLanguageDisplayName).toBe('English');
    });

    it('should detect project requirements', () => {
      let env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: 'testProjectId',
          projectId$: of('testProjectId'),
          projectDoc$: of({
            data: {
              writingSystem: {
                tag: 'xyz'
              },
              translateConfig: {
                projectType: ProjectType.Standard
              }
            }
          })
        });
      });

      expect(env.component.isBackTranslation).toBe(false);
      expect(env.component.isTargetLanguageNllb).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(false);
    });

    it('should detect source language same as target language', () => {
      let env = new TestEnvironment(() => {
        mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
          projectId: 'testProjectId',
          projectId$: of('testProjectId'),
          projectDoc$: of({
            data: {
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
            }
          })
        });
      });

      expect(env.component.isBackTranslation).toBe(true);
      expect(env.component.isTargetLanguageNllb).toBe(false);
      expect(env.component.isSourceProjectSet).toBe(true);
      expect(env.component.isSourceAndTargetDifferent).toBe(false);
    });
  });

  describe('getInfoAlert', () => {
    let env: TestEnvironment;

    beforeAll(() => {
      env = new TestEnvironment();
    });

    it('should return NotBackTranslation when isBackTranslation is false', () => {
      env.component.isBackTranslation = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.NotBackTranslation);
    });

    it('should return NotNllb when isTargetLanguageNllb is false', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageNllb = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.NotNllb);
    });

    it('should return NotSourceProjectSet when isSourceProjectSet is false', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageNllb = true;
      env.component.isSourceProjectSet = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.NotSourceProjectSet);
    });

    it('should return NotSourceAndTargetLanguageDifferent when isSourceAndTargetDifferent is false', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageNllb = true;
      env.component.isSourceProjectSet = true;
      env.component.isSourceAndTargetDifferent = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.NotSourceAndTargetLanguageDifferent);
    });

    it('should return None when all requirements are met', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageNllb = true;
      env.component.isSourceProjectSet = true;
      env.component.isSourceAndTargetDifferent = true;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.None);
    });
  });

  describe('generateDraft', () => {
    it('should start the draft build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuild.and.returnValue(of(buildDto));
      });

      env.component.generateDraft();
      expect(mockDraftGenerationService.startBuild).toHaveBeenCalledWith('testProjectId');
    });

    it('should not attempt MatDialog.closeAll() for queued build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuild.and.returnValue(of(buildDto));
      });

      env.component.generateDraft();
      expect(mockMatDialog.closeAll).not.toHaveBeenCalled();
    });

    it('should attempt MatDialog.closeAll() for cancelled build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuild.and.returnValue(of({ ...buildDto, state: BuildStates.Canceled }));
      });

      env.component.generateDraft();
      expect(mockDraftGenerationService.startBuild).toHaveBeenCalledWith('testProjectId');
      expect(mockMatDialog.closeAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('should cancel the draft build if user confirms "cancel" dialog', async () => {
      let env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue(Promise.resolve(true));
        mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      });

      env.component.draftJob = { ...buildDto, state: BuildStates.Active };
      await env.component.cancel();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalledTimes(1);
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });

    it('should not cancel the draft build if user exits "cancel" dialog', async () => {
      let env = new TestEnvironment(() => {
        mockDialogService.openGenericDialog.and.returnValue(Promise.resolve(false));
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
      expect(mockDialogService.openGenericDialog).not.toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });
  });

  describe('getLanguageDisplayName', () => {
    it('should return the display name for a valid language code', () => {
      let env = new TestEnvironment();
      expect(env.component.getLanguageDisplayName('en', locale)).toBe('English');
    });

    it('should return undefined for an undefined language code', () => {
      let env = new TestEnvironment();
      expect(env.component.getLanguageDisplayName(undefined, locale)).toBeUndefined();
    });

    it('should return language code for an unknown language code', () => {
      let env = new TestEnvironment();
      expect(env.component.getLanguageDisplayName('xyz', locale)).toBe('xyz');
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
