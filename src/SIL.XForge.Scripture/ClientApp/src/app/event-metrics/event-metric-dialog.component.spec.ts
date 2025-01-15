import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, inject, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { EventMetricDialogComponent } from './event-metric-dialog.component';

describe('EventMetricDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, UICommonModule]
  }));

  let dialog: MatDialog;
  let viewContainerFixture: ComponentFixture<ChildViewContainerComponent>;

  it('should allow user to close', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.closeButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith('cancel');
  }));

  class TestEnvironment {
    fixture: ComponentFixture<ChildViewContainerComponent>;
    component: EventMetricDialogComponent;
    dialogRef: MatDialogRef<EventMetricDialogComponent>;

    afterCloseCallback: jasmine.Spy;

    constructor() {
      this.afterCloseCallback = jasmine.createSpy('afterClose callback');
      const config: MatDialogConfig = { data: { name: 'project01' } };
      this.dialogRef = dialog.open(EventMetricDialogComponent, config);
      this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
      this.component = this.dialogRef.componentInstance;
      this.fixture = viewContainerFixture;
      this.fixture.detectChanges();
    }

    get overlayContainerElement(): HTMLElement {
      return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
    }

    get closeButton(): HTMLElement {
      return this.overlayContainerElement.querySelector('#close-btn') as HTMLElement;
    }

    clickElement(element: HTMLElement): void {
      element.click();
      this.fixture.detectChanges();
      tick();
    }
  }

  beforeEach(inject([MatDialog], (d: MatDialog) => {
    dialog = d;
  }));

  beforeEach(() => {
    viewContainerFixture = TestBed.createComponent(ChildViewContainerComponent);
  });
});

@NgModule({
  exports: [EventMetricDialogComponent],
  imports: [EventMetricDialogComponent, TestTranslocoModule, UICommonModule],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
class DialogTestModule {}
