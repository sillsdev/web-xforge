import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TabStateService } from '../../../shared/sf-tab-group';
import { EditorTabAddRequestService } from './editor-tab-add-request.service';

describe('EditorTabAddRequestService', () => {
  let service: EditorTabAddRequestService;
  let dialogService: DialogService;
  let projectService: SFProjectService;
  let tabStateService: TabStateService<any, any>;

  beforeEach(() => {
    dialogService = mock(DialogService);
    projectService = mock(SFProjectService);
    tabStateService = mock(TabStateService);

    service = new EditorTabAddRequestService(
      instance(dialogService),
      instance(projectService),
      instance(tabStateService)
    );
  });

  function createTestProjectDoc(index: number): SFProjectDoc {
    return {
      id: `testId${index}`,
      data: createTestProject({
        paratextId: `testParatextId${index}`,
        shortName: `testName${index}`
      })
    } as SFProjectDoc;
  }

  it('should handle tab add request for tab type "project-resource"', done => {
    const projectDoc = createTestProjectDoc(1);

    when(dialogService.openMatDialog(anything(), anything())).thenReturn({
      afterClosed: () => of(projectDoc)
    } as any);
    when(tabStateService.tabs$).thenReturn(of([]));

    service.handleTabAddRequest('project-resource').subscribe(result => {
      expect(result).toEqual({ projectId: 'testId1', headerText: 'testName1' });
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
    when(projectService.get(projectDoc1.id)).thenReturn(Promise.resolve(projectDoc1));
    when(projectService.get(projectDoc2.id)).thenReturn(Promise.resolve(projectDoc2));

    service['getParatextIdsForOpenTabs']().subscribe(result => {
      expect(result).toEqual([projectDoc1.data!.paratextId, projectDoc2.data!.paratextId]);
      done();
    });
  });
});
