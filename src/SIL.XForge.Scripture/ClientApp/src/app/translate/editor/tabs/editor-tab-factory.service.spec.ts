import { TestBed } from '@angular/core/testing';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { EditorTabFactoryService } from './editor-tab-factory.service';

describe('EditorTabFactoryService', () => {
  let service: EditorTabFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorTabFactoryService);
  });

  it('should create a "history" tab', () => {
    const tab = service.createTab('history');
    expect(tab.type).toEqual('history');
    expect(tab.icon).toEqual('history');
    expect(tab.headerText).toEqual('History');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toBeFalsy();
  });

  it('should create a "draft" tab', () => {
    const tab = service.createTab('draft');
    expect(tab.type).toEqual('draft');
    expect(tab.icon).toEqual('model_training');
    expect(tab.headerText).toEqual('Auto Draft');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-target" tab', () => {
    const tab = service.createTab('project-target', { projectId: 'project1', headerText: 'Project 1' });
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-target');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-source" tab', () => {
    const tab = service.createTab('project-source', { projectId: 'project1', headerText: 'Project 1' });
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-source');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-resource" tab', () => {
    const tab = service.createTab('project-resource', { projectId: 'project1', headerText: 'Project 1' });
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-resource');
    expect(tab.icon).toEqual('library_books');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toBeFalsy();
  });

  it('should throw error for unknown tab type', () => {
    expect(() => service.createTab('unknown' as EditorTabType)).toThrowError('Unknown TabType: unknown');
  });

  it('should throw error for "project-target" tab without projectId', () => {
    expect(() => service.createTab('project-target')).toThrowError("'tabOptions' must include 'projectId'");
  });

  it('should throw error for "project-source" tab without projectId', () => {
    expect(() => service.createTab('project-source')).toThrowError("'tabOptions' must include 'projectId'");
  });

  it('should throw error for "project-resource" tab without projectId', () => {
    expect(() => service.createTab('project-resource')).toThrowError("'tabOptions' must include 'projectId'");
  });
});
