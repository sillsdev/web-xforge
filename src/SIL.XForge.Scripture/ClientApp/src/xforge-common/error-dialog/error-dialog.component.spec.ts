import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import {
  MatLegacyDialog as MatDialog,
  MatLegacyDialogConfig as MatDialogConfig
} from '@angular/material/legacy-dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { OverlayContainer } from '@angular/cdk/overlay';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from '../test-utils';
import { UICommonModule } from '../ui-common.module';
import { ErrorAlertData, ErrorDialogComponent } from './error-dialog.component';

describe('ErrorDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule]
  }));

  let overlayContainer: OverlayContainer;

  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  const dialogData = {
    message: 'The error message.',
    stack: 'The error stack\nLine2',
    eventId: '12345'
  };

  it('should display error dialog', fakeAsync(() => {
    const env = new TestEnvironment({ ...dialogData });

    expect(env.errorMessage.textContent).toBe(dialogData.message);
    expect(env.showDetails?.textContent).toBe('Show details');
    expect(env.errorId.textContent).toBe(`Error ID: ${dialogData.eventId}`);
    expect(env.stackTrace).toBeNull();

    env.showDetails?.click();
    env.fixture.detectChanges();
    expect(env.showDetails?.textContent).toBe('Hide details');
    expect(env.stackTrace?.textContent).toBe(dialogData.stack);

    env.showDetails?.click();
    env.fixture.detectChanges();
    expect(env.showDetails?.textContent).toBe('Show details');
    expect(env.stackTrace).toBeNull();

    env.closeButton.click();
    flush();
  }));

  it('should not render "Show details" link when no stack trace', fakeAsync(() => {
    const env = new TestEnvironment({
      ...dialogData,
      stack: ''
    });

    expect(env.showDetails).toBeNull();
    expect(env.stackTrace).toBeNull();

    env.closeButton.click();
    flush();
  }));
});

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule, NoopAnimationsModule],
  declarations: [ErrorDialogComponent],
  exports: [ErrorDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  componentInstance: ErrorDialogComponent;

  constructor(dialogData: ErrorAlertData) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;

    const config: MatDialogConfig<ErrorAlertData> = {
      data: dialogData,
      viewContainerRef
    };
    const dialogRef = TestBed.inject(MatDialog).open(ErrorDialogComponent, config);

    this.componentInstance = dialogRef.componentInstance;

    this.fixture.detectChanges();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get errorMessage(): HTMLElement {
    return this.selectElement('mat-dialog-content p:first-child')!;
  }

  get showDetails(): HTMLElement | null {
    return this.selectElement('mat-dialog-content > a')!;
  }

  get stackTrace(): HTMLElement | null {
    return this.selectElement('pre')!;
  }

  get errorId(): HTMLElement {
    return this.selectElement('.error-id')!;
  }

  get closeButton(): HTMLElement {
    return this.selectElement('button[mat-dialog-close]')!;
  }

  private selectElement(selector: string): HTMLElement | null {
    return this.overlayContainerElement.querySelector(selector);
  }
}
