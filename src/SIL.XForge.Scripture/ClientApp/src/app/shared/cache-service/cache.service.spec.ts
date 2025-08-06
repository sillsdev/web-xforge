import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { filter } from 'rxjs';
import { anything, deepEqual, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedProjectService, TestActivatedProjectService } from 'xforge-common/activated-project.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { DocSubscription } from '../../../xforge-common/models/realtime-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { CacheService } from './cache.service';

const mockProjectService = mock(SFProjectService);
const mockPermissionsService = mock(PermissionsService);
// let testActivatedProjectService: TestActivatedProjectService;

describe('CacheService', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: PermissionsService, useMock: mockPermissionsService },
      { provide: ActivatedProjectService, useClass: TestActivatedProjectService }
    ]
  }));

  beforeEach(() => {
    resetCalls(mockProjectService);
    resetCalls(mockPermissionsService);
  });

  it('constructs', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    expect(env.service).toBeDefined();
  }));

  it('activating a project fetches texts', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    env.activateProject('project01');
    tick();
    const numTexts: number = env.numBooks * env.numChapters;
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    verify(mockProjectService.getText(anything(), anything())).times(numTexts);
  }));

  it('activating a project fetches texts, including sources', fakeAsync(() => {
    const env = new TestEnvironment({ projectHasSource: true, textsHaveSource: true });
    tick();
    env.activateProject('project01');
    tick();
    // Twice as many
    const numTexts: number = env.numBooks * env.numChapters * 2;
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    verify(mockProjectService.getText(anything(), anything())).times(numTexts);
  }));

  it('activating a project fetches texts, including sources, unless project has no source project ref', fakeAsync(() => {
    const env = new TestEnvironment({ projectHasSource: false, textsHaveSource: true });
    tick();
    env.activateProject('project01');
    tick();
    // Not twice as many
    const numTexts: number = env.numBooks * env.numChapters;
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    verify(mockProjectService.getText(anything(), anything())).times(numTexts);
  }));

  it('activating a project fetches texts, including sources, unless texts do not haveSource', fakeAsync(() => {
    const env = new TestEnvironment({ projectHasSource: false, textsHaveSource: true });
    tick();
    env.activateProject('project01');
    tick();
    // Not twice as many
    const numTexts: number = env.numBooks * env.numChapters;
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    verify(mockProjectService.getText(anything(), anything())).times(numTexts);
  }));

  it('activating an undefined project does not fetch texts', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    env.activateProject('project01');
    tick();
    resetCalls(mockPermissionsService);
    resetCalls(mockProjectService);
    env.activateProject(undefined);
    verify(mockPermissionsService.canAccessText(anything())).never();
    verify(mockProjectService.getText(anything(), anything())).never();
  }));

  it('activating a project unsubscribes from previous project texts', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    env.activateProject('project01');
    tick();
    // CacheService should not have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(0);
    env.activateProject('project02');
    tick();
    const numTexts: number = env.numBooks * env.numChapters;
    // CacheService should have unsubscribed from the previous project text docs.
    expect(env.numTextDocUnsubscribes).toEqual(numTexts);
  }));

  it('activating a project unsubscribes from previous project texts, including sources', fakeAsync(() => {
    const env = new TestEnvironment({ projectHasSource: true, textsHaveSource: true });
    tick();
    env.activateProject('project01');
    tick();
    // CacheService should not have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(0);
    env.activateProject('project02');
    tick();
    // Twice as many
    const numTexts: number = env.numBooks * env.numChapters * 2;
    // CacheService should have unsubscribed from the previous project text docs.
    expect(env.numTextDocUnsubscribes).toEqual(numTexts);
  }));

  it('activating an undefined project does not unsubscribe from project texts', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    env.activateProject('project01');
    tick();
    // CacheService should not have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(0);
    env.activateProject(undefined);
    tick();
    // CacheService should not have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(0);
  }));

  it('destroying CacheService unsubscribes from project texts', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    env.activateProject('project01');
    tick();
    // CacheService should not have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(0);
    TestBed.resetTestingModule();
    tick();
    // CacheService should have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(env.numBooks * env.numChapters);
  }));

  it('destroying CacheService unsubscribes from project texts, including sources', fakeAsync(() => {
    const env = new TestEnvironment({ projectHasSource: true, textsHaveSource: true });
    tick();
    env.activateProject('project01');
    tick();
    // CacheService should not have unsubscribed from the project01 text docs.
    expect(env.numTextDocUnsubscribes).toEqual(0);
    TestBed.resetTestingModule();
    tick();
    // CacheService should have unsubscribed from the project01 text docs.
    // Twice as many
    expect(env.numTextDocUnsubscribes).toEqual(env.numBooks * env.numChapters * 2);
  }));

  it('should not load texts if user lacks permission', fakeAsync(() => {
    const env = new TestEnvironment({ userHasTextPermission: false });
    tick();
    env.activateProject('project01');
    tick();
    const numTexts: number = env.numBooks * env.numChapters;
    // Queried permissions for each text doc.
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    // But never tried to fetch them.
    verify(mockProjectService.getText(anything(), anything())).times(0);
  }));

  it('should load texts but not source texts if user lacks permission', fakeAsync(() => {
    const env = new TestEnvironment({
      projectHasSource: true,
      textsHaveSource: true,
      userHasTextPermission: true,
      userHasSourceTextPermission: false
    });
    tick();
    env.activateProject('project01');
    tick();
    const numProjectTexts: number = env.numBooks * env.numChapters;
    const numSourceTexts: number = env.numBooks * env.numChapters;
    // Twice as many since there are source texts
    const numTexts: number = numProjectTexts + numSourceTexts;
    // Queried permissions for each text doc, including sources.
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    // Only tried to fetch project texts, not source texts.
    verify(mockProjectService.getText(anything(), anything())).times(numProjectTexts);
  }));

  it('should not load project texts if user lacks permission, but load source texts', fakeAsync(() => {
    const env = new TestEnvironment({
      projectHasSource: true,
      textsHaveSource: true,
      userHasTextPermission: false,
      userHasSourceTextPermission: true
    });
    tick();
    env.activateProject('project01');
    tick();
    const numProjectTexts: number = env.numBooks * env.numChapters;
    const numSourceTexts: number = env.numBooks * env.numChapters;
    // Twice as many since there are source texts
    const numTexts: number = numProjectTexts + numSourceTexts;
    // Queried permissions for each text doc, including sources.
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    // Only tried to fetch source texts, not project texts.
    verify(mockProjectService.getText(anything(), anything())).times(numSourceTexts);
  }));

  it('should not load project texts or source texts if user lacks permission to both', fakeAsync(() => {
    const env = new TestEnvironment({
      projectHasSource: true,
      textsHaveSource: true,
      userHasTextPermission: false,
      userHasSourceTextPermission: false
    });
    tick();
    env.activateProject('project01');
    tick();
    const numProjectTexts: number = env.numBooks * env.numChapters;
    const numSourceTexts: number = env.numBooks * env.numChapters;
    // Twice as many since there are source texts
    const numTexts: number = numProjectTexts + numSourceTexts;
    // Queried permissions for each text doc, including sources.
    verify(mockPermissionsService.canAccessText(anything())).times(numTexts);
    // Did not try to fetch project texts or source texts.
    verify(mockProjectService.getText(anything(), anything())).times(0);
  }));

  it('activating a project interrupts caching', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    // When CacheService starts to process project01's texts, activate another project in the middle of processing.
    when(
      mockProjectService.getText(deepEqual(new TextDocId('project01', anything(), anything(), 'target')), anything())
    ).thenCall(() => env.activateProject('project02'));
    env.activateProject('project01');
    tick();
    const numTexts: number = env.numBooks * env.numChapters;
    // Verify test setup.
    expect(numTexts).toBeGreaterThan(1);
    // CacheService will have started loading texts for project01, but the processing only loads one text before it is interrupted.
    verify(
      mockProjectService.getText(deepEqual(new TextDocId('project01', anything(), anything(), 'target')), anything())
    ).atMost(1);

    // But CacheService will have loaded all the texts for project02.
    verify(
      mockProjectService.getText(deepEqual(new TextDocId('project02', anything(), anything(), 'target')), anything())
    ).times(numTexts);
  }));

  it('activating an undefined project does not interrupt caching', fakeAsync(() => {
    const env = new TestEnvironment();
    tick();
    // When CacheService starts to process project01's texts, activate an undefined project in the middle of processing.
    when(
      mockProjectService.getText(deepEqual(new TextDocId('project01', anything(), anything(), 'target')), anything())
    ).thenCall(() => env.activateProject(undefined));
    env.activateProject('project01');
    tick();
    const numTexts: number = env.numBooks * env.numChapters;
    // CacheService should have continued to load all the texts for project01.
    verify(
      mockProjectService.getText(deepEqual(new TextDocId('project01', anything(), anything(), 'target')), anything())
    ).times(numTexts);
  }));
});

