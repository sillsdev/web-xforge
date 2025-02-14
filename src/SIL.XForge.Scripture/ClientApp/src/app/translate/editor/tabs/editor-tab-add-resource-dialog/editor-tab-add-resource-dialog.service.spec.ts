import { TestBed } from '@angular/core/testing';
import { mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../../../core/paratext.service';
import { EditorTabAddResourceDialogService } from './editor-tab-add-resource-dialog.service';

describe('EditorTabAddResourceDialogService', () => {
  let service: EditorTabAddResourceDialogService;
  const mockParatextService = mock(ParatextService);
  const mockProjects: ParatextProject[] = [
    { id: '1', name: 'Project 1' },
    { id: '2', name: 'Project 2' }
  ] as any;
  const mockResources: SelectableProjectWithLanguageCode[] = [
    { id: '1', name: 'Resource 1', languageTag: 'en' },
    { id: '2', name: 'Resource 2', languageTag: 'en' }
  ] as any;

  configureTestingModule(() => ({
    providers: [{ provide: ParatextService, useMock: mockParatextService }]
  }));

  beforeEach(() => {
    service = TestBed.inject(EditorTabAddResourceDialogService);
  });

  it('should return cached projects if available', async () => {
    service.projects = mockProjects;
    expect(await service.getProjects()).toEqual(mockProjects);
  });

  it('should call getProjects if projects are not cached', async () => {
    when(mockParatextService.getProjects()).thenResolve(mockProjects);
    expect(await service.getProjects()).toEqual(mockProjects);
    expect(service.projects).toEqual(mockProjects);
    verify(mockParatextService.getProjects()).once();
  });

  it('should return cached resources if available', async () => {
    service.resources = mockResources;
    expect(await service.getResources()).toEqual(mockResources);
  });

  it('should call getResources if resources are not cached', async () => {
    when(mockParatextService.getResources()).thenResolve(mockResources);
    expect(await service.getResources()).toEqual(mockResources);
    expect(service.resources).toEqual(mockResources);
    verify(mockParatextService.getResources()).once();
  });
});
