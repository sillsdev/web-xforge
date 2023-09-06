import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { EMPTY, of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { BuildStates } from 'src/app/machine-api/build-states';
import { SharedModule } from 'src/app/shared/shared.module';
import { instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { DraftGenerationComponent, InfoAlert } from './draft-generation.component';
import { DraftGenerationService } from './draft-generation.service';

describe('DraftGenerationComponent', () => {
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
      mockDialogService = jasmine.createSpyObj<DialogService>(['openGenericDialog']);
      mockI18nService = jasmine.createSpyObj<I18nService>(['getLanguageDisplayName'], { locale$: of(locale) });
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
        } as SFProjectProfileDoc)
      });

      mockI18nService.getLanguageDisplayName.and.returnValue('English');
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
          { provide: DialogService, useValue: mockDialogService },
          { provide: I18nService, useValue: mockI18nService }
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
      expect(env.component.isTargetLanguageSupported).toBe(false);
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
      expect(env.component.isTargetLanguageSupported).toBe(false);
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

    it('should return NotSupportedLanguage when isTargetLanguageSupported is false', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.NotSupportedLanguage);
    });

    it('should return NoSourceProjectSet when isSourceProjectSet is false', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.NoSourceProjectSet);
    });

    it('should return SourceAndTargetLanguageIdentical when isSourceAndTargetDifferent is false', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = true;
      env.component.isSourceAndTargetDifferent = false;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.SourceAndTargetLanguageIdentical);
    });

    it('should return None when all requirements are met', () => {
      env.component.isBackTranslation = true;
      env.component.isTargetLanguageSupported = true;
      env.component.isSourceProjectSet = true;
      env.component.isSourceAndTargetDifferent = true;
      expect(env.component.getInfoAlert()).toBe(InfoAlert.None);
    });
  });

  describe('generateDraft', () => {
    it('should start the draft build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(of(buildDto));
      });

      env.component.generateDraft();
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith('testProjectId');
    });

    it('should not attempt "cancel dialog" close for queued build', () => {
      let env = new TestEnvironment(() => {
        mockDraftGenerationService.startBuildOrGetActiveBuild.and.returnValue(
          of({ ...buildDto, state: BuildStates.Queued })
        );
      });

      const mockDialogRef: MatDialogRef<any> = mock(MatDialogRef);
      env.component.cancelDialogRef = instance(mockDialogRef);

      env.component.generateDraft();
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

      env.component.generateDraft();
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

      env.component.generateDraft();
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

      env.component.generateDraft();
      expect(mockDraftGenerationService.startBuildOrGetActiveBuild).toHaveBeenCalledWith('testProjectId');
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
      expect(mockDraftGenerationService.getLastCompletedBuild).toHaveBeenCalledWith(
        mockActivatedProjectService.projectId!
      );
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
      expect(mockDraftGenerationService.getLastCompletedBuild).toHaveBeenCalledWith(
        mockActivatedProjectService.projectId!
      );
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
