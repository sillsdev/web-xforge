import { Clipboard } from '@angular/cdk/clipboard';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { CopyComponent } from './copy.component';

describe('CopyComponent', () => {
  configureTestingModule(() => ({
    imports: [CopyComponent, getTestTranslocoModule()],
    providers: [provideNoopAnimations()]
  }));

  it('should set default tooltip from i18n', () => {
    const env: TestEnvironment = new TestEnvironment();
    expect(env.component.tooltip).toBe('Copy to clipboard');
  });

  it('should copy value to clipboard on click', () => {
    const env: TestEnvironment = new TestEnvironment({ value: 'test-value' });
    spyOn(env.clipboard, 'copy').and.returnValue(true);
    env.clickCopyButton();
    expect(env.clipboard.copy).toHaveBeenCalledWith('test-value');
  });

  it('should not copy when value is undefined', () => {
    const env: TestEnvironment = new TestEnvironment({ value: undefined });
    spyOn(env.clipboard, 'copy');
    env.clickCopyButton();
    expect(env.clipboard.copy).not.toHaveBeenCalled();
  });

  it('should show copied state after successful copy', () => {
    const env: TestEnvironment = new TestEnvironment({ value: 'abc' });
    spyOn(env.clipboard, 'copy').and.returnValue(true);
    expect(env.component.isCopied).toBe(false);
    env.clickCopyButton();
    expect(env.component.isCopied).toBe(true);
  });

  it('should not show copied state when clipboard copy fails', () => {
    const env: TestEnvironment = new TestEnvironment({ value: 'abc' });
    spyOn(env.clipboard, 'copy').and.returnValue(false);
    env.clickCopyButton();
    expect(env.component.isCopied).toBe(false);
  });

  it('should reset copied state after copiedDurationMs', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment({ value: 'abc', copiedDurationMs: 500 });
    spyOn(env.clipboard, 'copy').and.returnValue(true);
    env.clickCopyButton();
    expect(env.component.isCopied).toBe(true);
    tick(499);
    expect(env.component.isCopied).toBe(true);
    tick(1);
    expect(env.component.isCopied).toBe(false);
  }));

  it('should immediately reset copied state when copiedDurationMs is zero', () => {
    const env: TestEnvironment = new TestEnvironment({ value: 'abc', copiedDurationMs: 0 });
    spyOn(env.clipboard, 'copy').and.returnValue(true);
    env.clickCopyButton();
    expect(env.component.isCopied).toBe(false);
  });

  it('should show copied icon when isCopied is true', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment({ value: 'abc', copiedDurationMs: 500 });
    spyOn(env.clipboard, 'copy').and.returnValue(true);

    env.fixture.detectChanges();
    expect(env.displayedIconName).toBe('content_copy');

    env.clickCopyButton();
    env.fixture.detectChanges();
    expect(env.displayedIconName).toBe('done');

    tick(500);
    env.fixture.detectChanges();
    expect(env.displayedIconName).toBe('content_copy');
  }));

  it('should reset timeout on rapid double-click', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment({ value: 'abc', copiedDurationMs: 500 });
    spyOn(env.clipboard, 'copy').and.returnValue(true);

    // First click
    env.clickCopyButton();
    expect(env.component.isCopied).toBe(true);
    tick(300);

    // Second click before timeout expires
    env.clickCopyButton();
    expect(env.component.isCopied).toBe(true);

    // 300ms after second click: still copied since timeout was reset
    tick(300);
    expect(env.component.isCopied).toBe(true);

    // 200ms more after second click: should now be reset (500ms total from second click)
    tick(200);
    expect(env.component.isCopied).toBe(false);
  }));
});

/** Provides helpers for constructing test data for CopyComponent tests. */
class TestEnvironment {
  readonly component: CopyComponent;
  readonly fixture: ComponentFixture<CopyComponent>;
  readonly clipboard: Clipboard;

  constructor({
    value,
    copiedDurationMs
  }: {
    value?: string;
    copiedDurationMs?: number;
  } = {}) {
    this.fixture = TestBed.createComponent(CopyComponent);
    this.component = this.fixture.componentInstance;
    this.clipboard = TestBed.inject(Clipboard);

    if (value !== undefined) {
      this.component.value = value;
    }
    if (copiedDurationMs !== undefined) {
      this.component.copiedDurationMs = copiedDurationMs;
    }

    this.fixture.detectChanges();
  }

  get displayedIconName(): string {
    const iconElement: HTMLElement = this.fixture.debugElement.query(By.css('mat-icon')).nativeElement;
    return iconElement.textContent?.trim() ?? '';
  }

  clickCopyButton(): void {
    this.component.onCopyClick();
  }
}
