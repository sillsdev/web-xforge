import { NgZone } from '@angular/core';
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, mock, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { ProgressService } from '../../shared/progress-service/progress.service';

const mockSFProjectService = mock(SFProjectService);
const mockNoticeService = mock(NoticeService);
const mockPermissionService = mock(PermissionsService);

describe('progress service', () => {
  configureTestingModule(() => ({
    declarations: [],
    imports: [TestOnlineStatusModule.forRoot(), TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: PermissionsService, useMock: mockPermissionService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('populates progress and texts on init', fakeAsync(() => {
    const env = new TestEnvironment(100, 50);
    env.service.initialize('project01');
    tick();

    expect(env.service.overallProgress.translated).toEqual(100);
    expect(env.service.overallProgress.blank).toEqual(50);
    expect(env.service.overallProgress.total).toEqual(150);
    expect(env.service.overallProgress.percentage).toEqual(67);
    expect(env.service.texts.length).toBeGreaterThan(0);
    let i = 0;
    for (const book of env.service.texts) {
      expect(book.text.bookNum).toEqual(i++);
      expect(book.text.chapters.length).toBeGreaterThan(0);
      let j = 0;
      for (const chapter of book.text.chapters) {
        expect(chapter.number).toEqual(j++);
      }
    }

    discardPeriodicTasks();
  }));

  it('updates total progress when chapter content changes', fakeAsync(async () => {
    const env = new TestEnvironment();
    const changeEvent = new BehaviorSubject({});
    when(mockSFProjectService.getText(deepEqual(new TextDocId('project01', 0, 2, 'target')))).thenCall(() => {
      return {
        getSegmentCount: () => {
          return { translated: 12, blank: 2 };
        },
        getNonEmptyVerses: () => env.createVerses(12),
        changes$: changeEvent
      };
    });

    await env.service.initialize('project01');
    tick();

    // mock a change
    when(mockSFProjectService.getText(deepEqual(new TextDocId('project01', 0, 2, 'target')))).thenCall(() => {
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

  it('can train suggestions', fakeAsync(async () => {
    const env = new TestEnvironment();
    await env.service.initialize('project01');
    tick();

    expect(env.service.canTrainSuggestions).toBeTruthy();

    discardPeriodicTasks();
  }));

  it('cannot train suggestions if too few segments', fakeAsync(async () => {
    const env = new TestEnvironment(9);
    await env.service.initialize('project01');
    tick();

    expect(env.service.canTrainSuggestions).toBeFalsy();

    discardPeriodicTasks();
  }));

  it('cannot train suggestions if no source permission', fakeAsync(async () => {
    const env = new TestEnvironment();
    when(
      mockPermissionService.canAccessText(deepEqual(new TextDocId('sourceId', anything(), anything(), 'target')))
    ).thenResolve(false);
    await env.service.initialize('project01');
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

  constructor(
    private readonly translatedSegments: number = 1000,
    private readonly blankSegments: number = 500
  ) {
    this.service = TestBed.inject(ProgressService);

    const data = createTestProjectProfile({
      texts: this.createTexts(),
      translateConfig: {
        translationSuggestionsEnabled: true,
        source: {
          projectRef: 'sourceId'
        }
      }
    });

    when(mockPermissionService.canAccessText(anything())).thenResolve(true);
    when(mockSFProjectService.getProfile('project01')).thenResolve({
      data,
      id: 'project01',
      remoteChanges$: new BehaviorSubject([])
    } as unknown as SFProjectProfileDoc);

    this.setUpGetText('sourceId');
    this.setUpGetText('project01');
  }

  private setUpGetText(projectId: string): void {
    let translatedSegments = this.translatedSegments;
    let blankSegments = this.blankSegments;

    for (let book = 0; book < this.numBooks; book++) {
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

  private createTexts(): TextInfo[] {
    const texts: TextInfo[] = [];
    for (let book = 0; book < this.numBooks; book++) {
      const chapters = [];
      for (let chapter = 0; chapter < this.numChapters; chapter++) {
        chapters.push({ isValid: true, lastVerse: 1, number: chapter, permissions: {}, hasAudio: false });
      }
      texts.push({ bookNum: book, chapters: chapters, hasSource: true, permissions: {} });
    }
    return texts;
  }
}
