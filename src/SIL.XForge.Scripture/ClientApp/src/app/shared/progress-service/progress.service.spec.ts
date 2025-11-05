import { NgZone } from '@angular/core';
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { NoticeService } from 'xforge-common/notice.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
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

const defaultChaptersNum = 20;
const defaultTranslatedNum = 9;
const defaultBlankNum = 5;

describe('progress service', () => {
  configureTestingModule(() => ({
    providers: [
      provideTestOnlineStatus(),
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: PermissionsService, useMock: mockPermissionService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: ActivatedProjectService, useMock: mockProjectService }
    ]
  }));

  it('populates progress and texts on construction', fakeAsync(() => {
    // Create segments for 20 chapters multiplied by 20 books
    const env = new TestEnvironment(3600, 2000);
    // Override the verse counts to be less than half of the number created for each book
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
      expect(book.expectedNumberOfVerses).toEqual(200);
      expect(book.useExpectedNumberOfVerses).toEqual(false);
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
    env.setTextData('project01', 1, 2, 'target', 12, 2, changeEvent);

    tick();

    // mock a change
    env.setTextData('project01', 1, 2, 'target', 13, 1, changeEvent);

    const originalProgress = env.service.overallProgress.translated;
    tick(1000); // wait for the throttle time

    changeEvent.next({});

    expect(env.service.overallProgress.translated).toEqual(originalProgress + 1);
    discardPeriodicTasks();
  }));

  it('uses the verse counts when there are too few segments', fakeAsync(() => {
    const notTranslatedVerses = 17380;
    const translatedVerses = 5;
    const env = new TestEnvironment(translatedVerses, 1);
    tick();

    expect(env.service.overallProgress.translated).toEqual(translatedVerses);
    expect(env.service.overallProgress.notTranslated).toEqual(notTranslatedVerses);
    expect(env.service.overallProgress.blank).toEqual(notTranslatedVerses);
    expect(env.service.overallProgress.total).toEqual(notTranslatedVerses + translatedVerses);
    expect(env.service.overallProgress.percentage).toEqual(0);
    expect(env.service.texts.length).toBeGreaterThan(0);
    let i = 0;
    for (const book of env.service.texts) {
      expect(book.text.bookNum).toEqual(++i);
      expect(book.useExpectedNumberOfVerses).toEqual(true);
      expect(book.total).toEqual(book.expectedNumberOfVerses);
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
    when(mockPermissionService.canAccessTextAsync(anything())).thenCall((textDocId: TextDocId) => {
      return Promise.resolve(textDocId.projectId !== 'sourceId');
    });
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

  it('returns text progress for texts on a project', fakeAsync(async () => {
    const booksWithTexts = 5;
    const totalTranslated = booksWithTexts * defaultChaptersNum * defaultTranslatedNum;
    const totalBlank = booksWithTexts * defaultChaptersNum * defaultBlankNum;
    const env = new TestEnvironment(totalTranslated, totalBlank);
    tick();

    const texts: TextInfo[] = env.createTexts();
    const projectDoc: SFProjectProfileDoc = {
      id: 'sourceId',
      data: createTestProjectProfile({ texts })
    } as SFProjectProfileDoc;
    when(mockSFProjectService.getProfile(projectDoc.id)).thenResolve(projectDoc);
    when(mockPermissionService.isUserOnProject(anything())).thenResolve(true);

    // SUT
    const progressList = await env.service.getTextProgressForProject(projectDoc.id);
    tick();
    expect(progressList.length).toEqual(texts.length);
    for (let i = 0; i < progressList.length; i++) {
      const progress = progressList[i];
      if (i < booksWithTexts) {
        expect(progress.translated).toEqual(defaultTranslatedNum * defaultChaptersNum);
        expect(progress.blank).toEqual(defaultBlankNum * defaultChaptersNum);
      } else {
        expect(progress.translated).toEqual(0);
        expect(progress.blank).toEqual(0);
      }
    }
  }));

  it('returns empty text progress if user does not have permission', fakeAsync(async () => {
    const env = new TestEnvironment(1000, 500);
    tick();
    const texts: TextInfo[] = env.createTexts();
    const projectDoc: SFProjectProfileDoc = {
      id: 'sourceId',
      data: createTestProjectProfile({ texts })
    } as SFProjectProfileDoc;
    when(mockPermissionService.isUserOnProject(anything())).thenResolve(false);

    // SUT
    const progressList = await env.service.getTextProgressForProject(projectDoc.id);
    tick();
    expect(progressList.length).toEqual(0);
  }));
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly service: ProgressService;

  readonly mockProject = mock(SFProjectProfileDoc);
  readonly project$ = new BehaviorSubject(instance(this.mockProject));

  private readonly numBooks = 20;
  // Store all text data in a single map to avoid repeated deepEqual calls
  private readonly allTextData = new Map<string, { translated: number; blank: number }>();

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

    when(mockPermissionService.canAccessTextAsync(anything())).thenResolve(true);
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
    this.populateTextData('project02', 0, 1000);

    this.populateTextData('sourceId', this.translatedSegments, this.blankSegments);
    this.populateTextData('project01', this.translatedSegments, this.blankSegments);

    // Set up a single mock for getText that handles all TextDocId instances
    when(mockSFProjectService.getText(anything())).thenCall((textDocId: TextDocId) => {
      const key = `${textDocId.projectId}:${textDocId.bookNum}:${textDocId.chapterNum}:${textDocId.textType}`;
      const data = this.allTextData.get(key);
      const changeKey = `${key}:changes`;
      const customChanges = (this.allTextData as any).get(changeKey);

      if (data != null) {
        return {
          getSegmentCount: () => {
            return { translated: data.translated, blank: data.blank };
          },
          getNonEmptyVerses: () => this.createVerses(data.translated),
          changes$: customChanges ?? of({} as TextData)
        };
      }

      // Return a default value if not found
      return {
        getSegmentCount: () => {
          return { translated: 0, blank: 0 };
        },
        getNonEmptyVerses: () => [],
        changes$: of({} as TextData)
      };
    });

    this.service = TestBed.inject(ProgressService);
  }

  private populateTextData(projectId: string, translatedSegments: number, blankSegments: number): void {
    for (let book = 1; book <= this.numBooks; book++) {
      for (let chapter = 0; chapter < defaultChaptersNum; chapter++) {
        const translated = translatedSegments >= defaultTranslatedNum ? defaultTranslatedNum : translatedSegments;
        translatedSegments -= translated;
        const blank = blankSegments >= defaultBlankNum ? defaultBlankNum : blankSegments;
        blankSegments -= blank;

        const key = `${projectId}:${book}:${chapter}:target`;
        this.allTextData.set(key, { translated, blank });
      }
    }
  }

  setTextData(
    projectId: string,
    book: number,
    chapter: number,
    textType: string,
    translated: number,
    blank: number,
    changes$?: BehaviorSubject<any>
  ): void {
    const key = `${projectId}:${book}:${chapter}:${textType}`;
    this.allTextData.set(key, { translated, blank });

    // If a custom changes$ observable is provided, we need to store it
    // so the mock can return it
    if (changes$ != null) {
      const changeKey = `${key}:changes`;
      (this.allTextData as any).set(changeKey, changes$);
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
      for (let chapter = 0; chapter < defaultChaptersNum; chapter++) {
        chapters.push({ isValid: true, lastVerse: 1, number: chapter, permissions: {}, hasAudio: false });
      }
      texts.push({ bookNum: book, chapters: chapters, hasSource: true, permissions: {} });
    }
    return texts;
  }
}
