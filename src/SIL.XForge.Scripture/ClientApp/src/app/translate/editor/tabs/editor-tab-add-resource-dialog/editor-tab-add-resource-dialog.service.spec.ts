import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { mock, resetCalls, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { ParatextService, SelectableProject } from '../../../../core/paratext.service';
import { EditorTabAddResourceDialogService } from './editor-tab-add-resource-dialog.service';

describe('EditorTabAddResourceDialogService', () => {
  let service: EditorTabAddResourceDialogService;
  const mockParatextService = mock(ParatextService);
  const mockProjectsService = mock(SFUserProjectsService);
  const mockProjects: ParatextProject[] = [
    { id: '1', name: 'Project 1' },
    { id: '2', name: 'Project 2' }
  ] as any;
  const mockResources: SelectableProject[] = [
    { id: '1', name: 'Resource 1' },
    { id: '2', name: 'Resource 2' }
  ] as any;

  configureTestingModule(() => ({
    providers: [
      { provide: ParatextService, useMock: mockParatextService },
      { provide: SFUserProjectsService, useMock: mockProjectsService }
    ]
  }));

  const projectDocs = new BehaviorSubject<SFProjectProfileDoc[]>([]);

  beforeEach(() => {
    when(mockProjectsService.projectDocs$).thenReturn(projectDocs);
    service = TestBed.inject(EditorTabAddResourceDialogService);
  });

  it('should return cached projects if available', async () => {
    when(mockParatextService.getProjects()).thenResolve(mockProjects);
    expect(await service.getProjects()).toEqual(mockProjects);
  });

  it('should return updated projects if they change', async () => {
    when(mockParatextService.getProjects()).thenResolve(mockProjects);
    expect(await service.getProjects()).toEqual(mockProjects);

    const newProjects = [mockProjects[0]];
    when(mockParatextService.getProjects()).thenResolve(newProjects);
    expect(await service.getProjects()).not.toEqual(newProjects);

    projectDocs.next([{} as SFProjectProfileDoc]);
    await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async subscription to execute
    expect(await service.getProjects()).toEqual(newProjects);
  });

  it('should call getProjects if projects are not cached', async () => {
    resetCalls(mockParatextService);

    when(mockParatextService.getProjects()).thenResolve(mockProjects);
    expect(await service.getProjects()).toEqual(mockProjects);
    expect(await service.getProjects()).toEqual(mockProjects);

    verify(mockParatextService.getProjects()).once();
  });

  it('should return cached resources if available', async () => {
    when(mockParatextService.getResources()).thenResolve(mockResources);
    expect(await service.getResources()).toEqual(mockResources);
  });

  it('should call getResources if resources are not cached', async () => {
    resetCalls(mockParatextService);

    when(mockParatextService.getResources()).thenResolve(mockResources);
    expect(await service.getResources()).toEqual(mockResources);
    expect(await service.getResources()).toEqual(mockResources);

    verify(mockParatextService.getResources()).once();
  });
});
