import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { anything, mock, when } from 'ts-mockito';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { SharedModule } from '../../../shared/shared.module';
import { CheckingTextComponent } from './checking-text.component';

const mockedSFProjectService = mock(SFProjectService);

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
    providers: [{ provide: SFProjectService, useMock: mockedSFProjectService }]
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
});

class TestEnvironment {
  readonly component: CheckingTextComponent;
  readonly fixture: ComponentFixture<CheckingTextComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));
    this.setupProject();
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );

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

  isSegmentHighlighted(chapter: number, verse: number): boolean {
    const segment = this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
    return segment != null && segment.classList.contains('highlight-segment');
  }

  segmentHasQuestion(chapter: number, verse: number): boolean {
    const segment = this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
    return segment != null && segment.classList.contains('question-segment');
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  private addTextDoc(id: TextDocId): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_2` });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 4.`, { segment: `verse_${id.chapterNum}_4` });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_4/p_1` });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, `, { segment: `verse_${id.chapterNum}_5` });
    delta.insert('\n', { para: { style: 'p' } });
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }

  private setupProject(): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project 01',
        paratextId: 'target01',
        shortName: 'TRG',
        userRoles: { user01: SFProjectRole.ParatextTranslator, user02: SFProjectRole.ParatextConsultant },
        writingSystem: { tag: 'qaa' },
        translateConfig: {
          translationSuggestionsEnabled: false
        },
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific
        },
        sync: { queuedCount: 0 },
        texts: [
          {
            bookNum: 40,
            chapters: [
              { number: 1, lastVerse: 3, isValid: true },
              { number: 2, lastVerse: 3, isValid: true }
            ],
            hasSource: true
          }
        ]
      }
    });
  }
}
