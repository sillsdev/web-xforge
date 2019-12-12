import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, instance, mock, spy, when } from 'ts-mockito';
import { DOCUMENT } from 'xforge-common/browser-globals';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CheckingModule } from '../checking/checking.module';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_REALTIME_DOC_TYPES } from '../core/models/sf-realtime-doc-types';
import { Delta, TextDoc } from '../core/models/text-doc';
import { SFProjectService } from '../core/sf-project.service';
import { TextChooserDialogComponent, TextChooserDialogData, TextSelection } from './text-chooser-dialog.component';

const mockedProjectService = mock(SFProjectService);
const mockedDocument = mock(Document);

describe('TextChooserDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: DOCUMENT, useMock: mockedDocument }
    ]
  }));

  it('allows switching chapters', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.headingText).toEqual('Matthew 1');
    env.click(env.selectChapter);
    expect(env.headingText).toEqual('Luke 1');
    env.closeDialog();
  }));

  it('shows an error if save is clicked with no text selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.selection = '';
    expect(env.errorMessage).toBeNull();
    env.click(env.saveButton);
    expect(env.errorMessage.textContent).toEqual('Select text to attach to your answer.');
    env.closeDialog();
  }));

  it('allows selecting text', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 1, end: 10 }, 'verse_1_2/p_1', 'verse_1_3');
    expect(env.selectedText).toEqual('');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('target: chapter… (MAT 1:3)');
    env.closeDialog();
  }));

  it("doesn't require the user to modify an existing selection", fakeAsync(async () => {
    const env = new TestEnvironment([], '', '', {
      bookNum: 40,
      chapterNum: 1,
      projectId: TestEnvironment.PROJECT01,
      textsByBookId: TestEnvironment.textsByBookId,
      selectedText: 'previously selected text',
      selectedVerses: {
        bookNum: 43,
        chapterNum: 1,
        verseNum: 2,
        verse: '2-3'
      }
    });
    env.selection = '';
    expect(env.selectedText).toEqual('previously selected text (JHN 1:2-3)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual('close');
  }));

  it('is cancelable', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.closeDialog();
    expect(await env.resultPromise).toEqual('close');
  }));

  it("doesn't clear the selection if the user selects nothing or white space", fakeAsync(async () => {
    const env = new TestEnvironment(
      [
        {
          start: 0,
          end: 1
        },
        {
          start: 0,
          end: 0
        }
      ],
      'verse_1_2',
      'verse_1_3',
      {
        bookNum: 40,
        chapterNum: 1,
        projectId: TestEnvironment.PROJECT01,
        textsByBookId: TestEnvironment.textsByBookId,
        selectedText: 'previously selected text',
        selectedVerses: {
          bookNum: 41,
          chapterNum: 1,
          verseNum: 2,
          verse: '2-3'
        }
      }
    );
    env.selection = '\n ';
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('previously selected text (MRK 1:2-3)');
    env.closeDialog();
  }));

  it('expands the selection to whole words', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 13, end: 1 }, 'verse_1_4', 'verse_1_5');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('…chapter 1, verse 4. rest of verse 4 target… (MAT 1:4-5)');
    env.closeDialog();
  }));

  it('can handle Arabic', fakeAsync(async () => {
    // 26 Unicode code points, but 38 JavaScript chars
    const env = new TestEnvironment({ start: 2, end: 38 }, 'verse_1_6', 'verse_1_6');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('وَقَعَتِ الأحْداثُ التّالِيَةُ فَي أيّامِ… (MAT 1:6)');
    env.closeDialog();
  }));

  it('indicates when not all segments of the end verse were selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 3, end: TestEnvironment.segmentLen(4) }, 'verse_1_3', 'verse_1_4');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('target: chapter 1, verse 3. target: chapter 1, verse 4.… (MAT 1:3-4)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 3, verse: '3-4' },
      text: 'target: chapter 1, verse 3. target: chapter 1, verse 4.',
      startClipped: false,
      endClipped: true
    });
  }));

  it('indicates when not all segments of the start verse were selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 0, end: TestEnvironment.segmentLen(5) }, 'verse_1_4/p_1', 'verse_1_5');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('…rest of verse 4 target: chapter 1, (MAT 1:4-5)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 4, verse: '4-5' },
      text: 'rest of verse 4 target: chapter 1,',
      startClipped: true,
      endClipped: false
    });
  }));

  it('indicates when the segments were only partially selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 6, end: TestEnvironment.segmentLen(5) - 2 }, 'verse_1_4', 'verse_1_5');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('…: chapter 1, verse 4. rest of verse 4 target: chapter 1… (MAT 1:4-5)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 4, verse: '4-5' },
      text: ': chapter 1, verse 4. rest of verse 4 target: chapter 1',
      startClipped: true,
      endClipped: true
    });
  }));

  it('shows the correct verse range when first or last segment has only white space selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: TestEnvironment.segmentLen(7) - 1, end: 1 }, 'verse_1_7', 'verse_1_9');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('target: chapter 1, verse 8. (MAT 1:8)');
    env.closeDialog();
  }));

  it('it correctly deals with the last selected segment being blank', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 0, end: 2 }, 'verse_1_8', 'verse_1_9');
    expect(() => env.fireSelectionChange()).not.toThrow();
    expect(env.selectedText).toEqual('target: chapter 1, verse 8. (MAT 1:8)');
    env.closeDialog();
  }));

  it("doesn't allow selecting whitespace", fakeAsync(() => {
    const env = new TestEnvironment({ start: TestEnvironment.segmentLen(7) - 1, end: 1 }, 'verse_1_7', 'verse_1_8');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('');
    env.closeDialog();
  }));

  it('can handle selection of only whitespace', fakeAsync(() => {
    const env = new TestEnvironment(
      { start: TestEnvironment.segmentLen(7) - 1, end: TestEnvironment.segmentLen(7) },
      'verse_1_7',
      'verse_1_7'
    );
    expect(() => env.fireSelectionChange()).not.toThrow();
    expect(env.selectedText).toEqual('');
    env.closeDialog();
  }));

  it('can handle selections starting or ending outside the text', fakeAsync(() => {
    const env = new TestEnvironment(
      { start: 25, end: 3 },
      // this isn't the same as the selection starting and ending outside the text, but it will be handled the same
      'selector that will not select anything',
      'another selector that will not select anything'
    );
    expect(() => env.fireSelectionChange()).not.toThrow();
    expect(env.selectedText).toEqual('');
    env.closeDialog();
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
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, CheckingModule, TestTranslocoModule],
  exports: [ViewContainerDirective, ChildViewContainerComponent],
  declarations: [ViewContainerDirective, ChildViewContainerComponent],
  entryComponents: [ChildViewContainerComponent, TextChooserDialogComponent]
})
class DialogTestModule {}

