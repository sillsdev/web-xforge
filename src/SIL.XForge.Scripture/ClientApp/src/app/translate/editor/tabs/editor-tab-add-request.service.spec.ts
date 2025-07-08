import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { PermissionsService } from '../../../core/permissions.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TabStateService } from '../../../shared/sf-tab-group';
import { EditorTabAddRequestService } from './editor-tab-add-request.service';

describe('EditorTabAddRequestService', () => {
  let service: EditorTabAddRequestService;
  let dialogService: DialogService;
  let projectService: SFProjectService;
  let permissionsService: PermissionsService;
  let tabStateService: TabStateService<any, any>;

  beforeEach(() => {
    dialogService = mock(DialogService);
    projectService = mock(SFProjectService);
    permissionsService = mock(PermissionsService);
    tabStateService = mock(TabStateService);

    service = new EditorTabAddRequestService(
      instance(dialogService),
      instance(projectService),
      instance(permissionsService),
      instance(tabStateService)
    );
  });

  function createTestProjectDoc(index: number): SFProjectDoc {
    return {
      id: `testId${index}`,
      data: createTestProject({
        paratextId: `testParatextId${index}`,
        shortName: `testName${index}`,
        name: `testFullName${index}`
      })
    } as SFProjectDoc;
  }

  it('should handle tab add request for tab type "project-resource"', done => {
    const projectDoc = createTestProjectDoc(1);

    when(dialogService.openMatDialog(anything(), anything())).thenReturn({
      afterClosed: () => of(projectDoc)
    } as any);
    when(tabStateService.tabs$).thenReturn(of([]));
    when(permissionsService.isUserOnProject(anything())).thenResolve(true);

    service.handleTabAddRequest('project-resource').subscribe(result => {
      expect(result).toEqual({ projectId: 'testId1', headerText$: jasmine.any(Object), tooltip: 'testFullName1' });
      done();
    });
  });

  it('should handle tab add request for tab type not "project-resource"', done => {
    service.handleTabAddRequest('history').subscribe(result => {
      expect(result).toEqual({});
      done();
    });
  });

  it('should get paratext ids for open tabs', done => {
    const projectDoc1 = createTestProjectDoc(1);
    const projectDoc2 = createTestProjectDoc(2);

    when(tabStateService.tabs$).thenReturn(of([{ projectId: projectDoc1.id }, {}, { projectId: projectDoc2.id }]));
    when(projectService.get(projectDoc1.id)).thenResolve(projectDoc1);
    when(projectService.get(projectDoc2.id)).thenResolve(projectDoc2);
    when(permissionsService.isUserOnProject(anything())).thenResolve(true);

    service['getParatextIdsForOpenTabs']().subscribe(result => {
      expect(result).toEqual([projectDoc1.data!.paratextId, projectDoc2.data!.paratextId]);
      done();
    });
  });

  it('can skip paratext ids for projects a user does not have permission for', done => {
    const projectDoc1 = createTestProjectDoc(1);
    const projectDoc2 = createTestProjectDoc(2);

    when(tabStateService.tabs$).thenReturn(of([{ projectId: projectDoc1.id }, {}, { projectId: projectDoc2.id }]));
    when(projectService.get(projectDoc1.id)).thenResolve(projectDoc1);
    when(permissionsService.isUserOnProject(anything())).thenResolve(true);
    when(permissionsService.isUserOnProject(projectDoc2.id)).thenResolve(false);

    service['getParatextIdsForOpenTabs']().subscribe(result => {
      expect(result).toEqual([projectDoc1.data!.paratextId]);
      verify(projectService.get(projectDoc2.id)).never();
      done();
    });
  });
});
