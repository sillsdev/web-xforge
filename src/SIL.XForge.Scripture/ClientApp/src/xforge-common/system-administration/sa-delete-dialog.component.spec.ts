import { CommonModule } from '@angular/common';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import {
  MatLegacyDialog as MatDialog,
  MatLegacyDialogConfig as MatDialogConfig,
  MatLegacyDialogRef as MatDialogRef
} from '@angular/material/legacy-dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { ChildViewContainerComponent, configureTestingModule } from '../test-utils';
import { UICommonModule } from '../ui-common.module';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';

describe('DeleteDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [TestModule]
  }));

  it('Confirm Delete button call', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.deleteButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith(true);
  }));

  it('Confirm Cancel button call', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.cancelButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith(false);
  }));
});

@NgModule({
  imports: [CommonModule, UICommonModule, AvatarComponent, NoopAnimationsModule],
  declarations: [SaDeleteDialogComponent],
  exports: [SaDeleteDialogComponent]
})
class TestModule {}

class TestEnvironment {
  component: SaDeleteDialogComponent;
  fixture: ComponentFixture<ChildViewContainerComponent>;
  dialogRef: MatDialogRef<SaDeleteDialogComponent>;
  afterCloseCallback: jasmine.Spy;

  constructor() {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MatDialogConfig<SaDeleteUserDialogData> = {
      viewContainerRef,
      data: {
        user: createTestUser()
      }
    };
    this.dialogRef = TestBed.inject(MatDialog).open(SaDeleteDialogComponent, config);
    this.afterCloseCallback = jasmine.createSpy('afterClose callback');
    this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
  }

  get cancelButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.button-cancel'));
  }

  get deleteButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.button-delete'));
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
