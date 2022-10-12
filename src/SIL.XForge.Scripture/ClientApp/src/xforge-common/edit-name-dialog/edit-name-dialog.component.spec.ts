import { CommonModule } from '@angular/common';
import { Component, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { mock } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { EditNameDialogComponent, EditNameDialogResult } from './edit-name-dialog.component';

const mockedI18nService = mock(I18nService);

describe('EditNameDialogComponent', () => {
  configureTestingModule(() => ({
    providers: [DialogService, { provide: I18nService, useMock: mockedI18nService }]
  }));

  it('should display name and cancel button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    expect(env.nameInput.value).toBe('Simon Says');
    expect(env.cancelButton).not.toBe(null);
    env.clickSubmit();
    expect(env.component.confirmedName).toBe('Simon Says');
  }));

  it('should allow user to change name', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Follow The Leader');
    env.clickSubmit();
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
    tick();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, ' ');
    env.submitButton.click();
    tick();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Bob');
    env.submitButton.click();
    tick();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Bob');
  }));

  it('shows messages in a confirmation context', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.isConfirmContext = true;
    env.openDialog();
    expect(env.title.textContent).toBe('Confirm your name');
    expect(env.description.textContent).toContain('Confirm the name that other people on this project will see');
    env.clickSubmit();
    expect(env.component.confirmedName).toBe('Simon Says');
  }));

  it('does not show cancel button in a confirmation context', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.isConfirmContext = true;
    env.openDialog();
    expect(env.cancelButton).toBe(null);
    env.clickSubmit();
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

  get nameInput(): HTMLInputElement {
    return this.selectElement('input')! as HTMLInputElement;
  }

  get title(): HTMLElement {
    return this.selectElement('h1')!;
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

  clickSubmit(): void {
    this.submitButton.click();
    tick();
    this.fixture.detectChanges();
  }

  setTextFieldValue(element: HTMLInputElement, value: string) {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
  }

  private selectElement(selector: string): HTMLElement | null {
    return this.overlayContainerElement.querySelector(selector);
  }
}

@NgModule({
  imports: [UICommonModule, CommonModule, TestTranslocoModule, NoopAnimationsModule],
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

  constructor(private readonly dialogService: DialogService) {}

  openDialog() {
    const dialogRef = this.dialogService.openMatDialog(EditNameDialogComponent, {
      data: { name: this.publicName, isConfirmation: this.isConfirmContext }
    }) as MatDialogRef<EditNameDialogComponent, EditNameDialogResult | 'close'>;
    dialogRef.afterClosed().subscribe(response => {
      this.confirmedName = response == null || response === 'close' ? undefined : response.displayName;
    });
  }
}
