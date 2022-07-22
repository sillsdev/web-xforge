import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { configureTestingModule, matDialogCloseDelay, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { TextNoteDialogComponent, NoteDialogData } from './text-note-dialog.component';

describe('TextNoteDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule]
  }));
  let env: TestEnvironment;

  afterEach(fakeAsync(() => {
    env.closeDialog();
  }));

  it('Displays footnotes', fakeAsync(() => {
    const text = 'Footnote text';
    env = new TestEnvironment({ type: 'f', text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.footnote');
    expect(env.text).toBe(text);
  }));

  it('Displays cross-references', fakeAsync(() => {
    const text = 'End note text';
    env = new TestEnvironment({ type: 'fe', text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.end_note');
    expect(env.text).toBe(text);
  }));

  it('Displays end notes', fakeAsync(() => {
    const text = 'Cross-reference text';
    env = new TestEnvironment({ type: 'x', text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.cross_reference');
    expect(env.text).toBe(text);
  }));
});

@Directive({
  // es lint complains that a directive should be used as an attribute
  // eslint-disable-next-line @angular-eslint/directive-selector
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
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [UICommonModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, TextNoteDialogComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, TextNoteDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  fixture: ComponentFixture<ChildViewContainerComponent>;
  component: TextNoteDialogComponent;
  dialogRef: MatDialogRef<TextNoteDialogComponent>;

  constructor(configData: NoteDialogData) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(TextNoteDialogComponent, { data: configData });
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
    tick();
  }

  get overlayContainerElement(): DebugElement {
    return this.fixture.debugElement.parent!.query(By.css('.cdk-overlay-container'));
  }

  get title(): string {
    return this.overlayContainerElement.query(By.css('h1 span'))!.nativeElement.innerHTML.trim();
  }

  get text(): string {
    return this.overlayContainerElement.query(By.css('mat-dialog-content'))!.nativeElement.innerHTML.trim();
  }

  closeDialog(): void {
    this.overlayContainerElement.query(By.css('button[mat-dialog-close]')).nativeElement.click();
    this.fixture.detectChanges();
    tick(matDialogCloseDelay);
  }
}
