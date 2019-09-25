import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { LatinWordTokenizer } from '@sillsdev/machine';
import { QuillModule } from 'ngx-quill';
import * as RichText from 'rich-text';
import { anything, deepEqual, instance, mock, objectContaining, resetCalls, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { TranslateMetrics } from '../../core/models/translate-metrics';
import { SFProjectService } from '../../core/sf-project.service';
import { TextComponent } from '../../shared/text/text.component';
import {
  ACTIVE_EDIT_TIMEOUT,
  EDIT_TIMEOUT,
  SEND_METRICS_INTERVAL,
  TranslateMetricsSession
} from './translate-metrics-session';

describe('TranslateMetricsSession', () => {
  describe('edit', () => {
    it('start with edit keystroke', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

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
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();
      env.keyPress('Backspace');
      env.keyPress('b');
      env.keyPress('Delete');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(2);
      expect(env.session.metrics.keyBackspaceCount).toBe(1);
      expect(env.session.metrics.keyDeleteCount).toBe(1);

      env.session.dispose();
    }));

    it('start with accepted suggestion', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

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
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();
      env.keyPress('a');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);
      expect(env.session.metrics.mouseClickCount).toBe(1);
      expect(env.session.metrics.suggestionTotalCount).toBe(1);
      expect(env.session.metrics.suggestionAcceptedCount).toBe(1);

      env.session.dispose();
    }));

    it('navigate keystroke', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.keyPress('a');
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      env.keyPress('ArrowRight');
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.keyNavigationCount).toBe(1);

      env.session.dispose();
    }));

    it('mouse click', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.keyPress('a');
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      env.mouseClick();
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.mouseClickCount).toBe(1);

      env.session.dispose();
    }));

    it('timeout', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.keyPress('a');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      tick(SEND_METRICS_INTERVAL);
      resetCalls(env.mockedSFProjectService);

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
      verify(
        env.mockedSFProjectService.onlineAddTranslateMetrics('project01', objectContaining(expectedMetrics))
      ).once();

      env.keyPress('b');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      env.session.dispose();
    }));

    it('segment change', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.keyPress('a');
      tick(ACTIVE_EDIT_TIMEOUT);
      expect(env.session.metrics.type).toBe('edit');
      expect(env.session.metrics.timeEditActive).toBeDefined();
      expect(env.session.metrics.keyCharacterCount).toBe(1);

      const range = env.target.getSegmentRange('verse_1_2');
      env.target.editor.setSelection(range.index, 0, 'user');
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
      verify(
        env.mockedSFProjectService.onlineAddTranslateMetrics('project01', objectContaining(expectedMetrics))
      ).once();
      expect(env.session.metrics.type).toBe('navigate');

      env.session.dispose();
    }));
  });

  describe('navigate', () => {
    it('navigate keystroke', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.keyPress('ArrowRight');
      env.keyPress('ArrowLeft');
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(2);

      env.session.dispose();
    }));

    it('mouse click', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.mouseClick();
      env.mouseClick();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.mouseClickCount).toBe(2);

      env.session.dispose();
    }));

    it('segment change', fakeAsync(() => {
      const env = new TestEnvironment();
      env.startSession();

      env.keyPress('ArrowDown');
      env.mouseClick();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(1);
      expect(env.session.metrics.mouseClickCount).toBe(1);

      env.target.segmentRef = 'verse_1_2';
      env.targetFixture.detectChanges();
      tick();
      verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();
      expect(env.session.metrics.type).toBe('navigate');

      env.keyPress('ArrowDown');
      env.mouseClick();
      expect(env.session.metrics.type).toBe('navigate');
      expect(env.session.metrics.keyNavigationCount).toBe(2);
      expect(env.session.metrics.mouseClickCount).toBe(2);

      env.session.dispose();
    }));
  });

  it('dispose', fakeAsync(() => {
    const env = new TestEnvironment();
    env.startSession();

    env.keyPress('a');
    env.keyPress('b');
    expect(env.session.metrics.type).toBe('edit');
    verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    const sessionId = env.session.id;
    const metricsId = env.session.metrics.id;
    env.session.dispose();
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
    verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', objectContaining(expectedMetrics))).once();
  }));

  it('periodic send', fakeAsync(() => {
    const env = new TestEnvironment();
    env.startSession();

    env.keyPress('ArrowRight');
    env.keyPress('ArrowLeft');
    expect(env.session.metrics.type).toBe('navigate');
    expect(env.session.metrics.keyNavigationCount).toBe(2);
    verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

    tick(SEND_METRICS_INTERVAL);
    let expectedMetrics: TranslateMetrics = {
      id: env.session.metrics.id,
      type: 'navigate',
      sessionId: env.session.id,
      bookNum: 40,
      chapterNum: 1,
      keyNavigationCount: 2
    };
    verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();

    resetCalls(env.mockedSFProjectService);
    env.mouseClick();
    expect(env.session.metrics.type).toBe('navigate');
    expect(env.session.metrics.mouseClickCount).toBe(1);
    verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).never();

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
    verify(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', deepEqual(expectedMetrics))).once();

    env.session.dispose();
  }));

  it('ignore not found error', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(
      new CommandError(CommandErrorCode.NotFound, 'NotFound')
    );
    env.startSession();

    env.keyPress('a');
    expect(() => env.session.dispose()).not.toThrow();
  }));

  it('ignore forbidden error', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenReject(
      new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
    );
    env.startSession();

    env.keyPress('a');
    expect(() => env.session.dispose()).not.toThrow();
  }));
});

