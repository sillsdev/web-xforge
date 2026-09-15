import { ComponentFixture, TestBed } from '@angular/core/testing';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { mock, when } from 'ts-mockito';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { LowConfidenceNoticeComponent } from './low-confidence-notice.component';

const mockI18nService = mock(I18nService);
const mockUrlService = mock(ExternalUrlService);

describe('LowConfidenceNoticeComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule(), LowConfidenceNoticeComponent],
    providers: [
      defaultTranslocoMarkupTranspilers(),
      { provide: I18nService, useMock: mockI18nService },
      { provide: ExternalUrlService, useMock: mockUrlService }
    ]
  }));

  beforeEach(() => {
    when(mockI18nService.localizeBook('GEN')).thenReturn('Genesis');
    when(mockUrlService.understandingDraftQuality).thenReturn('https://help.example.com/understanding-draft-quality');
  });

  it('shows nothing when no books have low confidence', () => {
    const env = new TestEnvironment([]);
    expect(env.notice).toBeNull();
  });

  it('names the book when one book has low confidence', () => {
    const env = new TestEnvironment(['GEN']);
    expect(env.notice!.textContent).toContain('Genesis');
    expect(env.learnMoreLink!.href).toBe('https://help.example.com/understanding-draft-quality');
  });

  it('counts the books when several books have low confidence', () => {
    const env = new TestEnvironment(['GEN', 'EXO', 'LEV']);
    expect(env.notice!.textContent).toContain('3 books');
    expect(env.learnMoreLink).not.toBeNull();
  });

  class TestEnvironment {
    readonly fixture: ComponentFixture<LowConfidenceNoticeComponent>;

    constructor(bookIds: string[]) {
      this.fixture = TestBed.createComponent(LowConfidenceNoticeComponent);
      this.fixture.componentInstance.bookIds = bookIds;
      this.fixture.detectChanges();
    }

    get notice(): HTMLElement | null {
      return this.fixture.nativeElement.querySelector('app-notice');
    }

    get learnMoreLink(): HTMLAnchorElement | null {
      return this.fixture.nativeElement.querySelector('app-notice a');
    }
  }
});
