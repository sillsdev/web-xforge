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
  });

  it('should create a "draft" tab', () => {
    const tab = service.createTab('draft');
    expect(tab.type).toEqual('draft');
    expect(tab.icon).toEqual('auto_awesome');
    expect(tab.headerText).toEqual('Auto Draft');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project" tab', () => {
    const tab = service.createTab('project', { headerText: 'Project 1' });
    expect(tab.type).toEqual('project');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should create a "project-source" tab', () => {
    const tab = service.createTab('project-source', { headerText: 'Project 1' });
    expect(tab.type).toEqual('project-source');
    expect(tab.icon).toEqual('book');
    expect(tab.headerText).toEqual('Project 1');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
  });

  it('should throw error for unknown tab type', () => {
    expect(() => service.createTab('unknown' as EditorTabType)).toThrowError('Unknown TabType: unknown');
  });

  it('should throw error for "project" tab without headerText', () => {
    expect(() => service.createTab('project')).toThrowError("'tabOptions' must include 'headerText'");
  });

  it('should throw error for "project-source" tab without headerText', () => {
    expect(() => service.createTab('project-source')).toThrowError("'tabOptions' must include 'headerText'");
  });
});
