import { MDC_DIALOG_DATA, MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DebugElement,
  Directive,
  NgModule,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UICommonModule } from '../ui-common.module';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';

describe('DeleteDialogComponent', () => {
  it('Confirm Delete button call', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.deleteButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith('confirmed');
  }));

  it('Confirm Cancel button call', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.cancelButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith('close');
  }));
});

@Directive({
  // ts lint complains that a directive should be used as an attribute
  // tslint:disable-next-line:directive-selector
  selector: 'viewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<viewContainerDirective></viewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective) viewContainer: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, SaDeleteDialogComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, SaDeleteDialogComponent],
  entryComponents: [ChildViewContainerComponent, SaDeleteDialogComponent]
})
class TestModule {}

class TestEnvironment {
  component: SaDeleteDialogComponent;
  fixture: ComponentFixture<ChildViewContainerComponent>;
  dialogRef: MdcDialogRef<SaDeleteDialogComponent>;
  afterCloseCallback: jasmine.Spy;

  constructor() {
    TestBed.configureTestingModule({
      imports: [TestModule]
    });
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MdcDialogConfig<SaDeleteUserDialogData> = {
      viewContainerRef,
      data: { user: { id: '', type: '', name: 'Billy T James', email: 'w.j.t.w.taitoko@example.com' } }
    };
    this.dialogRef = TestBed.get(MdcDialog).open(SaDeleteDialogComponent, config);
    this.afterCloseCallback = jasmine.createSpy('afterClose callback');
    this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
  }

  get cancelButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#confirm-button-no'));
  }

  get deleteButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#confirm-button-yes'));
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }

    element.click();
    this.fixture.detectChanges();
    flush();
  }
}