class TestEnvironment {
  readonly service: CacheService;
  readonly numBooks = 2;
  readonly numChapters = 3;
  numTextDocUnsubscribes: number = 0;
  private readonly activatedProjectService: TestActivatedProjectService;

  constructor({
    projectHasSource = false,
    textsHaveSource = false,
    userHasTextPermission = true,
    userHasSourceTextPermission = true
  }: {
    projectHasSource?: boolean;
    textsHaveSource?: boolean;
    userHasTextPermission?: boolean;
    userHasSourceTextPermission?: boolean;
  } = {}) {
    when(mockProjectService.getText(anything(), anything())).thenCall(
      async (_textId: TextDocId | string, subscriber: DocSubscription) => {
        subscriber.isUnsubscribed$
          .pipe(filter(isUnsubscribed => isUnsubscribed === true))
          .subscribe(() => this.numTextDocUnsubscribes++);
        return {} as TextDoc;
      }
    );

    this.setupProject(
      'project01',
      projectHasSource,
      textsHaveSource,
      userHasTextPermission,
      userHasSourceTextPermission
    );
    this.setupProject(
      'project02',
      projectHasSource,
      textsHaveSource,
      userHasTextPermission,
      userHasSourceTextPermission
    );

    this.activatedProjectService = TestBed.inject(ActivatedProjectService) as TestActivatedProjectService;
    this.service = TestBed.inject(CacheService);
  }

