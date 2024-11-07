import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { mock } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DraftApplyProgress, DraftApplyProgressDialogComponent } from './draft-apply-progress-dialog.component';

const mockI18nService = mock(I18nService);
const mockMatDialogRef = mock(MatDialogRef);

describe('DraftApplyProgressDialogComponent', () => {
  let env: TestEnvironment;
  let progress$: BehaviorSubject<DraftApplyProgress> = new BehaviorSubject<DraftApplyProgress>({
    bookNum: 1,
    completed: false,
    chapters: [1, 2, 3],
    chaptersApplied: []
  });

  configureTestingModule(() => ({
    imports: [DraftApplyProgressDialogComponent, UICommonModule, CommonModule, TestTranslocoModule],
    providers: [
      { provide: I18nService, useMock: mockI18nService },
      { provide: MatDialogRef, useMock: mockMatDialogRef },
      { provide: MAT_DIALOG_DATA, useValue: { draftApplyProgress$: progress$ } }
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('shows progress', () => {
    progress$.next({ bookNum: 1, chapters: [1, 2], chaptersApplied: [1], completed: false });
    env.fixture.detectChanges();
    expect(env.progressContainer).not.toBeNull();
    expect(env.resultContainer).toBeNull();
    expect(env.component.progress).toBe(50);
  });

  it('shows apply draft completed', () => {
    progress$.next({ bookNum: 1, chapters: [1, 2], chaptersApplied: [1, 2], completed: true });
    env.fixture.detectChanges();
    expect(env.progressContainer).toBeNull();
    expect(env.resultContainer).not.toBeNull();
    expect(env.component.failedToApplyChapters).toBeUndefined();
    expect(env.resultContainer.textContent).toContain('Successfully applied all chapters');
  });

  it('shows chapters that failed to be applied', () => {
    progress$.next({ bookNum: 1, chapters: [1, 2], chaptersApplied: [1], completed: true });
    env.fixture.detectChanges();
    expect(env.progressContainer).toBeNull();
    expect(env.resultContainer).not.toBeNull();
    expect(env.component.failedToApplyChapters).toEqual('2');
    expect(env.resultContainer.textContent).toContain('warning');
  });
});

class TestEnvironment {
  component: DraftApplyProgressDialogComponent;
  fixture: ComponentFixture<DraftApplyProgressDialogComponent>;

  constructor() {
    this.fixture = TestBed.createComponent(DraftApplyProgressDialogComponent);
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
