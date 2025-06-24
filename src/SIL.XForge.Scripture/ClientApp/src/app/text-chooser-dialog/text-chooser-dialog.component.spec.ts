import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VerseRef } from '@sillsdev/scripture';
import { CookieService } from 'ngx-cookie-service';
import { Delta } from 'quill';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import * as RichText from 'rich-text';
import { firstValueFrom, of } from 'rxjs';
import { anything, instance, mock, spy, when } from 'ts-mockito';
import { DOCUMENT } from 'xforge-common/browser-globals';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { ChildViewContainerComponent, configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { CheckingModule } from '../checking/checking.module';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { TextDoc } from '../core/models/text-doc';
import { SharedModule } from '../shared/shared.module';
import { TextChooserDialogComponent, TextChooserDialogData, TextSelection } from './text-chooser-dialog.component';

const mockedDocument = mock(Document);
const mockedUserService = mock(UserService);

describe('TextChooserDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [
      DialogTestModule,
      NoopAnimationsModule,
      SharedModule.forRoot(),
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: DOCUMENT, useMock: mockedDocument },
      { provide: CookieService, useMock: mock(CookieService) },
      { provide: UserService, useMock: mockedUserService }
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
    expect(env.errorMessage.textContent).toEqual('Select verses to attach to your answer.');
    env.closeDialog();
  }));

  it('allows selecting text', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 1, end: 10 }, 'verse_1_2/p_1', 'verse_1_3');
    expect(env.component.isTextRightToLeft).toBe(false);
    expect(env.selectedText).toEqual('');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('target: chapter… (Matthew 1:3)');
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
    expect(env.selectedText).toEqual('previously selected text (John 1:2-3)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual('close');
    flush();
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
    expect(env.selectedText).toEqual('previously selected text (Mark 1:2-3)');
    env.closeDialog();
  }));

  it('expands the selection to whole words', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 13, end: 1 }, 'verse_1_4', 'verse_1_5');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('…chapter 1, verse 4. rest of verse 4 target… (Matthew 1:4-5)');
    env.closeDialog();
  }));

  it('can handle Arabic', fakeAsync(async () => {
    // 26 Unicode code points, but 38 JavaScript chars
    const env = new TestEnvironment({ start: 2, end: 38 }, 'verse_1_6', 'verse_1_6');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('وَقَعَتِ الأحْداثُ التّالِيَةُ فَي أيّامِ… (Matthew 1:6)');
    env.closeDialog();
  }));

  it('indicates when not all segments of the end verse were selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 3, end: TestEnvironment.segmentLen(4) }, 'verse_1_3', 'verse_1_4');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('target: chapter 1, verse 3. target: chapter 1, verse 4.… (Matthew 1:3-4)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 3, verse: '3-4' },
      text: 'target: chapter 1, verse 3. target: chapter 1, verse 4.',
      startClipped: false,
      endClipped: true
    });
    flush();
  }));

  it('indicates when not all segments of the start verse were selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 0, end: TestEnvironment.segmentLen(5) }, 'verse_1_4/p_1', 'verse_1_5');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('…rest of verse 4 target: chapter 1, (Matthew 1:4-5)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 4, verse: '4-5' },
      text: 'rest of verse 4 target: chapter 1,',
      startClipped: true,
      endClipped: false
    });
    flush();
  }));

  it(
    'indicates when not all of the start verse was selected ' +
      'because only whitespace was selected in the first segment',
    fakeAsync(async () => {
      const env = new TestEnvironment({ start: TestEnvironment.segmentLen(4), end: 15 }, 'verse_1_4', 'verse_1_4/p_1');
      env.fireSelectionChange();
      expect(env.selectedText).toEqual('…rest of verse 4 (Matthew 1:4)');
      env.click(env.saveButton);
      expect(await env.resultPromise).toEqual({
        verses: { bookNum: 40, chapterNum: 1, verseNum: 4, verse: '4' },
        text: 'rest of verse 4',
        startClipped: true,
        endClipped: false
      });
      flush();
    })
  );

  it(
    'indicates when not all of the end verse was selected ' +
      'because only whitespace was selected in the last segment',
    fakeAsync(async () => {
      const env = new TestEnvironment({ start: 0, end: 0 }, 'verse_1_3', 'verse_1_4/p_1');
      env.fireSelectionChange();
      expect(env.selectedText).toEqual('target: chapter 1, verse 3. target: chapter 1, verse 4.… (Matthew 1:3-4)');
      env.click(env.saveButton);
      expect(await env.resultPromise).toEqual({
        verses: { bookNum: 40, chapterNum: 1, verseNum: 3, verse: '3-4' },
        text: 'target: chapter 1, verse 3. target: chapter 1, verse 4.',
        startClipped: false,
        endClipped: true
      });
      flush();
    })
  );

  it('indicates when the segments were only partially selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 6, end: TestEnvironment.segmentLen(5) - 2 }, 'verse_1_4', 'verse_1_5');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('…: chapter 1, verse 4. rest of verse 4 target: chapter 1… (Matthew 1:4-5)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 4, verse: '4-5' },
      text: ': chapter 1, verse 4. rest of verse 4 target: chapter 1',
      startClipped: true,
      endClipped: true
    });
    flush();
  }));

  it("doesn't show ending ellipsis when entire verse is selected", fakeAsync(async () => {
    const env = new TestEnvironment({ start: 4, end: TestEnvironment.segmentLen(10) - 1 }, 'verse_1_10', 'verse_1_10');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('verse ten (Matthew 1:10)');
    env.click(env.saveButton);
    expect(await env.resultPromise).toEqual({
      verses: { bookNum: 40, chapterNum: 1, verseNum: 10, verse: '10' },
      text: 'verse ten',
      startClipped: false,
      endClipped: false
    });
    flush();
  }));

  it('shows the correct verse range when first or last segment has only white space selected', fakeAsync(async () => {
    const env = new TestEnvironment({ start: TestEnvironment.segmentLen(7) - 1, end: 1 }, 'verse_1_7', 'verse_1_9');
    env.fireSelectionChange();
    expect(env.selectedText).toEqual('target: chapter 1, verse 8. (Matthew 1:8)');
    env.closeDialog();
  }));

  it('it correctly deals with the last selected segment being blank', fakeAsync(async () => {
    const env = new TestEnvironment({ start: 0, end: 2 }, 'verse_1_8', 'verse_1_9');
    expect(() => env.fireSelectionChange()).not.toThrow();
    expect(env.selectedText).toEqual('target: chapter 1, verse 8. (Matthew 1:8)');
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

  it('can handle selections starting outside the text', fakeAsync(() => {
    const env = new TestEnvironment({ start: 5, end: 3 }, 'p_1', 'verse_1_1');
    expect(() => env.fireSelectionChange()).not.toThrow();
    expect(env.selectedText).toEqual('target… (Matthew 1:1)');
    env.closeDialog();
  }));

  it('calculates text content correctly', fakeAsync(() => {
    const env = new TestEnvironment();
    const element = env.elementFromHtml(
      '<usx-segment data-segment="verse_1_1">Here <usx-note>be</usx-note> text</usx-segment>'
    );
    expect(env.component.textContent(element)).toEqual('Here  text');
    let dividingNode = element.childNodes[1];
    expect(dividingNode.textContent).toEqual('be');
    expect(env.component.textContent(element, dividingNode, 0, true)).toEqual(' text');
    expect(env.component.textContent(element, dividingNode, 0, false)).toEqual('Here ');
    dividingNode = element.childNodes[2];
    expect(dividingNode.textContent).toEqual(' text');
    expect(env.component.textContent(element, dividingNode, 3, true)).toEqual('xt');
    expect(env.component.textContent(element, dividingNode, 3, false)).toEqual('Here  te');
    env.closeDialog();
  }));

  it('calculates range offsets correctly', fakeAsync(() => {
    const env = new TestEnvironment();
    let element = env.elementFromHtml(
      '<usx-segment data-segment="verse_1_1">Here <usx-note>be</usx-note> text</usx-segment>'
    );
    const mockedSelection = mock(Selection);
    when(mockedSelection.getRangeAt(anything())).thenReturn({
      startContainer: element.childNodes[0] as Node,
      endContainer: element.childNodes[2] as Node,
      startOffset: 'Her'.length,
      endOffset: ' text'.length
    } as Range);
    expect(env.component.rangeOffsets(instance(mockedSelection), [element])).toEqual({
      startOffset: 'Her'.length,
      endOffset: 'Here  text'.length
    });

    element = env.elementFromHtml('<usx-segment data-segment="verse_1_1">Lorem ipsum</usx-segment>');
    when(mockedSelection.getRangeAt(anything())).thenReturn({
      startContainer: element.firstChild as Node,
      endContainer: element.firstChild as Node,
      startOffset: 'Lor'.length,
      endOffset: 'Lorem ipsum'.length
    } as Range);
    expect(env.component.rangeOffsets(instance(mockedSelection), [element])).toEqual({
      startOffset: 'Lor'.length,
      endOffset: 'Lorem ipsum'.length
    });
    env.closeDialog();
  }));

  it('can handle right to left text', fakeAsync(() => {
    const config: TextChooserDialogData = { ...TestEnvironment.defaultDialogData, isRightToLeft: true };
    const env = new TestEnvironment([], 'verse_1_1', 'verse_1_2', config);
    expect(env.component.isTextRightToLeft).toBe(true);
    env.closeDialog();
  }));
});

@NgModule({
  imports: [CheckingModule]
})
class DialogTestModule {}

interface SimpleRange {
  start: number;
  end: number;
}

class TestEnvironment {
  static PROJECT01: string = 'project01';
  static matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [
      { number: 1, lastVerse: 25, isValid: true, permissions: {} },
      { number: 3, lastVerse: 17, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  static textsByBookId = { ['MAT']: TestEnvironment.matthewText };
  static testProject: SFProjectProfile = createTestProjectProfile({ texts: [TestEnvironment.matthewText] });

  static defaultDialogData = {
    bookNum: 40,
    chapterNum: 1,
    projectId: TestEnvironment.PROJECT01,
    textsByBookId: TestEnvironment.textsByBookId
  };

  static segmentLen(verseNumber: number): number {
    return TestEnvironment.delta!.filter(
      op => op.attributes != null && op.attributes.segment === 'verse_1_' + verseNumber
    )[0].insert!.length as number;
  }

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  readonly mockedScriptureChooserMatDialogRef = mock(MatDialogRef);

  readonly resultPromise: Promise<TextSelection | 'close'>;
  selectionChangeHandler!: () => any;
  selection = 'changed'; // could be anything other than white space; just has to make it appear selection has changed

  component: TextChooserDialogComponent;

  constructor(
    ranges: SimpleRange | SimpleRange[] = [],
    startSegment = 'verse_1_1',
    endSegment = 'verse_1_2',
    dialogData?: TextChooserDialogData
  ) {
    ranges = Array.isArray(ranges) ? ranges : [ranges];
    when(mockedDocument.getSelection()).thenCall(
      () =>
        ({
          toString: () => this.selection,
          rangeCount: (ranges as SimpleRange[]).length,
          getRangeAt: (index: number) =>
            ({
              startOffset: ranges[index].start,
              endOffset: ranges[index].end,
              startContainer: this.editor.querySelector(`usx-segment[data-segment="${startSegment}"]`)!.firstChild,
              endContainer: this.editor.querySelector(`usx-segment[data-segment="${endSegment}"]`)!.firstChild
            }) as any,
          containsNode: (node: Node): boolean => {
            const segments = Array.from(this.editor.querySelectorAll('usx-segment[data-segment]'));
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
        }) as Selection
    );

    when(mockedDocument.addEventListener('selectionchange', anything(), anything())).thenCall(
      (_event: string, callback: () => any) => {
        this.selectionChangeHandler = callback;
      }
    );

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);

    const config: TextChooserDialogData = dialogData || TestEnvironment.defaultDialogData;

    this.addTextDoc(config.bookNum);

    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: TestEnvironment.PROJECT01,
      data: TestEnvironment.testProject
    });
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: createTestUser({
        sites: {
          sf: {
            projects: [TestEnvironment.PROJECT01]
          }
        }
      })
    });

    const dialogRef = TestBed.inject(MatDialog).open(TextChooserDialogComponent, { data: config });
    this.component = dialogRef.componentInstance;
    this.resultPromise = firstValueFrom(dialogRef.afterClosed());

    // Set up DialogService mocking after it's already used above in creating the component.
    const dialogSpy = spy(this.component.dialogService);
    when(dialogSpy.openMatDialog(anything(), anything())).thenReturn(instance(this.mockedScriptureChooserMatDialogRef));
    const chooserDialogResult = new VerseRef('LUK', '1', '2');
    when(this.mockedScriptureChooserMatDialogRef.afterClosed()).thenReturn(of(chooserDialogResult));
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );

    this.fixture.detectChanges();
    flush();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get saveButton(): HTMLButtonElement {
    return this.select('button[type="submit"]') as HTMLButtonElement;
  }

  get cancelButton(): HTMLButtonElement {
    return this.select('#cancel-button') as HTMLButtonElement;
  }

  get headingText(): string {
    return this.select('.select-chapter h2').textContent!;
  }

  get selectChapter(): HTMLButtonElement {
    return this.select('.select-chapter') as HTMLButtonElement;
  }

  get errorMessage(): Element {
    return this.select('.error-message');
  }

  get selectedText(): string {
    // trim because template adds white space around the text
    return this.select('.selection-preview').textContent!.trim();
  }

  get editor(): Element {
    return this.select('quill-editor');
  }

  select(query: string): Element {
    return this.overlayContainerElement.querySelector(query)!;
  }

  fireSelectionChange(): void {
    this.selectionChangeHandler();
    tick(100); // event handler debounce time
    this.fixture.detectChanges();
  }

  closeDialog(): void {
    this.cancelButton.click();
    flush();
  }

  click(button: HTMLButtonElement): void {
    button.click();
    this.fixture.detectChanges();
  }

  elementFromHtml(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild! as Element;
  }

  static get delta(): Delta {
    const delta = new Delta();
    delta.insert({ chapter: { number: '1', style: 'c' } });
    delta.insert('heading text', { para: { style: 'p' } });
    delta.insert('', { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert('target: chapter 1, verse 1.', { segment: 'verse_1_1' });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert('', { segment: 'verse_1_2' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert('', { segment: 'verse_1_2/p_1' });
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
    delta.insert('', { segment: 'verse_1_9' });
    delta.insert({ verse: { number: '10', style: 'v' } });
    delta.insert('verse ten', { segment: 'verse_1_10' });
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
