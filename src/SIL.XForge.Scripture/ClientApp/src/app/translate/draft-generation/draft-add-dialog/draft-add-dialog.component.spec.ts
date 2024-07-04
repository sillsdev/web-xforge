import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, inject, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DraftAddDialogComponent } from './draft-add-dialog.component';

let env: TestEnvironment;

describe('DraftAddDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, UICommonModule, NoopAnimationsModule]
  }));

  beforeEach(inject([MatDialog], (d: MatDialog) => {
    env = new TestEnvironment(d);
  }));

  it('should not confirm when user clicks cancel', fakeAsync(() => {
    expect(env.overlayContainerElement.querySelector('h2')!.textContent).toContain('Romans');
    env.cancelButton.click();
    flush();
    expect(env.confirmed).toBe(false);
  }));

  it('should confirm when user clicks add to project', fakeAsync(() => {
    expect(env.overlayContainerElement.querySelector('h2')!.textContent).toContain('Romans');
    env.addButton.click();
    flush();
    expect(env.confirmed).toBe(true);
  }));
});

class TestEnvironment {
  component: DraftAddDialogComponent;
  fixture: ComponentFixture<ChildViewContainerComponent>;
  dialogRef: MatDialogRef<DraftAddDialogComponent>;
  confirmed: boolean = false;

  constructor(dialog: MatDialog) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = dialog.open(DraftAddDialogComponent, { data: { bookName: 'Romans' } });

    this.dialogRef.afterClosed().subscribe(result => (this.confirmed = result));
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get addButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('.add-button')!;
  }

  get cancelButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('.cancel-button')!;
  }
}

@NgModule({
  imports: [UICommonModule, TestTranslocoModule, DraftAddDialogComponent]
})
class DialogTestModule {}
