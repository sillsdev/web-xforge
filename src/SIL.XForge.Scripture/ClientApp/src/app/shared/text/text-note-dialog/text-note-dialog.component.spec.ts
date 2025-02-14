import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  matDialogCloseDelay,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { NoteDialogData, TextNoteDialogComponent, TextNoteType } from './text-note-dialog.component';

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
    env = new TestEnvironment({ type: TextNoteType.Footnote, text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.footnote');
    expect(env.text).toBe(text);
  }));

  it('Displays extended footnotes', fakeAsync(() => {
    const text = 'Footnote text';
    env = new TestEnvironment({ type: TextNoteType.ExtendedFootnote, text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.footnote');
    expect(env.text).toBe(text);
  }));

  it('Displays end notes', fakeAsync(() => {
    const text = 'End note text';
    env = new TestEnvironment({ type: TextNoteType.EndNote, text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.end_note');
    expect(env.text).toBe(text);
  }));

  it('Displays cross-references', fakeAsync(() => {
    const text = 'Cross-reference text';
    env = new TestEnvironment({ type: TextNoteType.CrossReference, text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.cross_reference');
    expect(env.text).toBe(text);
  }));

  it('Displays extended cross-references', fakeAsync(() => {
    const text = 'Cross-reference text';
    env = new TestEnvironment({ type: TextNoteType.ExtendedCrossReference, text, isRightToLeft: false });
    expect(env.title).toBe('text_note_dialog.cross_reference');
    expect(env.text).toBe(text);
  }));
});

@NgModule({
  imports: [UICommonModule, TestTranslocoModule],
  declarations: [TextNoteDialogComponent]
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
    return this.overlayContainerElement.query(By.css('h1 span'))!.nativeElement.textContent.trim();
  }

  get text(): string {
    return this.overlayContainerElement.query(By.css('mat-dialog-content'))!.nativeElement.textContent.trim();
  }

  closeDialog(): void {
    this.overlayContainerElement.query(By.css('button[mat-dialog-close]')).nativeElement.click();
    this.fixture.detectChanges();
    tick(matDialogCloseDelay);
  }
}
