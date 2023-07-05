import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { BuildStates } from 'src/app/machine-api/build-states';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
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

  beforeEach(() => {
    mockMatDialog = jasmine.createSpyObj('MatDialog', ['cancelAll']);
    mockDialogService = jasmine.createSpyObj('DialogService', ['confirm']);
    mockDraftGenerationService = jasmine.createSpyObj('DraftGenerationService', [
      'startBuild',
      'cancelBuild',
      'getBuildProgress'
    ]);
    mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], {
      projectId: 'testProjectId',
      projectDoc$: of({
        data: {
          writingSystem: {
            tag: 'en'
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
        { provide: ACTIVE_BUILD_STATES, useValue: [BuildStates.Active, BuildStates.Pending, BuildStates.Queued] }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftGenerationComponent);
    component = fixture.componentInstance;
  });

  describe('ngOnInit', () => {
    it('should subscribe to build progress', () => {
      mockDraftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      component.ngOnInit();
      expect(mockDraftGenerationService.getBuildProgress).toHaveBeenCalledWith(mockActivatedProjectService.projectId!);
      expect(component.draftJob).toEqual(buildDto);
      expect(component.draftViewerUrl).toEqual('/projects/testProjectId/draft-preview');
      expect(component.isTargetLanguageNllb).toBe(true);
    });
  });

  describe('generateDraft', () => {
    it('should start the draft build', () => {
      component.generateDraft();
      expect(mockDraftGenerationService.startBuild).toHaveBeenCalledWith('testProjectId');
    });
  });

  describe('cancel', () => {
    it('should cancel the draft build if user confirms "cancel" dialog', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Active };
      component.draftJob = job;
      mockDialogService.confirm.and.returnValue(Promise.resolve(true));
      await component.cancel();
      expect(mockDialogService.confirm).toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });
    it('should not cancel the draft build if user exits "cancel" dialog', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Active };
      component.draftJob = job;
      mockDialogService.confirm.and.returnValue(Promise.resolve(false));
      await component.cancel();
      expect(mockDialogService.confirm).toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).not.toHaveBeenCalled();
    });
    it('should cancel the draft build without dialog if the build state is not active', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Queued };
      component.draftJob = job;
      await component.cancel();
      expect(mockDialogService.confirm).not.toHaveBeenCalled();
      expect(mockDraftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });
  });

  describe('isDraftInProgress', () => {
    it('should return true if the draft build is in progress', () => {
      component.draftJob = { state: BuildStates.Active } as BuildDto;
      expect(component.isDraftInProgress()).toBe(true);
      component.draftJob = { state: BuildStates.Pending } as BuildDto;
      expect(component.isDraftInProgress()).toBe(true);
      component.draftJob = { state: BuildStates.Queued } as BuildDto;
      expect(component.isDraftInProgress()).toBe(true);
    });
    it('should return false if the draft build is not in progress', () => {
      component.draftJob = { state: BuildStates.Completed } as BuildDto;
      expect(component.isDraftInProgress()).toBe(false);
      component.draftJob = { state: BuildStates.Canceled } as BuildDto;
      expect(component.isDraftInProgress()).toBe(false);
      component.draftJob = { state: BuildStates.Faulted } as BuildDto;
      expect(component.isDraftInProgress()).toBe(false);
    });
  });

  describe('isDraftQueued', () => {
    it('should return true if the draft build is queued', () => {
      component.draftJob = { state: BuildStates.Queued } as BuildDto;
      expect(component.isDraftQueued()).toBe(true);
      component.draftJob = { state: BuildStates.Pending } as BuildDto;
      expect(component.isDraftQueued()).toBe(true);
    });
    it('should return false if the draft build is not queued', () => {
      component.draftJob = { state: BuildStates.Active } as BuildDto;
      expect(component.isDraftQueued()).toBe(false);
      component.draftJob = { state: BuildStates.Canceled } as BuildDto;
      expect(component.isDraftQueued()).toBe(false);
      component.draftJob = { state: BuildStates.Completed } as BuildDto;
      expect(component.isDraftQueued()).toBe(false);
      component.draftJob = { state: BuildStates.Faulted } as BuildDto;
      expect(component.isDraftQueued()).toBe(false);
    });
  });

  describe('isDraftActive', () => {
    it('should return true if the draft build is active', () => {
      component.draftJob = { state: BuildStates.Active } as BuildDto;
      expect(component.isDraftActive()).toBe(true);
    });
    it('should return false if the draft build is not active', () => {
      component.draftJob = { state: BuildStates.Completed } as BuildDto;
      expect(component.isDraftActive()).toBe(false);
      component.draftJob = { state: BuildStates.Canceled } as BuildDto;
      expect(component.isDraftActive()).toBe(false);
      component.draftJob = { state: BuildStates.Faulted } as BuildDto;
      expect(component.isDraftActive()).toBe(false);
      component.draftJob = { state: BuildStates.Pending } as BuildDto;
      expect(component.isDraftActive()).toBe(false);
      component.draftJob = { state: BuildStates.Queued } as BuildDto;
      expect(component.isDraftActive()).toBe(false);
    });
  });

  describe('isDraftComplete', () => {
    it('should return true if the draft build is complete', () => {
      component.draftJob = { state: BuildStates.Completed } as BuildDto;
      expect(component.isDraftComplete()).toBe(true);
    });
    it('should return false if the draft build is not complete', () => {
      component.draftJob = { state: BuildStates.Active } as BuildDto;
      expect(component.isDraftComplete()).toBe(false);
      component.draftJob = { state: BuildStates.Canceled } as BuildDto;
      expect(component.isDraftComplete()).toBe(false);
      component.draftJob = { state: BuildStates.Faulted } as BuildDto;
      expect(component.isDraftComplete()).toBe(false);
      component.draftJob = { state: BuildStates.Pending } as BuildDto;
      expect(component.isDraftComplete()).toBe(false);
      component.draftJob = { state: BuildStates.Queued } as BuildDto;
      expect(component.isDraftComplete()).toBe(false);
    });
  });

  describe('canCancel', () => {
    it('should return true if the draft build is in progress', () => {
      component.draftJob = { state: BuildStates.Active } as BuildDto;
      expect(component.isDraftInProgress()).toBe(true);
      component.draftJob = { state: BuildStates.Pending } as BuildDto;
      expect(component.isDraftInProgress()).toBe(true);
      component.draftJob = { state: BuildStates.Queued } as BuildDto;
      expect(component.isDraftInProgress()).toBe(true);
    });
    it('should return false if the draft build is not in progress', () => {
      component.draftJob = { state: BuildStates.Completed } as BuildDto;
      expect(component.isDraftInProgress()).toBe(false);
      component.draftJob = { state: BuildStates.Canceled } as BuildDto;
      expect(component.isDraftInProgress()).toBe(false);
      component.draftJob = { state: BuildStates.Faulted } as BuildDto;
      expect(component.isDraftInProgress()).toBe(false);
    });
  });
});
