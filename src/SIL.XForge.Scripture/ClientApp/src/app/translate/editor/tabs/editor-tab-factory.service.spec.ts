import { TestBed } from '@angular/core/testing';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { EditorTabFactoryService } from './editor-tab-factory.service';

describe('EditorTabFactoryService', () => {
  let service: EditorTabFactoryService;
  const mockI18nService = mock(I18nService);

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [{ provide: I18nService, useMock: mockI18nService }]
  }));

  beforeEach(() => {
    service = TestBed.inject(EditorTabFactoryService);
    when(mockI18nService.translate(anything())).thenReturn(of('Test Header Text'));
  });

  it('should create a "biblical terms" tab', async () => {
    const tab = await service.createTab('biblical-terms');
    expect(tab.type).toEqual('biblical-terms');
    expect(tab.svgIcon).toEqual('biblical_terms');
    expect(tab.headerText).toEqual('Test Header Text');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "history" tab', async () => {
    const tab = await service.createTab('history');
    expect(tab.type).toEqual('history');
    expect(tab.icon).toEqual('history');
    expect(tab.headerText).toEqual('Test Header Text');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toBeFalsy();
  });

  it('should create a "draft" tab', async () => {
    const tab = await service.createTab('draft');
    expect(tab.type).toEqual('draft');
    expect(tab.icon).toEqual('auto_awesome');
    expect(tab.headerText).toEqual('Test Header Text');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-target" tab', async () => {
    const tab = await service.createTab('project-target', { projectId: 'project1', headerText: 'Project 1' });
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-target');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-source" tab', async () => {
    const tab = await service.createTab('project-source', { projectId: 'project1', headerText: 'Project 1' });
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-source');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-resource" tab', async () => {
    const tab = await service.createTab('project-resource', { projectId: 'project1', headerText: 'Project 1' });
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-resource');
    expect(tab.icon).toEqual('library_books');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toBeFalsy();
  });

  it('should throw error for unknown tab type', async () => {
    await expectAsync(service.createTab('unknown' as EditorTabType)).toBeRejectedWithError('Unknown TabType: unknown');
  });

  it('should throw error for "project-target" tab without projectId', async () => {
    await expectAsync(service.createTab('project-target')).toBeRejectedWithError(
      "'tabOptions' must include 'projectId'"
    );
  });

  it('should throw error for "project-source" tab without projectId', async () => {
    await expectAsync(service.createTab('project-source')).toBeRejectedWithError(
      "'tabOptions' must include 'projectId'"
    );
  });

  it('should throw error for "project-resource" tab without projectId', async () => {
    await expectAsync(service.createTab('project-resource')).toBeRejectedWithError(
      "'tabOptions' must include 'projectId'"
    );
  });
});
