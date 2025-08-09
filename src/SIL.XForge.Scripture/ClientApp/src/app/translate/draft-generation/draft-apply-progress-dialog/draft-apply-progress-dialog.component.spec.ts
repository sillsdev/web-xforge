import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { DraftApplyProgress, DraftApplyProgressDialogComponent } from './draft-apply-progress-dialog.component';

const mockI18nService = mock(I18nService);
const mockMatDialogRef = mock(MatDialogRef);

describe('DraftApplyProgressDialogComponent', () => {
  let env: TestEnvironment;
  const progress$: BehaviorSubject<DraftApplyProgress> = new BehaviorSubject<DraftApplyProgress>({
    bookNum: 1,
    completed: false,
    chapters: [1, 2, 3],
    chaptersApplied: [],
    errorMessages: []
  });

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
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
    progress$.next({ bookNum: 1, chapters: [1, 2], chaptersApplied: [1], completed: false, errorMessages: [] });
    env.fixture.detectChanges();
    expect(env.progressContainer).not.toBeNull();
    expect(env.resultContainer).toBeNull();
    expect(env.component.progress).toBe(50);
  });

  it('shows apply draft completed', () => {
    progress$.next({ bookNum: 1, chapters: [1, 2], chaptersApplied: [1, 2], completed: true, errorMessages: [] });
    env.fixture.detectChanges();
    expect(env.progressContainer).toBeNull();
    expect(env.resultContainer).not.toBeNull();
    expect(env.component.failedToApplyChapters).toBeUndefined();
    expect(env.resultContainer.textContent).toContain('Successfully applied all chapters');
  });

  it('shows chapters that failed to be applied', () => {
    progress$.next({ bookNum: 1, chapters: [1, 2], chaptersApplied: [1], completed: true, errorMessages: ['error'] });
    env.fixture.detectChanges();
    expect(env.progressContainer).toBeNull();
    expect(env.resultContainer).not.toBeNull();
    expect(env.component.failedToApplyChapters).toEqual('2');
    expect(env.resultContainer.textContent).toContain('warning');
    expect(env.component.draftApplyProgress?.errorMessages).toContain('error');
  });
});

class TestEnvironment {
  component: DraftApplyProgressDialogComponent;
  fixture: ComponentFixture<DraftApplyProgressDialogComponent>;

  constructor() {
    this.fixture = TestBed.createComponent(DraftApplyProgressDialogComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    when(mockI18nService.enumerateList(anything())).thenCall((items: string[]) => items.join(', '));
  }

  get progressContainer(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.progress-container');
  }

  get resultContainer(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.result-container');
  }
}
