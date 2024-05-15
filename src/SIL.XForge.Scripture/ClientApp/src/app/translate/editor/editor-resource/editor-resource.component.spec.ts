import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Subject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { FontService } from 'xforge-common/font.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { EditorResourceComponent } from './editor-resource.component';

describe('EditorResourceComponent', () => {
  let component: EditorResourceComponent;
  let fixture: ComponentFixture<EditorResourceComponent>;
  const mockSFProjectService = mock(SFProjectService);
  const mockFontService = mock(FontService);
  const projectDoc = {
    id: 'projectId',
    data: createTestProject()
  } as SFProjectDoc;

  configureTestingModule(() => ({
    providers: [
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: FontService, useMock: mockFontService }
    ]
  }));

  beforeEach(async () => {
    fixture = TestBed.createComponent(EditorResourceComponent);
    component = fixture.componentInstance;
    component.resourceText = { editorCreated: new Subject<void>() } as any;
  });

  afterEach(() => {
    expect(true).toBe(true); // Suppress 'no expectations' warning
  });

  it('should not init when projectId, bookNum, or chapter is undefined', () => {
    component.projectId = undefined;
    component.bookNum = 1;
    component.chapter = 1;
    component.initProjectDetails();

    component.resourceText.editorCreated.next();
    verify(mockSFProjectService.getProfile(anything())).never();

    component.projectId = 'test';
    component.bookNum = undefined;
    component.inputChanged$.next();
    verify(mockSFProjectService.getProfile(anything())).never();

    component.bookNum = 1;
    component.chapter = undefined;
    component.inputChanged$.next();
    verify(mockSFProjectService.getProfile(anything())).never();
  });

  it('should init when projectId, bookNum, and chapter are defined', fakeAsync(() => {
    const projectId = projectDoc.id;
    component.projectId = projectId;
    component.bookNum = 1;
    component.chapter = 1;
    when(mockSFProjectService.getProfile(projectId)).thenReturn(Promise.resolve(projectDoc));
    component.initProjectDetails();
    component.resourceText.editorCreated.next();
    tick();
    verify(mockSFProjectService.getProfile(projectId)).once();
    verify(mockFontService.getFontFamilyFromProject(projectDoc)).once();
  }));
});
