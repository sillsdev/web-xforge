import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { OverlayContainer } from '@angular-mdc/web/overlay';
import { CommonModule } from '@angular/common';
import { Component, NgModule } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { EditNameDialogComponent, EditNameDialogResult } from './edit-name-dialog.component';

describe('EditNameDialogComponent', () => {
  it('should display name', () => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    expect(env.nameInput.querySelector('input')!.value).toBe('Simon Says');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Simon Says');
  });

  it('should allow user to change name', () => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Follow The Leader');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Follow The Leader');
  });

  it('should not allow the name to be blank', () => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, '');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, ' ');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Bob');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Bob');
  });

  it('shows messages in a confirmation context', () => {
    const env = new TestEnvironment();
    env.component.isConfirmContext = true;
    env.openDialog();
    expect(env.title.textContent).toBe('Confirm your name');
    expect(env.description.textContent).toContain('Confirm the name that other people on this project will see');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Simon Says');
  });
});

class TestEnvironment {
  fixture: ComponentFixture<DialogOpenerComponent>;
  component: DialogOpenerComponent;
  overlayContainer: OverlayContainer;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [DialogOpenerComponent],
      imports: [DialogTestModule, UICommonModule]
    });
    this.fixture = TestBed.createComponent(DialogOpenerComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
  }

  get confirmButton(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('button') as HTMLElement;
  }

  get nameConfirmDialog(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('mdc-dialog') as HTMLElement;
  }

  get nameInput(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#name-input') as HTMLElement;
  }

  get title(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('mdc-dialog-title') as HTMLElement;
  }

  get description(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('p') as HTMLElement;
  }

  openDialog(): void {
    const button = this.fixture.nativeElement.querySelector('button');
    button.click();
    this.fixture.detectChanges();
  }

  setTextFieldValue(element: Element, value: string) {
    const inputElem = element.querySelector('input') as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
  }
}

@NgModule({
  imports: [UICommonModule, CommonModule],
  declarations: [EditNameDialogComponent],
  entryComponents: [EditNameDialogComponent],
  exports: [EditNameDialogComponent]
})
class DialogTestModule {}

@Component({
  template: `
    <button (click)="openDialog()"></button>
  `
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
