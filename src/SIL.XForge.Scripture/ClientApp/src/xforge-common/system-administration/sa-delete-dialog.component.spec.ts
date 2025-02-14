import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { ChildViewContainerComponent, configureTestingModule } from '../test-utils';
import { SaDeleteDialogComponent, SaDeleteUserDialogData } from './sa-delete-dialog.component';

describe('DeleteDialogComponent', () => {
  configureTestingModule(() => ({}));

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
