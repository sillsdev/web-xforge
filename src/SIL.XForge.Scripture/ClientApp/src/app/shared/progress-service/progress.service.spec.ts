import { NgZone } from '@angular/core';
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { NoticeService } from 'xforge-common/notice.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { ProgressService, TextProgress } from './progress.service';

const mockSFProjectService = mock(SFProjectService);
const mockNoticeService = mock(NoticeService);
const mockPermissionService = mock(PermissionsService);
const mockProjectService = mock(ActivatedProjectService);

describe('progress service', () => {
  configureTestingModule(() => ({
    imports: [TestOnlineStatusModule.forRoot()],
    providers: [
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: PermissionsService, useMock: mockPermissionService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: ActivatedProjectService, useMock: mockProjectService }
    ]
  }));

  it('populates progress and texts on construction', fakeAsync(() => {
    // Create segments for 20 chapters multiplied by 20 books
    const env = new TestEnvironment(3600, 2000);
    // Override the verse counts to be less half the number created for each book
    spyOn(TextProgress.prototype as any, 'getVerseCount').and.callFake(() => 200);
    const calculate = spyOn<any>(env.service, 'calculateProgress').and.callThrough();

    tick();

    expect(env.service.overallProgress.translated).toEqual(3600);
    expect(env.service.overallProgress.notTranslated).toEqual(2000);
    expect(env.service.overallProgress.blank).toEqual(2000);
    expect(env.service.overallProgress.total).toEqual(5600);
    expect(env.service.overallProgress.percentage).toEqual(64);
    expect(env.service.texts.length).toBeGreaterThan(0);
    let i = 0;
    for (const book of env.service.texts) {
      expect(book.text.bookNum).toEqual(++i);
      expect(book.numberOfVerses).toEqual(200);
      expect(book.useNumberOfVerses).toEqual(false);
      expect(book.blank).toEqual(100);
      expect(book.translated).toEqual(180);
      expect(book.total).toEqual(280);
      expect(book.text.chapters.length).toBeGreaterThan(0);
      let j = 0;
      for (const chapter of book.text.chapters) {
        expect(chapter.number).toEqual(j++);
      }
    }
    expect(calculate).toHaveBeenCalledTimes(1);

    discardPeriodicTasks();
  }));

  it('re-initializes when project changes', fakeAsync(() => {
    const env = new TestEnvironment(100, 50);
    tick();

    const initialize = spyOn<any>(env.service, 'initialize').and.callThrough();

    when(env.mockProject.id).thenReturn('project02');
    env.project$.next(instance(env.mockProject));
    tick();

    expect(initialize).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  it('updates total progress when chapter content changes', fakeAsync(async () => {
    const env = new TestEnvironment();
    const changeEvent = new BehaviorSubject({});
    when(mockSFProjectService.getText(deepEqual(new TextDocId('project01', 1, 2, 'target')))).thenCall(() => {
      return {
        getSegmentCount: () => {
          return { translated: 12, blank: 2 };
        },
        getNonEmptyVerses: () => env.createVerses(12),
        changes$: changeEvent
      };
    });

    tick();

    // mock a change
    when(mockSFProjectService.getText(deepEqual(new TextDocId('project01', 1, 2, 'target')))).thenCall(() => {
      return {
        getSegmentCount: () => {
          return { translated: 13, blank: 1 };
        },
        getNonEmptyVerses: () => env.createVerses(13),
        changes$: changeEvent
      };
    });

    const originalProgress = env.service.overallProgress.translated;
    tick(1000); // wait for the throttle time

    changeEvent.next({});

    expect(env.service.overallProgress.translated).toEqual(originalProgress + 1);
    discardPeriodicTasks();
  }));

  it('uses the verse counts when there are too few segments', fakeAsync(() => {
    const env = new TestEnvironment(5, 1);
    tick();

    expect(env.service.overallProgress.translated).toEqual(5);
    expect(env.service.overallProgress.notTranslated).toEqual(17380);
    expect(env.service.overallProgress.blank).toEqual(17380);
    expect(env.service.overallProgress.total).toEqual(17385);
    expect(env.service.overallProgress.percentage).toEqual(0);
    expect(env.service.texts.length).toBeGreaterThan(0);
    let i = 0;
    for (const book of env.service.texts) {
      expect(book.text.bookNum).toEqual(++i);
      expect(book.useNumberOfVerses).toEqual(true);
      expect(book.total).toEqual(book.numberOfVerses);
      expect(book.text.chapters.length).toBeGreaterThan(0);
    }

    discardPeriodicTasks();
  }));

  it('can train suggestions', fakeAsync(async () => {
    const env = new TestEnvironment();
    tick();

    expect(env.service.canTrainSuggestions).toBeTruthy();
    discardPeriodicTasks();
  }));

  it('cannot train suggestions if too few segments', fakeAsync(async () => {
    const env = new TestEnvironment(9);
    tick();

    expect(env.service.canTrainSuggestions).toBeFalsy();
    discardPeriodicTasks();
  }));

  it('cannot train suggestions if no source permission', fakeAsync(async () => {
    const env = new TestEnvironment();
    when(
      mockPermissionService.canAccessText(deepEqual(new TextDocId('sourceId', anything(), anything(), 'target')))
    ).thenResolve(false);
    tick();

    expect(env.service.canTrainSuggestions).toBeFalsy();
    discardPeriodicTasks();
  }));

  it('resets train suggestions flag when switching projects', fakeAsync(async () => {
    const env = new TestEnvironment();
    tick();

    expect(env.service.canTrainSuggestions).toBeTruthy();

    when(env.mockProject.id).thenReturn('project02');
    env.project$.next(instance(env.mockProject));
    tick();

    expect(env.service.canTrainSuggestions).toBeFalsy();
    discardPeriodicTasks();
  }));
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly service: ProgressService;
  private readonly numBooks = 20;
  private readonly numChapters = 20;

  readonly mockProject = mock(SFProjectProfileDoc);
  readonly project$ = new BehaviorSubject(instance(this.mockProject));

  constructor(
    private readonly translatedSegments: number = 1000,
    private readonly blankSegments: number = 500
  ) {
    const data = createTestProjectProfile({
      texts: this.createTexts(),
      translateConfig: {
        translationSuggestionsEnabled: true,
        source: {
          projectRef: 'sourceId'
        }
      }
    });

    when(this.mockProject.id).thenReturn('project01');
    when(mockProjectService.changes$).thenReturn(this.project$);

    when(mockPermissionService.canAccessText(anything())).thenResolve(true);
    when(mockSFProjectService.getProfile('project01')).thenResolve({
      data,
      id: 'project01',
      remoteChanges$: new BehaviorSubject([])
    } as unknown as SFProjectProfileDoc);

    // set up blank project
    when(mockSFProjectService.getProfile('project02')).thenResolve({
      data,
      id: 'project02',
      remoteChanges$: new BehaviorSubject([])
    } as unknown as SFProjectProfileDoc);
    this.setUpGetText('project02', 0, 1000);

    this.setUpGetText('sourceId', this.translatedSegments, this.blankSegments);
    this.setUpGetText('project01', this.translatedSegments, this.blankSegments);

    this.service = TestBed.inject(ProgressService);
  }

  setUpGetText(projectId: string, translatedSegments: number, blankSegments: number): void {
    for (let book = 1; book <= this.numBooks; book++) {
      for (let chapter = 0; chapter < this.numChapters; chapter++) {
        const translated = translatedSegments >= 9 ? 9 : translatedSegments;
        translatedSegments -= translated;
        const blank = blankSegments >= 5 ? 5 : blankSegments;
        blankSegments -= blank;

        when(mockSFProjectService.getText(deepEqual(new TextDocId(projectId, book, chapter, 'target')))).thenCall(
          () => {
            return {
              getSegmentCount: () => {
                return { translated, blank };
              },
              getNonEmptyVerses: () => this.createVerses(translated),
              changes$: of({} as TextData)
            };
          }
        );
      }
    }
  }

  createVerses(num: number): string[] {
    let count = 0;
    return Array.from({ length: num }, () => 'verse' + ++count);
  }

  createTexts(): TextInfo[] {
    const texts: TextInfo[] = [];
    for (let book = 1; book <= this.numBooks; book++) {
      const chapters: Chapter[] = [];
      for (let chapter = 0; chapter < this.numChapters; chapter++) {
        chapters.push({ isValid: true, lastVerse: 1, number: chapter, permissions: {}, hasAudio: false });
      }
      texts.push({ bookNum: book, chapters: chapters, hasSource: true, permissions: {} });
    }
    return texts;
  }
}
