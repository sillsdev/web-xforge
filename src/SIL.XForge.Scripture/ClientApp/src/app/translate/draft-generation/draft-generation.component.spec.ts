import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { EMPTY, of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { BuildStates } from 'src/app/machine-api/build-states';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UICommonModule } from '../../../xforge-common/ui-common.module';
import { ACTIVE_BUILD_STATES } from './draft-generation';
import { DraftGenerationComponent } from './draft-generation.component';
import { DraftGenerationService } from './draft-generation.service';

describe('DraftGenerationComponent', () => {
  let component: DraftGenerationComponent;
  let fixture: ComponentFixture<DraftGenerationComponent>;
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

  beforeEach(() => {
    mockMatDialog = jasmine.createSpyObj('MatDialog', ['closeAll']);
    mockDialogService = jasmine.createSpyObj('DialogService', ['openGenericDialog']);
    mockI18nService = jasmine.createSpyObj('I18nService', [''], { locale$: of(locale) });
    mockDraftGenerationService = jasmine.createSpyObj('DraftGenerationService', [
      'startBuild',
      'cancelBuild',
      'getBuildProgress',
      'pollBuildProgress'
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
            projectType: ProjectType.BackTranslation
          }
        }
      })
    });

    TestBed.configureTestingModule({
      declarations: [DraftGenerationComponent],
      imports: [UICommonModule],
      providers: [
        { provide: DraftGenerationService, useValue: mockDraftGenerationService },
        { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
        { provide: MatDialog, useValue: mockMatDialog },
        { provide: DialogService, useValue: mockDialogService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: ACTIVE_BUILD_STATES, useValue: [BuildStates.Active, BuildStates.Pending, BuildStates.Queued] }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftGenerationComponent);
    component = fixture.componentInstance;
  });

  describe('ngOnInit', () => {
    it('should subscribe to build progress', () => {
      mockDraftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      mockDraftGenerationService.pollBuildProgress.and.returnValue(of(buildDto));
      component.ngOnInit();
      component.draftJob$?.subscribe(job => {
        expect(job).toEqual(buildDto);
        expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(
          mockActivatedProjectService.projectId!
        );
        expect(mockDraftGenerationService.pollBuildProgress).toHaveBeenCalledWith(
          mockActivatedProjectService.projectId!
        );
        expect(component.draftViewerUrl).toEqual('/projects/testProjectId/draft-preview');
        expect(component.isBackTranslation).toBe(true);
        expect(component.isTargetLanguageNllb).toBe(true);
        expect(component.targetLanguage).toBe('en');
        expect(component.targetLanguageDisplayName).toBe('English');
      });
    });
  });

  describe('generateDraft', () => {
    it('should start the draft build', () => {
      mockDraftGenerationService.startBuild.and.returnValue(of(buildDto));
      component.generateDraft();
      expect(mockDraftGenerationService.startBuild).toHaveBeenCalledWith('testProjectId');
    });

    it('should not attempt MatDialog.closeAll() for queued build', () => {
      mockDraftGenerationService.startBuild.and.returnValue(of(buildDto));
      component.generateDraft();
      component.draftJob$?.subscribe(() => {
        expect(mockMatDialog.closeAll).not.toHaveBeenCalled();
      });
    });

    it('should attempt MatDialog.closeAll() for cancelled build', () => {
      mockDraftGenerationService.startBuild.and.returnValue(of({ ...buildDto, state: BuildStates.Canceled }));
      component.generateDraft();
      component.draftJob$?.subscribe(() => {
        expect(mockDraftGenerationService.startBuild).toHaveBeenCalledWith('testProjectId');
        expect(mockMatDialog.closeAll).toHaveBeenCalled();
      });
    });
  });

  describe('cancel', () => {
    it('should cancel the draft build if user confirms "cancel" dialog', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Active };
      component['job'] = job;
      component.draftJob$ = of(job);
      mockDialogService.openGenericDialog.and.returnValue(Promise.resolve(true));
      mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      await component.cancel();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });
    it('should not cancel the draft build if user exits "cancel" dialog', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Active };
      component['job'] = job;
      component.draftJob$ = of(job);
      mockDialogService.openGenericDialog.and.returnValue(Promise.resolve(false));
      mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      await component.cancel();
      expect(mockDialogService.openGenericDialog).toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).not.toHaveBeenCalled();
    });
    it('should cancel the draft build without dialog if the build state is not active', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Queued };
      component['job'] = job;
      component.draftJob$ = of(job);
      mockDraftGenerationService.cancelBuild.and.returnValue(EMPTY);
      await component.cancel();
      expect(mockDialogService.openGenericDialog).not.toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });
  });

  describe('getLanguageDisplayName', () => {
    it('should return the display name for a valid language code', () => {
      expect(component.getLanguageDisplayName('en', locale)).toBe('English');
    });
    it('should return undefined for an undefined language code', () => {
      expect(component.getLanguageDisplayName(undefined, locale)).toBeUndefined();
    });
    it('should return language code for an unknown language code', () => {
      expect(component.getLanguageDisplayName('xyz', locale)).toBe('xyz');
    });
  });

  describe('isDraftInProgress', () => {
    it('should return true if the draft build is in progress', () => {
      expect(component.isDraftInProgress({ state: BuildStates.Active } as BuildDto)).toBe(true);
      expect(component.isDraftInProgress({ state: BuildStates.Pending } as BuildDto)).toBe(true);
      expect(component.isDraftInProgress({ state: BuildStates.Queued } as BuildDto)).toBe(true);
    });
    it('should return false if the draft build is not in progress', () => {
      expect(component.isDraftInProgress({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(component.isDraftInProgress({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(component.isDraftInProgress({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftQueued', () => {
    it('should return true if the draft build is queued', () => {
      expect(component.isDraftQueued({ state: BuildStates.Queued } as BuildDto)).toBe(true);
      expect(component.isDraftQueued({ state: BuildStates.Pending } as BuildDto)).toBe(true);
    });
    it('should return false if the draft build is not queued', () => {
      expect(component.isDraftQueued({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(component.isDraftQueued({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(component.isDraftQueued({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(component.isDraftQueued({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftActive', () => {
    it('should return true if the draft build is active', () => {
      expect(component.isDraftActive({ state: BuildStates.Active } as BuildDto)).toBe(true);
    });
    it('should return false if the draft build is not active', () => {
      expect(component.isDraftActive({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(component.isDraftActive({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(component.isDraftActive({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(component.isDraftActive({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(component.isDraftActive({ state: BuildStates.Queued } as BuildDto)).toBe(false);
    });
  });

  describe('isDraftComplete', () => {
    it('should return true if the draft build is complete', () => {
      expect(component.isDraftComplete({ state: BuildStates.Completed } as BuildDto)).toBe(true);
    });
    it('should return false if the draft build is not complete', () => {
      expect(component.isDraftComplete({ state: BuildStates.Active } as BuildDto)).toBe(false);
      expect(component.isDraftComplete({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(component.isDraftComplete({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
      expect(component.isDraftComplete({ state: BuildStates.Pending } as BuildDto)).toBe(false);
      expect(component.isDraftComplete({ state: BuildStates.Queued } as BuildDto)).toBe(false);
    });
  });

  describe('canCancel', () => {
    it('should return true if the draft build is in progress', () => {
      expect(component.isDraftInProgress({ state: BuildStates.Active } as BuildDto)).toBe(true);
      expect(component.isDraftInProgress({ state: BuildStates.Pending } as BuildDto)).toBe(true);
      expect(component.isDraftInProgress({ state: BuildStates.Queued } as BuildDto)).toBe(true);
    });
    it('should return false if the draft build is not in progress', () => {
      expect(component.isDraftInProgress({ state: BuildStates.Completed } as BuildDto)).toBe(false);
      expect(component.isDraftInProgress({ state: BuildStates.Canceled } as BuildDto)).toBe(false);
      expect(component.isDraftInProgress({ state: BuildStates.Faulted } as BuildDto)).toBe(false);
    });
  });
});