interface Range {
  start: number;
  end: number;
}

class TestEnvironment {
  static PROJECT01: string = 'project01';
  static matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [{ number: 1, lastVerse: 25, isValid: true }, { number: 3, lastVerse: 17, isValid: true }]
  };
  static textsByBookId = { ['MAT']: TestEnvironment.matthewText };
  static testProject: SFProject = {
    paratextId: 'pt01',
    shortName: 'P01',
    name: 'Project 01',
    writingSystem: { tag: 'en' },
    translateConfig: { translationSuggestionsEnabled: false },
    checkingConfig: {
      usersSeeEachOthersResponses: true,
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone
    },
    texts: [TestEnvironment.matthewText],
    sync: { queuedCount: 0 },
    userRoles: {
      user01: SFProjectRole.ParatextAdministrator
    }
  };

  static defaultDialogData = {
    bookNum: 40,
    chapterNum: 1,
    projectId: TestEnvironment.PROJECT01,
    textsByBookId: TestEnvironment.textsByBookId
  };

  static segmentLen(verseNumber: number): number {
    return TestEnvironment.delta.filter(op => {
      return op.attributes != null && op.attributes.segment === 'verse_1_' + verseNumber;
    })[0].insert.length;
  }

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly overlayContainerElement: HTMLElement;
  readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  readonly mockedScriptureChooserMdcDialogRef = mock(MdcDialogRef);

  readonly resultPromise: Promise<TextSelection | 'close'>;
  selectionChangeHandler!: () => any;
  selection = 'changed'; // could be anything other than white space; just has to make it appear selection has changed

  constructor(
    ranges: Range | Range[] = [],
    startSegment = 'verse_1_1',
    endSegment = 'verse_1_2',
    dialogData?: TextChooserDialogData
  ) {
    ranges = Array.isArray(ranges) ? ranges : [ranges];
    when(mockedDocument.getSelection()).thenCall(() => {
      return {
        toString: () => this.selection,
        rangeCount: (ranges as Range[]).length,
        getRangeAt: (index: number) => {
          return {
            startOffset: ranges[index].start,
            endOffset: ranges[index].end,
            startContainer: this.editor.querySelector(`usx-segment[data-segment="${startSegment}"]`),
            endContainer: this.editor.querySelector(`usx-segment[data-segment="${endSegment}"]`)
          } as any;
        },
        containsNode: (node: Node): boolean => {
          const segments = Array.from(this.editor.querySelectorAll('usx-segment[data-segment^="verse_"]'));
          let startingSegmentReached = false;
          for (const segment of segments) {
            if (segment.getAttribute('data-segment') === startSegment) {
              startingSegmentReached = true;
            }
            if (startingSegmentReached && segment.contains(node)) {
              return true;
            }
            if (segment.getAttribute('data-segment') === endSegment) {
              break;
            }
          }
          return false;
        }
      } as Selection;
    });

    when(mockedDocument.addEventListener('selectionchange', anything())).thenCall(
      (_event: string, callback: () => any) => {
        this.selectionChangeHandler = callback;
      }
    );

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);

    const config: TextChooserDialogData = dialogData || TestEnvironment.defaultDialogData;

    this.addTextDoc(config.bookNum);

    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: TestEnvironment.PROJECT01,
      data: TestEnvironment.testProject
    });

    when(mockedProjectService.get(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id)
    );
    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );

    const dialogRef = TestBed.get(MdcDialog).open(TextChooserDialogComponent, { data: config });
    this.resultPromise = dialogRef.afterClosed().toPromise();

    this.overlayContainerElement = TestBed.get(OverlayContainer).getContainerElement();

    // Set up MdcDialog mocking after it's already used above in creating the component.
    const dialogSpy = spy(dialogRef.componentInstance.dialog);
    when(dialogSpy.open(anything(), anything())).thenReturn(instance(this.mockedScriptureChooserMdcDialogRef));
    const chooserDialogResult = new VerseRef('LUK', '1', '2');
    when(this.mockedScriptureChooserMdcDialogRef.afterClosed()).thenReturn(of(chooserDialogResult));

    this.fixture.detectChanges();
    flush();
  }

  get saveButton(): HTMLButtonElement {
    return this.select('button[type="submit"]') as HTMLButtonElement;
  }

  get cancelButton(): HTMLButtonElement {
    return this.select('button[data-mdc-dialog-action="close"]') as HTMLButtonElement;
  }

  get headingText() {
    return this.select('.select-chapter h2').textContent!;
  }

  get selectChapter() {
    return this.select('.select-chapter') as HTMLButtonElement;
  }

  get errorMessage() {
    return this.select('.error-message');
  }

  get selectedText() {
    // trim because template adds white space around the text
    return this.select('.selection-preview').textContent!.trim();
  }

  get editor() {
    return this.select('quill-editor');
  }

  select(query: string) {
    return this.overlayContainerElement.querySelector(query)!;
  }

  fireSelectionChange() {
    this.selectionChangeHandler();
    this.fixture.detectChanges();
  }

  closeDialog() {
    this.cancelButton.click();
    flush();
  }

  click(button: HTMLButtonElement) {
    button.click();
    this.fixture.detectChanges();
  }

  static get delta() {
    const delta = new Delta();
    delta.insert({ chapter: { number: '1', style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert('target: chapter 1, verse 1.', { segment: 'verse_1_1' });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: true }, { segment: 'verse_1_2' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: 'verse_1_2/p_1' });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert('target: chapter 1, verse 3.', { segment: 'verse_1_3' });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert('target: chapter 1, verse 4.', { segment: 'verse_1_4' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert('rest of verse 4', { segment: 'verse_1_4/p_1' });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert('target: chapter 1, ', { segment: 'verse_1_5' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ verse: { number: '6', style: 'v' } });
    delta.insert('وَقَعَتِ الأحْداثُ التّالِيَةُ فَي أيّامِ أحَشْوِيرُوشَ.', { segment: 'verse_1_6' });
    delta.insert({ verse: { number: '7', style: 'v' } });
    delta.insert('target: chapter 1, verse 7. ', { segment: 'verse_1_7' });
    delta.insert({ verse: { number: '8', style: 'v' } });
    delta.insert(' target: chapter 1, verse 8. ', { segment: 'verse_1_8' });
    delta.insert({ verse: { number: '9', style: 'v' } });
    delta.insert({ blank: true }, { segment: 'verse_1_9' });
    return delta;
  }

  private addTextDoc(bookNum: number): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: getTextDocId(TestEnvironment.PROJECT01, bookNum, 1, 'target'),
      type: RichText.type.name,
      data: TestEnvironment.delta
    });
  }
}
