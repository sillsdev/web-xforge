import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of, throwError } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftDownloadButtonComponent } from './draft-download-button.component';

const mockActivatedProjectService: ActivatedProjectService = mock(ActivatedProjectService);
const mockDraftGenerationService: DraftGenerationService = mock(DraftGenerationService);
const mockNoticeService: NoticeService = mock(NoticeService);

describe('DraftDownloadButtonComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: NoticeService, useMock: mockNoticeService }
    ]
  }));

  it('should create', () => {
    const env = new TestEnvironment();
    expect(env.component).toBeTruthy();
  });

  describe('downloadProgress', () => {
    it('should show number between 0 and 100', () => {
      const env = new TestEnvironment();
      env.component.downloadBooksProgress = 4;
      env.component.downloadBooksTotal = 8;
      expect(env.component.downloadProgress).toBe(50);
    });

    it('should not divide by zero', () => {
      const env = new TestEnvironment();
      env.component.downloadBooksProgress = 4;
      env.component.downloadBooksTotal = 0;
      expect(env.component.downloadProgress).toBe(0);
    });
  });

  describe('download draft button', () => {
    it('button should start the download', () => {
      const env = new TestEnvironment();
      spyOn(env.component, 'downloadDraft').and.stub();
      env.fixture.detectChanges();

      env.downloadButton!.click();
      expect(env.component.downloadDraft).toHaveBeenCalled();
    });

    it('spinner should display while the download is in progress', () => {
      const env = new TestEnvironment();
      env.component.downloadBooksProgress = 2;
      env.component.downloadBooksTotal = 4;
      env.fixture.detectChanges();

      expect(env.downloadSpinner).not.toBeNull();
    });

    it('spinner should not display while no download is in progress', () => {
      const env = new TestEnvironment();
      env.component.downloadBooksProgress = 0;
      env.component.downloadBooksTotal = 0;
      env.fixture.detectChanges();

      expect(env.downloadSpinner).toBeNull();
    });
  });

  describe('downloadDraft', () => {
    it('should display an error if one occurs', () => {
      const env = new TestEnvironment();
      when(mockDraftGenerationService.downloadGeneratedDraftZip(anything(), anything())).thenReturn(
        throwError(() => new Error())
      );

      env.component.downloadDraft();
      expect(env.component.downloadBooksProgress).toBe(0);
      expect(env.component.downloadBooksTotal).toBe(0);
      verify(mockNoticeService.showError(anything())).once();
    });

    it('should emit draft progress', () => {
      const env = new TestEnvironment();
      when(mockDraftGenerationService.downloadGeneratedDraftZip(anything(), anything())).thenReturn(
        of({
          current: 1,
          total: 2
        })
      );

      env.component.downloadDraft();
      expect(env.component.downloadBooksProgress).toBe(1);
      expect(env.component.downloadBooksTotal).toBe(2);
    });
  });

  class TestEnvironment {
    component: DraftDownloadButtonComponent;
    fixture: ComponentFixture<DraftDownloadButtonComponent>;

    constructor() {
      const mockProjectDoc = { id: 'project01', data: createTestProjectProfile() } as SFProjectProfileDoc;
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);

      this.fixture = TestBed.createComponent(DraftDownloadButtonComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    get downloadButton(): HTMLElement | null {
      return this.getElementByTestId('download-button');
    }

    get downloadSpinner(): HTMLElement | null {
      return this.getElementByTestId('download-spinner');
    }

    getElementByTestId(testId: string): HTMLElement | null {
      return this.fixture.nativeElement.querySelector(`[data-test-id="${testId}"]`);
    }
  }
});
