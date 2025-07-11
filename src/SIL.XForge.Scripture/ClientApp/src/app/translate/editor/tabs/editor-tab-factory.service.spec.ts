import { TestBed } from '@angular/core/testing';
import { EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { EditorTabFactoryService } from './editor-tab-factory.service';

describe('EditorTabFactoryService', () => {
  let service: EditorTabFactoryService;
  const mockI18nService = mock(I18nService);

  configureTestingModule(() => ({
    providers: [{ provide: I18nService, useMock: mockI18nService }]
  }));

  beforeEach(() => {
    service = TestBed.inject(EditorTabFactoryService);
    when(mockI18nService.translate(anything())).thenReturn(of('Test Header Text'));
  });

  it('should create a "biblical terms" tab', done => {
    const tab = service.createTab('biblical-terms');
    expect(tab.id?.length).toBeGreaterThan(0);
    expect(tab.type).toEqual('biblical-terms');
    expect(tab.svgIcon).toEqual('biblical_terms');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toEqual(true);
    tab.headerText$.subscribe(headerText => {
      expect(headerText).toEqual('Test Header Text');
      done();
    });
  });

  it('should create a "history" tab', done => {
    const tab = service.createTab('history');
    expect(tab.id?.length).toBeGreaterThan(0);
    expect(tab.type).toEqual('history');
    expect(tab.icon).toEqual('history');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toBeFalsy();
    tab.headerText$.subscribe(headerText => {
      expect(headerText).toEqual('Test Header Text');
      done();
    });
  });

  it('should create a "draft" tab', done => {
    const tab = service.createTab('draft');
    expect(tab.id?.length).toBeGreaterThan(0);
    expect(tab.type).toEqual('draft');
    expect(tab.icon).toEqual('auto_awesome');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toEqual(true);
    tab.headerText$.subscribe(headerText => {
      expect(headerText).toEqual('Test Header Text');
      done();
    });
  });

  it('should create a "project-target" tab', done => {
    const tab = service.createTab('project-target', { projectId: 'project1', headerText$: of('Project 1') });
    expect(tab.id?.length).toBeGreaterThan(0);
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-target');
    expect(tab.icon).toEqual('book');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
    tab.headerText$.subscribe(headerText => {
      expect(headerText).toEqual('Project 1');
      done();
    });
  });

  it('should create a "project-source" tab', done => {
    const tab = service.createTab('project-source', { projectId: 'project1', headerText$: of('Project 1') });
    expect(tab.id?.length).toBeGreaterThan(0);
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-source');
    expect(tab.icon).toEqual('book');
    expect(tab.closeable).toEqual(false);
    expect(tab.movable).toEqual(false);
    expect(tab.unique).toEqual(true);
    tab.headerText$.subscribe(headerText => {
      expect(headerText).toEqual('Project 1');
      done();
    });
  });

  it('should create a "project-resource" tab', done => {
    const tab = service.createTab('project-resource', { projectId: 'project1', headerText$: of('Project 1') });
    expect(tab.id?.length).toBeGreaterThan(0);
    expect(tab.projectId).toEqual('project1');
    expect(tab.type).toEqual('project-resource');
    expect(tab.icon).toEqual('library_books');
    expect(tab.closeable).toEqual(true);
    expect(tab.movable).toEqual(true);
    expect(tab.unique).toBeFalsy();
    tab.headerText$.subscribe(headerText => {
      expect(headerText).toEqual('Project 1');
      done();
    });
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
