import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { LatinWordTokenizer } from '@sillsdev/machine';
import { QuillModule } from 'ngx-quill';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, objectContaining, resetCalls, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { DialogService } from 'xforge-common/dialog.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { TranslateMetrics } from '../../core/models/translate-metrics';
import { SFProjectService } from '../../core/sf-project.service';
import { getTextDoc } from '../../shared/test-utils';
import { TextComponent } from '../../shared/text/text.component';
import {
  ACTIVE_EDIT_TIMEOUT,
  EDIT_TIMEOUT,
  SEND_METRICS_INTERVAL,
  TranslateMetricsSession
} from './translate-metrics-session';

const mockedPwaService = mock(PwaService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialogService = mock(DialogService);

describe('TranslateMetricsSession', () => {
  configureTestingModule(() => ({
    declarations: [TextComponent],
    imports: [QuillModule.forRoot(), TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: PwaService, useMock: mockedPwaService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: DialogService, useMock: mockedDialogService }
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
    tick(SEND_METRICS_INTERVAL);
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();

    // CommandError is re-thrown when online
    resetCalls(mockedSFProjectService);
    const commandError: CommandError = new CommandError(CommandErrorCode.InternalError, 'error');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(commandError);
    expect(() => {
      env.keyPress('a');
      tick(SEND_METRICS_INTERVAL);
    }).toThrow();
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();

    // Non-CommandError error is re-thrown when online
    resetCalls(mockedSFProjectService);
    const otherError: Error = new Error('problem');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(otherError);
    expect(() => {
      env.keyPress('a');
      tick(SEND_METRICS_INTERVAL);
    }).toThrow();
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();

    // CommandError NotFound is ignored
    resetCalls(mockedSFProjectService);
    const notFoundError: CommandError = new CommandError(CommandErrorCode.NotFound, 'error');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(notFoundError);
    expect(() => {
      env.keyPress('a');
      tick(SEND_METRICS_INTERVAL);
    }).not.toThrow();
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();

    // CommandError Forbidden is ignored
    resetCalls(mockedSFProjectService);
    const forbiddenError: CommandError = new CommandError(CommandErrorCode.Forbidden, 'error');
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(forbiddenError);
    expect(() => {
      env.keyPress('a');
      tick(SEND_METRICS_INTERVAL);
    }).not.toThrow();
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).once();

    // CommandError is ignored when offline
    resetCalls(mockedSFProjectService);
    when(mockedPwaService.isOnline).thenReturn(false);
    when(mockedPwaService.onlineStatus).thenReturn(of(false));
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(commandError);
    expect(() => {
      env.keyPress('a');
      tick(SEND_METRICS_INTERVAL);
    }).not.toThrow();
    // Not calling since offline
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    // Non-CommandError error is ignored when offline
    resetCalls(mockedSFProjectService);
    expect(() => {
      env.keyPress('a');
      tick(SEND_METRICS_INTERVAL);
    }).not.toThrow();
    // Not calling since offline
    verify(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    env.sessionDispose();
  }));
});

class TestEnvironment {
  readonly source: TextComponent;
  readonly sourceFixture: ComponentFixture<TextComponent>;
  readonly target: TextComponent;
  readonly targetFixture: ComponentFixture<TextComponent>;
  readonly session: TranslateMetricsSession;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private readonly tokenizer = new LatinWordTokenizer();

  constructor() {
    this.addTextDoc(new TextDocId('project02', 40, 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));

    when(mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();
    when(mockedSFProjectService.getProfile(anything())).thenResolve({} as SFProjectProfileDoc);
    when(mockedPwaService.isOnline).thenReturn(true);
    when(mockedPwaService.onlineStatus).thenReturn(of(true));
    when(mockedUserService.getCurrentUser()).thenResolve({ data: { displayName: 'name' } } as UserDoc);

    this.sourceFixture = TestBed.createComponent(TextComponent);
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
      instance(mockedPwaService)
    );

    this.sourceFixture.detectChanges();
    this.targetFixture.detectChanges();
    tick();
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
