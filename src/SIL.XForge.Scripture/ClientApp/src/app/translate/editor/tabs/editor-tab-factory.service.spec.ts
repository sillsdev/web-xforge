import { TestBed } from '@angular/core/testing';
import { EditorTabFactoryService } from './editor-tab-factory.service';
import { EditorTabType } from './editor-tabs.types';

describe('EditorTabFactoryService', () => {
  let service: EditorTabFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorTabFactoryService);
  });

  it('should create a "history" tab', () => {
    const tab = service.createEditorTab('history');
    expect(tab.type).toEqual('history');
    expect(tab.icon).toEqual('history');
    expect(tab.headerText).toEqual('History');
    expect(tab.closeable).toEqual(true);
  });

  it('should create a "draft" tab', () => {
    const tab = service.createEditorTab('draft');
    expect(tab.type).toEqual('draft');
    expect(tab.icon).toEqual('model_training');
    expect(tab.headerText).toEqual('Auto Draft');
    expect(tab.closeable).toEqual(true);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project" tab', () => {
    const tab = service.createEditorTab('project', { headerText: 'Project 1' });
    expect(tab.type).toEqual('project');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-source" tab', () => {
    const tab = service.createEditorTab('project-source', { headerText: 'Project 1' });
    expect(tab.type).toEqual('project-source');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should throw error for unknown tab type', () => {
    expect(() => service.createEditorTab('unknown' as EditorTabType)).toThrowError('Unknown TabType: unknown');
  });

  it('should throw error for "project" tab without headerText', () => {
    expect(() => service.createEditorTab('project')).toThrowError("'tabOptions' must include 'headerText'");
  });

  it('should throw error for "project-source" tab without headerText', () => {
    expect(() => service.createEditorTab('project-source')).toThrowError("'tabOptions' must include 'headerText'");
  });
});
