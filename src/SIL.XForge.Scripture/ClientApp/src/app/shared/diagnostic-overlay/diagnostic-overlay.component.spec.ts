import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { DiagnosticOverlayService } from 'xforge-common/diagnostic-overlay.service';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { FeedbackNoticeTimingService } from '../user-feedback/feedback-notice-timing.service';
import { DiagnosticOverlayComponent } from './diagnostic-overlay.component';

describe('DiagnosticOverlayComponent', () => {
  it('should show the production drafting feedback notice delays by default', fakeAsync(() => {
    const env = new TestEnvironment({ tab: 'feedback' });
    expect(env.testModeToggle.checked).toBe(false);
    expect(env.draftingFeedbackNoticeDelays).toEqual([
      ['Drafting before asking', '90 days'],
      ['Hidden after dismissing', '180 days'],
      ['Hidden after sending feedback', '365 days']
    ]);
  }));

  it('should turn on test mode and show the test drafting delays', fakeAsync(() => {
    const env = new TestEnvironment({ tab: 'feedback' });
    env.testModeToggle.click();
    env.wait();
    expect(TestBed.inject(FeedbackNoticeTimingService).testMode).toBe(true);
    expect(env.draftingFeedbackNoticeDelays).toEqual([
      ['Drafting before asking', '5 minutes'],
      ['Hidden after dismissing', '2 minutes'],
      ['Hidden after sending feedback', '4 minutes']
    ]);
  }));

  it('should remember the selected tab', fakeAsync(() => {
    const env = new TestEnvironment({ tab: 'loading' });
    expect(env.component.tab).toBe('loading');
    env.component.selectTab('feedback');
    expect(env.storage.get('DIAGNOSTIC_OVERLAY_TAB')).toBe('feedback');
  }));
});

class TestEnvironment {
  readonly storage = new Map<string, unknown>();
  readonly fixture: ComponentFixture<DiagnosticOverlayComponent>;
  readonly component: DiagnosticOverlayComponent;

  constructor({ tab }: { tab?: string } = {}) {
    if (tab != null) this.storage.set('DIAGNOSTIC_OVERLAY_TAB', tab);
    const localSettings: Pick<LocalSettingsService, 'get' | 'set' | 'remove'> = {
      get: <T>(key: string) => this.storage.get(key) as T | undefined,
      set: <T>(key: string, value?: T) => {
        if (value == null) this.storage.delete(key);
        else this.storage.set(key, value);
      },
      remove: (key: string) => this.storage.delete(key)
    };
    TestBed.configureTestingModule({
      imports: [DiagnosticOverlayComponent],
      providers: [
        { provide: LocalSettingsService, useValue: localSettings },
        { provide: RealtimeService, useValue: { docsCountByCollection: {}, totalDocCount: 0 } },
        { provide: NoticeService, useValue: { loadingCountsByCallerId: {} } },
        { provide: DiagnosticOverlayService, useValue: { close: () => {} } }
      ]
    });
    this.fixture = TestBed.createComponent(DiagnosticOverlayComponent);
    this.component = this.fixture.componentInstance;
    this.wait();
  }

  get testModeToggle(): HTMLInputElement {
    return this.fixture.nativeElement.querySelector('.test-mode-toggle');
  }

  get draftingFeedbackNoticeDelays(): string[][] {
    const rows: HTMLTableRowElement[] = Array.from(
      this.fixture.nativeElement.querySelectorAll('.drafting-feedback-notice-delays tbody tr')
    );
    return rows.map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent!.trim()));
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
