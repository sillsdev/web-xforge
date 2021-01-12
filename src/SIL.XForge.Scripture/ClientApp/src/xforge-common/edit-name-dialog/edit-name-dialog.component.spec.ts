import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { CommonModule } from '@angular/common';
import { Component, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { EditNameDialogComponent, EditNameDialogResult } from './edit-name-dialog.component';

describe('EditNameDialogComponent', () => {
  it('should display name and cancel button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    expect(env.nameInput.querySelector('input')!.value).toBe('Simon Says');
    expect(env.cancelButton).not.toBe(null);
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Simon Says');
  }));

  it('should allow user to change name', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Follow The Leader');
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Follow The Leader');
  }));

  it('should not change name when cancelled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Follow The Leader');
    expect(env.cancelButton).not.toBe(null);
    if (env.cancelButton != null) {
      env.cancelButton.click();
      env.fixture.detectChanges();
    }
    expect(env.component.confirmedName).toBeUndefined();
  }));

  it('should not allow the name to be blank', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, '');
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, ' ');
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Bob');
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Bob');
  }));

  it('shows messages in a confirmation context', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.isConfirmContext = true;
    env.openDialog();
    expect(env.title.textContent).toBe('Confirm your name');
    expect(env.description.textContent).toContain('Confirm the name that other people on this project will see');
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Simon Says');
  }));

  it('does not show cancel button in a confirmation context', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.isConfirmContext = true;
    env.openDialog();
    expect(env.cancelButton).toBe(null);
    env.submitButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Simon Says');
  }));
});

class TestEnvironment {
  fixture: ComponentFixture<DialogOpenerComponent>;
  component: DialogOpenerComponent;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [DialogOpenerComponent],
      imports: [DialogTestModule, UICommonModule]
    });
    this.fixture = TestBed.createComponent(DialogOpenerComponent);
    this.component = this.fixture.componentInstance;
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get submitButton(): HTMLElement {
    return this.selectElement('#submit-button')!;
  }

  get cancelButton(): HTMLElement | null {
    return this.selectElement('#cancel-button');
  }

  get nameConfirmDialog(): HTMLElement {
    return this.selectElement('mdc-dialog')!;
  }

  get nameInput(): HTMLElement {
    return this.selectElement('#name-input')!;
  }

  get title(): HTMLElement {
    return this.selectElement('mdc-dialog-title')!;
  }

  get description(): HTMLElement {
    return this.selectElement('p')!;
  }

  openDialog(): void {
    const button = this.fixture.nativeElement.querySelector('button');
    button.click();
    this.fixture.detectChanges();
    // open dialog animation
    tick(166);
  }

  setTextFieldValue(element: Element, value: string) {
    const inputElem = element.querySelector('input') as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
  }

  private selectElement(selector: string): HTMLElement | null {
    return this.overlayContainerElement.querySelector(selector);
  }
}

@NgModule({
  imports: [UICommonModule, CommonModule, TestTranslocoModule],
  declarations: [EditNameDialogComponent],
  exports: [EditNameDialogComponent]
})
class DialogTestModule {}

@Component({
  template: `<button (click)="openDialog()"></button>`
})
class DialogOpenerComponent {
  publicName: string = 'Simon Says';
  isConfirmContext: boolean = false;
  confirmedName?: string;

  constructor(private readonly dialog: MdcDialog) {}

  openDialog() {
    const dialogRef = this.dialog.open(EditNameDialogComponent, {
      data: { name: this.publicName, isConfirmation: this.isConfirmContext }
    }) as MdcDialogRef<EditNameDialogComponent, EditNameDialogResult | 'close'>;
    dialogRef.afterClosed().subscribe(response => {
      this.confirmedName = response == null || response === 'close' ? undefined : response.displayName;
    });
  }
}
