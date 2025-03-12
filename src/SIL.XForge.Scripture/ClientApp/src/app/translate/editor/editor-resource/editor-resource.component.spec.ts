import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Subject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { FontService } from 'xforge-common/font.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { CopyrightBannerComponent } from '../../../shared/copyright-banner/copyright-banner.component';
import { EditorResourceComponent } from './editor-resource.component';

describe('EditorResourceComponent', () => {
  let component: EditorResourceComponent;
  let fixture: ComponentFixture<EditorResourceComponent>;
  const mockSFProjectService = mock(SFProjectService);
  const mockFeatureFlagService = mock(FeatureFlagService);
  const mockFontService = mock(FontService);
  const mockDialogService = mock(DialogService);
  const projectDoc = {
    id: 'projectId',
    data: createTestProjectProfile()
  } as SFProjectProfileDoc;

  configureTestingModule(() => ({
    providers: [
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: FeatureFlagService, useMock: mockFeatureFlagService },
      { provide: FontService, useMock: mockFontService },
      { provide: DialogService, useMock: mockDialogService }
    ],
    imports: [CopyrightBannerComponent, TestTranslocoModule]
  }));

  beforeEach(async () => {
    fixture = TestBed.createComponent(EditorResourceComponent);
    component = fixture.componentInstance;
    component.resourceText = { editorCreated: new Subject<void>() } as any;

    when(mockFeatureFlagService.usePlatformBibleEditor).thenReturn(createTestFeatureFlag(false));
  });

  afterEach(() => {
    expect(true).toBe(true); // Suppress 'no expectations' warning
  });

  it('should not init when projectId, bookNum, or chapter is undefined', () => {
    component.projectId = undefined;
    component.bookNum = 1;
    component.chapter = 1;
    component['initProjectDetails']();

    component.resourceText!.editorCreated.next();
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
    component['initProjectDetails']();
    component.resourceText!.editorCreated.next();
    tick();
    verify(mockSFProjectService.getProfile(projectId)).once();
    verify(mockFontService.getFontFamilyFromProject(projectDoc)).once();
  }));

  it('can determine if a resource should display right-to-left', fakeAsync(() => {
    const projectId = 'rtl-project';
    component.projectId = projectId;
    component.bookNum = 1;
    component.chapter = 1;
    const rtlProjectDoc: SFProjectProfileDoc = {
      id: projectId,
      data: createTestProjectProfile({ isRightToLeft: true })
    } as SFProjectProfileDoc;
    when(mockSFProjectService.getProfile(projectId)).thenReturn(Promise.resolve(rtlProjectDoc));
    component['initProjectDetails']();
    component.resourceText!.editorCreated.next();
    tick();
    expect(component.isRightToLeft).toBe(true);
  }));

  it('project copyright banner and copyright notice should init when they exist', fakeAsync(() => {
    const projectId = 'proj-notice';
    component.projectId = projectId;
    component.bookNum = 1;
    component.chapter = 1;
    const projectNoticeDoc: SFProjectProfileDoc = {
      id: projectId,
      data: createTestProjectProfile({ copyrightBanner: 'Test copyright', copyrightNotice: 'Test notice' })
    } as SFProjectProfileDoc;
    when(mockSFProjectService.getProfile(projectId)).thenReturn(Promise.resolve(projectNoticeDoc));
    component['initProjectDetails']();
    component.resourceText.editorCreated.next();
    tick();
    expect(component.hasCopyrightBanner).toBe(true);
    expect(component.copyrightBanner).toBe('Test copyright');
    expect(component.copyrightNotice).toBe('Test notice');
  }));

  it('project copyright banner and copyright notice should not init when they do not exist', fakeAsync(() => {
    const projectId = projectDoc.id;
    component.projectId = projectId;
    component.bookNum = 1;
    component.chapter = 1;
    when(mockSFProjectService.getProfile(projectId)).thenReturn(Promise.resolve(projectDoc));
    component['initProjectDetails']();
    component.resourceText.editorCreated.next();
    tick();
    expect(component.hasCopyrightBanner).toBe(false);
    expect(component.copyrightBanner).toBe('');
    expect(component.copyrightNotice).toBeFalsy();
  }));
});