class TestEnvironment {
  readonly source: TextComponent;
  readonly sourceFixture: ComponentFixture<TextComponent>;
  readonly target: TextComponent;
  readonly targetFixture: ComponentFixture<TextComponent>;
  readonly session: TranslateMetricsSession;

  readonly mockedSFProjectService = mock(SFProjectService);

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);
  private readonly tokenizer = new LatinWordTokenizer();

  constructor() {
    this.addTextDoc(new TextDocId('project01', 40, 1, 'source'));
    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));
    when(this.mockedSFProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(this.mockedSFProjectService.onlineAddTranslateMetrics('project01', anything())).thenResolve();

    TestBed.configureTestingModule({
      declarations: [TextComponent],
      imports: [QuillModule.forRoot()],
      providers: [{ provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) }]
    });
    this.sourceFixture = TestBed.createComponent(TextComponent);
    this.source = this.sourceFixture.componentInstance;
    this.source.id = new TextDocId('project01', 40, 1, 'source');
    this.source.segmentRef = 'verse_1_1';
    this.targetFixture = TestBed.createComponent(TextComponent);
    this.target = this.targetFixture.componentInstance;
    this.target.id = new TextDocId('project01', 40, 1, 'target');
    this.target.segmentRef = 'verse_1_1';
    this.session = new TranslateMetricsSession(instance(this.mockedSFProjectService));

    this.sourceFixture.detectChanges();
    this.targetFixture.detectChanges();
    tick();
  }

  startSession(): void {
    this.session.start('project01', this.source, this.target, this.tokenizer, this.tokenizer);
  }

  keyPress(key: string): void {
    const keydownEvent: any = document.createEvent('CustomEvent');
    keydownEvent.key = key;
    keydownEvent.ctrlKey = false;
    keydownEvent.metaKey = false;
    keydownEvent.initEvent('keydown', true, true);
    this.target.editor.root.dispatchEvent(keydownEvent);

    const keyupEvent: any = document.createEvent('CustomEvent');
    keyupEvent.key = key;
    keyupEvent.ctrlKey = false;
    keyupEvent.metaKey = false;
    keyupEvent.initEvent('keyup', true, true);
    this.target.editor.root.dispatchEvent(keyupEvent);
  }

  mouseClick(): void {
    const mousedownEvent: any = document.createEvent('CustomEvent');
    mousedownEvent.initEvent('mousedown', true, true);
    this.target.editor.root.dispatchEvent(mousedownEvent);

    const mouseupEvent: any = document.createEvent('CustomEvent');
    mouseupEvent.initEvent('mouseup', true, true);
    this.target.editor.root.dispatchEvent(mouseupEvent);
  }

  showSuggestion(): void {
    this.session.onSuggestionShown();
  }

  clickSuggestion(): void {
    this.mouseClick();
    const clickEvent: any = document.createEvent('CustomEvent');
    clickEvent.initEvent('click', true, true);
    this.target.editor.root.dispatchEvent(clickEvent);
    this.session.onSuggestionAccepted(clickEvent);
  }

  private addTextDoc(id: TextDocId): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 2.`, { segment: `verse_${id.chapterNum}_2` });
    delta.insert('\n', { para: { style: 'p' } });
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }
}
