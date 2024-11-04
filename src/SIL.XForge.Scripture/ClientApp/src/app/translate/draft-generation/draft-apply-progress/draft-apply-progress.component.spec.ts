import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommonModule } from '@angular/common';
import { mock } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DraftApplyProgressComponent } from './draft-apply-progress.component';

const mockI18nService = mock(I18nService);

describe('DraftApplyProgressComponent', () => {
  let env: TestEnvironment;

  configureTestingModule(() => ({
    imports: [DraftApplyProgressComponent, UICommonModule, CommonModule, TestTranslocoModule],
    providers: [
      {
        provide: I18nService,
        useMock: mockI18nService
      }
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('shows progress', () => {
    env.component.draftApplyProgress = { bookNum: 1, chapters: [1, 2], chaptersApplied: [1], completed: false };
    env.fixture.detectChanges();
    expect(env.progressContainer).not.toBeNull();
    expect(env.resultContainer).toBeNull();
    expect(env.component.progress).toBe(50);
  });

  it('shows progress', () => {
    env.component.draftApplyProgress = { bookNum: 1, chapters: [1, 2], chaptersApplied: [1, 2], completed: true };
    env.fixture.detectChanges();
    expect(env.progressContainer).toBeNull();
    expect(env.resultContainer).not.toBeNull();
    expect(env.component.failedToApplyChapters).toBeUndefined();
    expect(env.resultContainer.textContent).toContain('check');
  });

  it('shows chapters that failed to be applied', () => {
    env.component.draftApplyProgress = { bookNum: 1, chapters: [1, 2], chaptersApplied: [1], completed: true };
    env.fixture.detectChanges();
    expect(env.progressContainer).toBeNull();
    expect(env.resultContainer).not.toBeNull();
    expect(env.component.failedToApplyChapters).toEqual('2');
    expect(env.resultContainer.textContent).toContain('warning');
  });
});

class TestEnvironment {
  component: DraftApplyProgressComponent;
  fixture: ComponentFixture<DraftApplyProgressComponent>;

  constructor() {
    this.fixture = TestBed.createComponent(DraftApplyProgressComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get progressContainer(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.progress-container');
  }

  get resultContainer(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.result-container');
  }
}