  async activateProject(projectId?: string): Promise<void> {
    await this.activatedProjectService.setProject(projectId);
  }

  private setupProject(
    projectId: string,
    projectHasSource: boolean,
    textsHaveSource: boolean,
    userHasTextPermission: boolean,
    userHasSourceTextPermission: boolean
  ): void {
    const data = createTestProjectProfile({
      texts: this.createTexts(projectId, textsHaveSource, userHasTextPermission, userHasSourceTextPermission),
      translateConfig: {
        source: projectHasSource
          ? {
              projectRef: 'sourceId'
            }
          : undefined
      }
    });

    const projectDoc = {
      id: projectId,
      data: data as SFProjectProfile
    } as SFProjectProfileDoc;

    when(mockProjectService.getProfile(projectId, anything())).thenResolve(projectDoc);
  }

  private createTexts(
    projectId: string,
    textsHaveSource: boolean,
    userHasTextPermission: boolean,
    userHasSourceTextPermission: boolean
  ): TextInfo[] {
    const texts: TextInfo[] = [];
    // Create Matthew (40) and Mark (41)
    for (let bookNum = 40; bookNum <= 40 + this.numBooks - 1; bookNum++) {
      const chapters: Chapter[] = [];
      for (let chapterNumber = 1; chapterNumber <= this.numChapters; chapterNumber++) {
        chapters.push({
          isValid: true,
          lastVerse: 10,
          number: chapterNumber,
          permissions: {},
          hasAudio: false
        });
        const textDocId = new TextDocId(projectId, bookNum, chapterNumber);
        const sourceTextDocId = new TextDocId('sourceId', bookNum, chapterNumber);

        when(mockPermissionsService.canAccessText(deepEqual(textDocId))).thenResolve(userHasTextPermission);
        when(mockPermissionsService.canAccessText(deepEqual(sourceTextDocId))).thenResolve(userHasSourceTextPermission);
      }
      texts.push({
        bookNum: bookNum,
        chapters: chapters,
        hasSource: textsHaveSource,
        permissions: {}
      });
    }
    return texts;
  }
}
