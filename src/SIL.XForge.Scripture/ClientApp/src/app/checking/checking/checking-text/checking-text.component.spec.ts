import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { SharedModule } from '../../../shared/shared.module';
import { getCombinedVerseTextDoc, getSFProject, getTextDoc } from '../../../shared/test-utils';
import { CheckingTextComponent } from './checking-text.component';

const mockedPwaService = mock(PwaService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialogService = mock(DialogService);

describe('CheckingTextComponent', () => {
  configureTestingModule(() => ({
    declarations: [CheckingTextComponent],
    imports: [
      NoopAnimationsModule,
      SharedModule,
      UICommonModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestTranslocoModule
    ],
    providers: [
      { provide: PwaService, useMock: mockedPwaService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: DialogService, useMock: mockedDialogService }
    ]
  }));

  it('should move the question icon when the question moves verses', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.segmentHasQuestion(1, 1)).toBe(true);
    expect(env.isSegmentHighlighted(1, 1)).toBe(true);
    // verse 2 is blank
    expect(env.segmentHasQuestion(1, 3)).toBe(true);
    expect(env.isSegmentHighlighted(1, 3)).toBe(false);
    expect(env.segmentHasQuestion(1, 4)).toBe(false);
    expect(env.isSegmentHighlighted(1, 4)).toBe(false);

    // change 2nd question from v3 to v4
    env.component.questionVerses = [new VerseRef(40, 1, 1), new VerseRef(40, 1, 4)];

    env.wait();
    expect(env.segmentHasQuestion(1, 1)).toBe(true);
    expect(env.isSegmentHighlighted(1, 1)).toBe(true);
    expect(env.segmentHasQuestion(1, 3)).toBe(false);
    expect(env.isSegmentHighlighted(1, 3)).toBe(false);
    expect(env.segmentHasQuestion(1, 4)).toBe(true);
    expect(env.isSegmentHighlighted(1, 4)).toBe(false);
  }));

  it('should highlight the new verse when the question moves verses and is now active', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.segmentHasQuestion(1, 1)).toBe(true);
    expect(env.isSegmentHighlighted(1, 1)).toBe(true);
    // verse 2 is blank
    expect(env.segmentHasQuestion(1, 3)).toBe(true);
    expect(env.isSegmentHighlighted(1, 3)).toBe(false);
    expect(env.segmentHasQuestion(1, 4)).toBe(false);
    expect(env.isSegmentHighlighted(1, 4)).toBe(false);

    // change 2nd question from v3 to v4 and make it active
    const activeVerse = new VerseRef(40, 1, 4);
    env.component.activeVerse = activeVerse;
    env.component.questionVerses = [new VerseRef(40, 1, 1), activeVerse];

    env.wait();
    expect(env.segmentHasQuestion(1, 1)).toBe(true);
    expect(env.isSegmentHighlighted(1, 1)).toBe(false);
    expect(env.segmentHasQuestion(1, 3)).toBe(false);
    expect(env.isSegmentHighlighted(1, 3)).toBe(false);
    expect(env.segmentHasQuestion(1, 4)).toBe(true);
    expect(env.isSegmentHighlighted(1, 4)).toBe(true);
  }));

  it('highlights combined verse', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.id = new TextDocId('project01', 41, 1);
    env.component.questionVerses = [new VerseRef(41, 1, '2-3')];
    env.component.activeVerse = new VerseRef(41, 1, '2-3');
    env.wait();
    expect(env.segmentHasQuestion(1, 1)).toBe(false);
    expect(env.segmentHasQuestion(1, '2-3')).toBe(true);
    expect(env.isSegmentHighlighted(1, '2-3')).toBe(true);
  }));

  it('can set text direction explicitly', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.fixture.nativeElement.querySelector('quill-editor[class="read-only-editor ltr"')).not.toBeNull();
    env.component.isRightToLeft = true;
    env.wait();
    expect(env.fixture.nativeElement.querySelector('quill-editor[class="read-only-editor rtl"')).not.toBeNull();
  }));
});

class TestEnvironment {
  readonly component: CheckingTextComponent;
  readonly fixture: ComponentFixture<CheckingTextComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private isOnline: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

  constructor() {
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));
    this.addCombinedVerseTextDoc(new TextDocId('project01', 41, 1, 'target'));
    this.setupProject('project01');
    when(mockedSFProjectService.getProfile('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());

    this.fixture = TestBed.createComponent(CheckingTextComponent);
    this.component = this.fixture.componentInstance;
    this.component.id = new TextDocId('project01', 40, 1, 'target');
    const activeVerse = new VerseRef(40, 1, 1);
    this.component.activeVerse = activeVerse;
    this.component.questionVerses = [activeVerse, new VerseRef(40, 1, 3)];
  }

  get quillEditor(): HTMLElement {
    return document.getElementsByClassName('ql-container')[0] as HTMLElement;
  }

  get quillPlaceHolderText(): string {
    const editor = this.quillEditor.querySelector('.ql-editor');
    return editor == null ? '' : editor.attributes['data-placeholder'];
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline.next(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  isSegmentHighlighted(chapter: number, verse: number | string): boolean {
    const segment = this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
    return segment != null && segment.classList.contains('highlight-segment');
  }

  segmentHasQuestion(chapter: number, verse: number | string): boolean {
    const segment = this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
    return segment != null && segment.classList.contains('question-segment');
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  private addTextDoc(id: TextDocId): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: getTextDoc(id)
    });
  }

  private addCombinedVerseTextDoc(id: TextDocId): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: getCombinedVerseTextDoc(id)
    });
  }

  private setupProject(id: string): void {
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id,
      data: getSFProject(id)
    });
  }
}
