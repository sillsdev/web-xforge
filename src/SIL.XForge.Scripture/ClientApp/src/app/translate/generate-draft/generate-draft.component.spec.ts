import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { BuildStates } from 'src/app/machine-api/build-states';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { DraftGenerationService } from './draft-generation.service';
import { GenerateDraftComponent } from './generate-draft.component';

describe('GenerateDraftComponent', () => {
  let component: GenerateDraftComponent;
  let matDialog: jasmine.SpyObj<MatDialog>;
  let dialogService: jasmine.SpyObj<DialogService>;
  let draftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let activatedProjectService: jasmine.SpyObj<ActivatedProjectService>;

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
    matDialog = jasmine.createSpyObj('MatDialog', ['cancelAll']);
    dialogService = jasmine.createSpyObj('DialogService', ['confirm']);
    draftGenerationService = jasmine.createSpyObj('DraftGenerationService', [
      'startBuild',
      'cancelBuild',
      'getBuildProgress'
    ]);
    activatedProjectService = jasmine.createSpyObj('ActivatedProjectService', [''], { projectId: 'testProjectId' });
    component = new GenerateDraftComponent(matDialog, dialogService, activatedProjectService, draftGenerationService, [
      BuildStates.Active,
      BuildStates.Pending,
      BuildStates.Queued
    ]);
  });

  describe('ngOnInit', () => {
    it('should subscribe to build progress', () => {
      draftGenerationService.getBuildProgress.and.returnValue(of(buildDto));
      component.ngOnInit();
      expect(draftGenerationService.getBuildProgress).toHaveBeenCalledWith(activatedProjectService.projectId!);
      expect(component.draftJob).toEqual(buildDto);
    });
  });

  describe('generateDraft', () => {
    it('should start the draft build', () => {
      component.generateDraft();
      expect(draftGenerationService.startBuild).toHaveBeenCalledWith('testProjectId');
    });
  });

  describe('cancel', () => {
    it('should cancel the draft build if user confirms "cancel" dialog', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Active };
      component.draftJob = job;
      dialogService.confirm.and.returnValue(Promise.resolve(true));
      await component.cancel();
      expect(dialogService.confirm).toHaveBeenCalled();
      expect(draftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
    });
    it('should not cancel the draft build if user exits "cancel" dialog', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Active };
      component.draftJob = job;
      dialogService.confirm.and.returnValue(Promise.resolve(false));
      await component.cancel();
      expect(dialogService.confirm).toHaveBeenCalled();
      expect(draftGenerationService.cancelBuild).not.toHaveBeenCalled();
    });
    it('should cancel the draft build without dialog if the build state is not active', async () => {
      const job: BuildDto = { ...buildDto, state: BuildStates.Queued };
      component.draftJob = job;
      await component.cancel();
      expect(dialogService.confirm).not.toHaveBeenCalled();
      expect(draftGenerationService.cancelBuild).toHaveBeenCalledWith('testProjectId');
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
