import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { anything, mock, verify, when } from 'ts-mockito';
import { CommandService } from 'xforge-common/command.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { DEFAULT_DRAFTING_ENGINE_AVAILABILITY } from '../translate/draft-generation/drafting-engine/drafting-engine';
import { SFProjectService } from './sf-project.service';

const mockedCommandService = mock(CommandService);
const mockedRealtimeService = mock(RealtimeService);

describe('SFProjectService', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: CommandService, useMock: mockedCommandService },
      { provide: RealtimeService, useMock: mockedRealtimeService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  describe('hasDraft', () => {
    it('should return true if the book is in the drafted scripture range', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'GEN;EXO;LEV', currentScriptureRange: 'MAT;MRK' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, 2, 1);
      expect(actual).toBe(true);
    }));

    it('should return true if the book is in the current scripture range when current build is true', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'MAT;MRK', currentScriptureRange: 'GEN;EXO;LEV' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, 2, undefined, true);
      expect(actual).toBe(true);
    }));

    it('should return true if the drafted scripture range has books', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'GEN;EXO;LEV' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project);
      expect(actual).toBe(true);
    }));

    it('should return true if the current scripture range has books', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { currentScriptureRange: 'GEN;EXO;LEV' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, undefined, undefined, true);
      expect(actual).toBe(true);
    }));

    it('should return false if the book is not in the drafted scripture range', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'MAT;MRK', currentScriptureRange: 'GEN;EXO;LEV' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, 2);
      expect(actual).toBe(false);
    }));

    it('should return true if the book and chapter are in the drafted scripture range', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'GEN;EXO1-4' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, 2, 3);
      expect(actual).toBe(true);
    }));

    it('should return false if the book is but the chapter is not in the drafted scripture range', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'GEN;EXO2-4' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, 2, 1);
      expect(actual).toBe(false);
    }));

    it('should return false if the book is not in the current scripture range when current build is true', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'GEN;EXO;LEV', currentScriptureRange: 'MAT;MRK' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, 2, undefined, true);
      expect(actual).toBe(false);
    }));

    it('should return false if the drafted scripture range does not have books', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { currentScriptureRange: 'GEN;EXO;LEV' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project);
      expect(actual).toBe(false);
    }));

    it('should return false if the current scripture range does not have books', fakeAsync(() => {
      const env = new TestEnvironment();
      const project = {
        translateConfig: { draftConfig: { draftedScriptureRange: 'GEN;EXO;LEV' } }
      } as SFProjectProfile;
      const actual = env.service.hasDraft(project, undefined, undefined, true);
      expect(actual).toBe(false);
    }));
  });

  describe('onlineSetRoleProjectPermissions', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const role = 'role01';
      const permissions = ['permission01'];
      await env.service.onlineSetRoleProjectPermissions(projectId, role, permissions);
      verify(mockedCommandService.onlineInvoke(anything(), 'setRoleProjectPermissions', anything())).once();
      expect().nothing();
    }));
  });

  describe('onlineSetUserProjectPermissions', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const userId = 'user01';
      const permissions = ['permission01'];
      await env.service.onlineSetUserProjectPermissions(projectId, userId, permissions);
      verify(mockedCommandService.onlineInvoke(anything(), 'setUserProjectPermissions', anything())).once();
      expect().nothing();
    }));
  });

  describe('onlineEventMetrics', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const pageIndex = 0;
      const pageSize = 20;
      await env.service.onlineEventMetrics(projectId, pageIndex, pageSize);
      verify(mockedCommandService.onlineInvoke(anything(), 'eventMetrics', anything())).once();
      expect().nothing();
    }));
  });

  describe('onlineApplyPreTranslationToProject', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const jobId: string = 'job01';
      const env = new TestEnvironment();
      when(mockedCommandService.onlineInvoke(anything(), 'applyPreTranslationToProject', anything())).thenResolve(
        jobId
      );
      const projectId = 'project01';
      const scriptureRange = 'GEN-REV';
      const targetProjectId = 'project01';
      const timestamp = new Date();
      const actual = await env.service.onlineApplyPreTranslationToProject(
        projectId,
        scriptureRange,
        targetProjectId,
        timestamp
      );
      verify(mockedCommandService.onlineInvoke(anything(), 'applyPreTranslationToProject', anything())).once();
      expect(actual).toBe(jobId);
    }));

    describe('onlineSetAvailableDraftingEngines', () => {
      it('should invoke the command service', fakeAsync(async () => {
        const env = new TestEnvironment();
        const projectId = 'project01';
        const draftingEngines = [DraftingEngine.Nmt];
        await env.service.onlineSetAvailableDraftingEngines(projectId, draftingEngines);
        verify(mockedCommandService.onlineInvoke(anything(), 'setAvailableDraftingEngines', anything())).once();
        expect().nothing();
      }));
    });

    describe('onlineDraftingEngine', () => {
      it('should invoke the command service', fakeAsync(async () => {
        const env = new TestEnvironment();
        const projectId = 'project01';
        const draftingEngine = DraftingEngine.Llm;
        await env.service.onlineSetDraftingEngine(projectId, draftingEngine);
        verify(mockedCommandService.onlineInvoke(anything(), 'setDraftingEngine', anything())).once();
        expect().nothing();
      }));
    });

    describe('saveDraftingEngineAvailability', () => {
      it('should invoke the command service when the selected engine and available engines change', async () => {
        const env = new TestEnvironment();
        const projectId = 'project01';
        await env.service.saveDraftingEngineAvailability(projectId, DEFAULT_DRAFTING_ENGINE_AVAILABILITY, {
          availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
          selectedEngine: DraftingEngine.Llm
        });
        verify(mockedCommandService.onlineInvoke(anything(), 'setDraftingEngine', anything())).once();
        expect().nothing();
        verify(mockedCommandService.onlineInvoke(anything(), 'setAvailableDraftingEngines', anything())).once();
      });

      it('should invoke the command service when the selected engine change', async () => {
        const env = new TestEnvironment();
        const projectId = 'project01';
        await env.service.saveDraftingEngineAvailability(
          projectId,
          {
            availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
            selectedEngine: DraftingEngine.Llm
          },
          {
            availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
            selectedEngine: DraftingEngine.Nmt
          }
        );
        verify(mockedCommandService.onlineInvoke(anything(), 'setDraftingEngine', anything())).once();
        verify(mockedCommandService.onlineInvoke(anything(), 'setAvailableDraftingEngines', anything())).never();
        expect().nothing();
      });

      it('should invoke the command service when the available engines change', async () => {
        const env = new TestEnvironment();
        const projectId = 'project01';
        await env.service.saveDraftingEngineAvailability(
          projectId,
          {
            availableEngines: [DraftingEngine.Nmt],
            selectedEngine: DraftingEngine.Nmt
          },
          {
            availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
            selectedEngine: DraftingEngine.Nmt
          }
        );
        verify(mockedCommandService.onlineInvoke(anything(), 'setDraftingEngine', anything())).never();
        verify(mockedCommandService.onlineInvoke(anything(), 'setAvailableDraftingEngines', anything())).once();
        expect().nothing();
      });

      it('should not invoke the command service when the available engines change', async () => {
        const env = new TestEnvironment();
        const projectId = 'project01';
        await env.service.saveDraftingEngineAvailability(
          projectId,
          {
            availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
            selectedEngine: DraftingEngine.Llm
          },
          {
            availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
            selectedEngine: DraftingEngine.Llm
          }
        );
        verify(mockedCommandService.onlineInvoke(anything(), 'setDraftingEngine', anything())).never();
        verify(mockedCommandService.onlineInvoke(anything(), 'setAvailableDraftingEngines', anything())).never();
        expect().nothing();
      });
    });
  });

  class TestEnvironment {
    readonly httpTestingController: HttpTestingController;
    readonly service: SFProjectService;

    constructor() {
      this.httpTestingController = TestBed.inject(HttpTestingController);
      this.service = TestBed.inject(SFProjectService);
    }
  }
});
