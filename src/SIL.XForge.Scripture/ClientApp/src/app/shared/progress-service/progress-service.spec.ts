import { NgZone } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject } from 'rxjs';
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
import { ProgressService } from '../../shared/progress-service/progress-service';

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

  it('populates progress and texts on init', fakeAsync(async () => {
    const env = new TestEnvironment(100, 50);
    await env.service.initialize('project01');
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
  }));

  it('can train suggestions', fakeAsync(async () => {
    const env = new TestEnvironment();
    await env.service.initialize('project01');
    tick();

    expect(env.service.canTrainSuggestions).toBeTruthy();
  }));

  it('cannot train suggestions if too few segments', fakeAsync(async () => {
    const env = new TestEnvironment(9);
    await env.service.initialize('project01');
    tick();

    expect(env.service.canTrainSuggestions).toBeFalsy();
  }));

  it('cannot train suggestions if no source permission', fakeAsync(async () => {
    const env = new TestEnvironment();
    when(
      mockPermissionService.canAccessText(deepEqual(new TextDocId('sourceId', anything(), anything(), 'target')))
    ).thenResolve(false);
    await env.service.initialize('project01');
    tick();

    expect(env.service.canTrainSuggestions).toBeFalsy();
  }));
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly service: ProgressService;

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
    when(mockSFProjectService.getText(deepEqual(new TextDocId(projectId, anything(), anything(), 'target')))).thenCall(
      () => {
        const translated = translatedSegments >= 9 ? 9 : translatedSegments;
        translatedSegments -= translated;
        const blank = blankSegments >= 5 ? 5 : blankSegments;
        blankSegments -= blank;
        return {
          getSegmentCount: () => {
            return { translated, blank };
          },
          getNonEmptyVerses: () => this.createVerses(translated)
        };
      }
    );
  }

  private createVerses(num: number): string[] {
    let count = 0;
    return Array.from({ length: num }, () => 'verse' + ++count);
  }

  private createTexts(): TextInfo[] {
    const texts: TextInfo[] = [];
    for (let book = 0; book < 20; book++) {
      const chapters = [];
      for (let chapter = 0; chapter < 20; chapter++) {
        chapters.push({ isValid: true, lastVerse: 1, number: chapter, permissions: {}, hasAudio: false });
      }
      texts.push({ bookNum: book, chapters: chapters, hasSource: true, permissions: {} });
    }
    return texts;
  }
}
