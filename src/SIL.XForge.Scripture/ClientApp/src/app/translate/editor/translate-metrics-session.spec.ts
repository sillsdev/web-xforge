import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { LatinWordTokenizer } from '@sillsdev/machine';
import { QuillModule } from 'ngx-quill';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import * as RichText from 'rich-text';
import { anything, deepEqual, instance, mock, objectContaining, resetCalls, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { TranslateMetrics } from '../../core/models/translate-metrics';
import { SFProjectService } from '../../core/sf-project.service';
import { getTextDoc } from '../../shared/test-utils';
import { EDITOR_READY_TIMEOUT, TextComponent } from '../../shared/text/text.component';
import {
  ACTIVE_EDIT_TIMEOUT,
  EDIT_TIMEOUT,
  SEND_METRICS_INTERVAL,
  TranslateMetricsSession
} from './translate-metrics-session';

const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedReportingService = mock(ErrorReportingService);

describe('TranslateMetricsSession', () => {
  configureTestingModule(() => ({
    declarations: [TextComponent],
    imports: [
      QuillModule.forRoot(),
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  describe('edit', () => {
    it('start with edit keystroke', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('ArrowRight');
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(1);

      env.keyPress('a');
      const expectedMetrics: TranslateMetrics = {
        id: env.session.prevMetricsId,
        type: 'navigate',
        sessionId: env.session.id,
        bookNum: 40,
        chapterNum: 1,
        keyNavigationCount: 1
      };
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();
      env.keyPress('Backspace');
      env.keyPress('b');
      env.keyPress('Delete');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(2);
      expect(env.session.metrics.keyBackspaceCount).toBe(1);
      expect(env.session.metrics.keyDeleteCount).toBe(1);

      env.sessionDispose();
    }));

    it('start with accepted suggestion', fakeAsync(() => {
      const env = new TestEnvironment();

      env.mouseClick();
      env.showSuggestion();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.mouseClickCount).toBe(1);

      env.mouseClick();
      env.showSuggestion();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.mouseClickCount).toBe(2);

      env.clickSuggestion();
      const expectedMetrics: TranslateMetrics = {
        id: env.session.prevMetricsId,
        type: 'navigate',
        sessionId: env.session.id,
        bookNum: 40,
        chapterNum: 1,
        mouseClickCount: 2
      };
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();
      env.keyPress('a');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);
      expect(env.session.metrics.mouseClickCount).toBe(1);
      expect(env.session.metrics.suggestionTotalCount).toBe(1);
      expect(env.session.metrics.suggestionAcceptedCount).toBe(1);

      env.sessionDispose();
    }));

    it('navigate keystroke', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('a');
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      env.keyPress('ArrowRight');
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.keyNavigationCount).toBe(1);

      env.sessionDispose();
    }));

    it('mouse click', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('a');
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      env.mouseClick();
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.mouseClickCount).toBe(1);
      env.sessionDispose();
    }));

    it('editing increases activity timespan', fakeAsync(() => {
      const env = new TestEnvironment();
      // Milliseconds delay between key down and key up, to make sure the timespan between them is not rounded down
      // to 0. But not greater than the timeout.
      const momentaryDelay = ACTIVE_EDIT_TIMEOUT * 0.5;

      expect(env.session.metrics.timeEditActive).toBeUndefined();
      env.keyPress('a', momentaryDelay);
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toEqual(momentaryDelay);
      env.keyPress('b', momentaryDelay);
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.timeEditActive).toEqual(2 * momentaryDelay);
      env.sessionDispose();
    }));

    it('timeout', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('a');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      tick(SEND_METRICS_INTERVAL);
      resetCalls(mockedSFProjectService);

      tick(EDIT_TIMEOUT);
      const expectedMetrics: TranslateMetrics = {
        id: env.session.prevMetricsId,
        type: 'edit',
        sessionId: env.session.id,
        bookNum: 40,
        chapterNum: 1,
        keyCharacterCount: 1,
        segment: 'verse_1_1',
        sourceWordCount: 8,
        targetWordCount: 8,
        editEndEvent: 'timeout'
      };
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', objectContaining(expectedMetrics))).once();

      env.keyPress('b');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      env.sessionDispose();
    }));

    it('segment change', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('a');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      const range = env.target.getSegmentRange('verse_1_2');
      env.target.editor!.setSelection(range!.index, 0, 'user');
      env.targetFixture.detectChanges();
      tick();
      const expectedMetrics: TranslateMetrics = {
        id: env.session.prevMetricsId,
        type: 'edit',
        sessionId: env.session.id,
        bookNum: 40,
        chapterNum: 1,
        keyCharacterCount: 1,
        segment: 'verse_1_1',
        sourceWordCount: 8,
        targetWordCount: 8,
        editEndEvent: 'segment-change'
      };
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', objectContaining(expectedMetrics))).once();
      expect(env.session.metrics.type).toBe('navigate');

      env.sessionDispose();
    }));
  });

  describe('navigate', () => {
    it('navigate keystroke', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('ArrowRight');
      env.keyPress('ArrowLeft');
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(2);

      env.sessionDispose();
    }));

    it('mouse click', fakeAsync(() => {
      const env = new TestEnvironment();

      env.mouseClick();
      env.mouseClick();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.mouseClickCount).toBe(2);

      env.sessionDispose();
    }));

    it('segment change', fakeAsync(() => {
      const env = new TestEnvironment();

      env.keyPress('ArrowDown');
      env.mouseClick();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(1);
      expect(env.session.metrics.mouseClickCount).toBe(1);

      env.target.segmentRef = 'verse_1_2';
      env.targetFixture.detectChanges();
      tick();
      verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      expect(env.session.metrics.type).toBe('navigate');

      env.keyPress('ArrowDown');
      env.mouseClick();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(2);
      expect(env.session.metrics.mouseClickCount).toBe(2);

      env.sessionDispose();
    }));
  });

  it('dispose', fakeAsync(() => {
    const env = new TestEnvironment();

    env.keyPress('a');
    env.keyPress('b');
    expect(env.session.metrics.type).toBe('edit');
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    const sessionId = env.session.id;
    const metricsId = env.session.metrics.id;
    env.sessionDispose();
    const expectedMetrics: TranslateMetrics = {
      id: metricsId,
      type: 'edit',
      sessionId: sessionId,
      bookNum: 40,
      chapterNum: 1,
      keyCharacterCount: 2,
      segment: 'verse_1_1',
      sourceWordCount: 8,
      targetWordCount: 8,
      editEndEvent: 'task-exit'
    };
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', objectContaining(expectedMetrics))).once();
  }));

  it('periodic send', fakeAsync(() => {
    const env = new TestEnvironment();

    env.keyPress('ArrowRight');
    env.keyPress('ArrowLeft');
    expect(env.session.metrics.type).toBe('navigate');
    expect(env.session.metrics.keyNavigationCount).toBe(2);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    tick(SEND_METRICS_INTERVAL);
    let expectedMetrics: TranslateMetrics = {
      id: env.session.metrics.id,
      type: 'navigate',
      sessionId: env.session.id,
      bookNum: 40,
      chapterNum: 1,
      keyNavigationCount: 2
    };
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();

    resetCalls(mockedSFProjectService);
    env.mouseClick();
    expect(env.session.metrics.type).toBe('navigate');
    expect(env.session.metrics.mouseClickCount).toBe(1);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    tick(SEND_METRICS_INTERVAL);
    expectedMetrics = {
      id: env.session.metrics.id,
      type: 'navigate',
      sessionId: env.session.id,
      bookNum: 40,
      chapterNum: 1,
      keyNavigationCount: 2,
      mouseClickCount: 1
    };
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();

    env.sessionDispose();
  }));

  it('handles errors in sendMetrics', fakeAsync(() => {
    const env = new TestEnvironment();

    // No error, no throw.
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();
    env.keyPress('a');
    expect(env.session.metrics.type).toBe('edit');
    tick(SEND_METRICS_INTERVAL);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();

    // CommandError is re-thrown when online
    resetCalls(mockedSFProjectService);
    const commandError: CommandError = new CommandError(CommandErrorCode.InternalError, 'error');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(commandError);
    verify(mockedReportingService.silentError(anything(), anything())).never();
    env.keyPress('a');
    tick(SEND_METRICS_INTERVAL);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();
    verify(mockedReportingService.silentError(anything(), commandError)).once();

    // Non-CommandError error is re-thrown when online
    resetCalls(mockedSFProjectService);
    resetCalls(mockedReportingService);
    const otherError: Error = new Error('problem');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(otherError);
    verify(mockedReportingService.silentError(anything(), anything())).never();
    env.keyPress('a');
    tick(SEND_METRICS_INTERVAL);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();
    verify(mockedReportingService.silentError(anything(), otherError)).once();

    // CommandError NotFound is ignored
    resetCalls(mockedSFProjectService);
    resetCalls(mockedReportingService);
    const notFoundError: CommandError = new CommandError(CommandErrorCode.NotFound, 'error');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(notFoundError);
    env.keyPress('a');
    tick(SEND_METRICS_INTERVAL);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();
    verify(mockedReportingService.silentError(anything(), anything())).never();

    // CommandError Forbidden is ignored
    resetCalls(mockedSFProjectService);
    const forbiddenError: CommandError = new CommandError(CommandErrorCode.Forbidden, 'error');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(forbiddenError);
    env.keyPress('a');
    tick(SEND_METRICS_INTERVAL);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();
    verify(mockedReportingService.silentError(anything(), anything())).never();

    // CommandError is ignored when offline
    resetCalls(mockedSFProjectService);
    env.testOnlineStatusService.setIsOnline(false);
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(commandError);
    env.keyPress('a');
    tick(SEND_METRICS_INTERVAL);
    // Not calling since offline
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
    verify(mockedReportingService.silentError(anything(), anything())).never();

    // Non-CommandError error is ignored when offline
    resetCalls(mockedSFProjectService);
    env.keyPress('a');
    tick(SEND_METRICS_INTERVAL);
    // Not calling since offline
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
    verify(mockedReportingService.silentError(anything(), anything())).never();

    env.sessionDispose();
  }));
});

