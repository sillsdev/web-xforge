import { MdcDialog } from '@angular-mdc/web';
import { OverlayContainer } from '@angular-mdc/web/overlay';
import { Component, NgModule, OnDestroy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CheckingNameDialogComponent } from './checking-name-dialog.component';

describe('CheckingNameDialogComponent', () => {
  let env: TestEnvironment;
  afterEach(() => env.component.ngOnDestroy());
  it('should display name', () => {
    env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    expect(env.nameInput.querySelector('input').value).toBe('Simon Says');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Simon Says');
  });

  it('should allow user to change name', () => {
    env = new TestEnvironment();
    env.openDialog();
    expect(env.component.confirmedName).toBeUndefined();
    env.setTextFieldValue(env.nameInput, 'Follow The Leader');
    env.confirmButton.click();
    env.fixture.detectChanges();
    expect(env.component.confirmedName).toBe('Follow The Leader');
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
    return oce.querySelector('button');
  }

  get nameConfirmDialog(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('mdc-dialog');
  }

  get nameInput(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#name-input');
  }

  openDialog(): void {
    const button = this.fixture.nativeElement.querySelector('button');
    button.click();
    this.fixture.detectChanges();
  }

  setTextFieldValue(element: HTMLElement, value: string) {
    const inputElem: HTMLInputElement = element.querySelector('input');
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
  }
}

@NgModule({
  imports: [UICommonModule],
  declarations: [CheckingNameDialogComponent],
  entryComponents: [CheckingNameDialogComponent],
  exports: [CheckingNameDialogComponent]
})
class DialogTestModule {}

@Component({
  template: `
    <button (click)="openDialog()"></button>
  `
})
class DialogOpenerComponent implements OnDestroy {
  subscription: Subscription;
  publicName: string = 'Simon Says';
  confirmedName: string;

  constructor(private readonly dialog: MdcDialog) {}

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
  openDialog() {
    const dialogRef = this.dialog.open(CheckingNameDialogComponent, { data: { name: this.publicName } });
    this.subscription = dialogRef.afterClosed().subscribe(response => {
      this.confirmedName = response as string;
    });
  }
}