class TestEnvironment {
  readonly source: TextComponent;
  readonly sourceFixture: ComponentFixture<TextComponent>;
  readonly target: TextComponent;
  readonly targetFixture: ComponentFixture<TextComponent>;
  readonly session: TranslateMetricsSession;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private readonly tokenizer = new LatinWordTokenizer();

  constructor() {
    const textDocId1 = new TextDocId('project01', 40, 1, 'target');
    const textDocId2 = new TextDocId('project02', 40, 1, 'target');
    this.addTextDoc(textDocId1);
    this.addTextDoc(textDocId2);
    const textInfos: TextInfo[] = [
      {
        bookNum: 40,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 7, isValid: true, permissions: {} }],
        permissions: {}
      }
    ];
    [textDocId1, textDocId2].forEach(textDocId => {
      this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
        id: textDocId.projectId,
        data: createTestProjectProfile({ texts: textInfos })
      });
    });

    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: createTestUser({
        sites: {
          sf: {
            projects: ['project01', 'project02']
          }
        }
      })
    });

    when(mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();
    when(mockedSFProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id.toString())
    );
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );

    this.sourceFixture = TestBed.createComponent(TextComponent);

    // Initialize the source text component.
    // When run for the first time in a test run, this will load Quill
    this.sourceFixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);
    this.sourceFixture.detectChanges();

    this.source = this.sourceFixture.componentInstance;
    this.source.id = new TextDocId('project02', 40, 1, 'target');
    this.source.segmentRef = 'verse_1_1';
    this.targetFixture = TestBed.createComponent(TextComponent);
    this.target = this.targetFixture.componentInstance;
    this.target.id = new TextDocId('project01', 40, 1, 'target');
    this.target.segmentRef = 'verse_1_1';
    this.session = new TranslateMetricsSession(
      instance(mockedSFProjectService),
      'project01',
      this.source,
      this.target,
      this.tokenizer,
      this.tokenizer,
      this.testOnlineStatusService,
      instance(mockedReportingService)
    );
    this.targetFixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);
  }

  /** @param timeSpanMs Optional milliseconds delay between pressing and releasing key. */
  keyPress(key: string, timeSpanMs: number = 0): void {
    const keydownEvent: any = document.createEvent('CustomEvent');
    keydownEvent.key = key;
    keydownEvent.ctrlKey = false;
    keydownEvent.metaKey = false;
    keydownEvent.initEvent('keydown', true, true);
    this.target.editor!.root.dispatchEvent(keydownEvent);

    tick(timeSpanMs);
    const keyupEvent: any = document.createEvent('CustomEvent');
    keyupEvent.key = key;
    keyupEvent.ctrlKey = false;
    keyupEvent.metaKey = false;
    keyupEvent.initEvent('keyup', true, true);
    this.target.editor!.root.dispatchEvent(keyupEvent);
  }

  mouseClick(): void {
    const mousedownEvent: any = document.createEvent('CustomEvent');
    mousedownEvent.initEvent('mousedown', true, true);
    this.target.editor!.root.dispatchEvent(mousedownEvent);

    const mouseupEvent: any = document.createEvent('CustomEvent');
    mouseupEvent.initEvent('mouseup', true, true);
    this.target.editor!.root.dispatchEvent(mouseupEvent);
  }

  showSuggestion(): void {
    this.session.onSuggestionShown();
  }

  clickSuggestion(): void {
    this.mouseClick();
    const clickEvent: any = document.createEvent('CustomEvent');
    clickEvent.initEvent('click', true, true);
    this.target.editor!.root.dispatchEvent(clickEvent);
    this.session.onSuggestionAccepted(clickEvent);
  }

  sessionDispose(): void {
    this.session.dispose();
    tick();
  }

  private addTextDoc(id: TextDocId): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: getTextDoc(id)
    });
  }
}
