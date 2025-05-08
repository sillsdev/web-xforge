import { DestroyRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BrowserModule } from '@angular/platform-browser';
import { DiagnosticsChanged, DiagnosticSeverity, DocumentManager, Position, Workspace } from '@sillsdev/lynx';
import { ScriptureDeltaDocument } from '@sillsdev/lynx-delta';
import { Canon } from '@sillsdev/scripture';
import Delta, { Op } from 'quill-delta';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { anything, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { RealtimeService } from 'xforge-common/realtime.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../../../core/models/text-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { LynxInsight, LynxInsightAction } from './lynx-insight';
import { LynxWorkspaceService, TextDocReader } from './lynx-workspace.service';

describe('LynxWorkspaceService', () => {
  const PROJECT_ID = 'project01';
  const BOOK_NUM = 40;
  const CHAPTER_NUM = 1;
  const TEST_CONTENT = 'This is test content.';

  const defaultLocale: Locale = {
    canonicalTag: 'en',
    localName: 'English',
    englishName: 'English',
    direction: 'ltr',
    tags: ['en'],
    production: true
  };

  const mockProjectService = mock<SFProjectService>();
  const mockI18nService = mock<I18nService>();
  const mockActivatedProjectService = mock<ActivatedProjectService>();
  const mockActivatedBookChapterService = mock<ActivatedBookChapterService>();
  const mockDestroyRef = mock<DestroyRef>();
  const mockWorkspace = mock<Workspace<Op>>();
  const mockDocumentManager = mock<DocumentManager<ScriptureDeltaDocument, Op, Delta>>();
  const mockTextDocReader = mock<TextDocReader>();

  const projectDocTestSubject$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);
  const bookChapterTestSubject$ = new BehaviorSubject<RouteBookChapter | undefined>(undefined);
  const localeTestSubject$ = new BehaviorSubject<Locale>(defaultLocale);
  const diagnosticsChangedTestSubject$ = new Subject<DiagnosticsChanged>();

  class TestEnvironment {
    service!: LynxWorkspaceService;
    realtimeService!: TestRealtimeService;

    constructor(autoInit = true) {
      this.setupMocks();

      if (autoInit) {
        this.init();
      }
    }

    setupMocks(): void {
      when(mockI18nService.localeCode).thenReturn(defaultLocale.canonicalTag);
      when(mockI18nService.locale$).thenReturn(localeTestSubject$);
      when(mockActivatedProjectService.projectDoc$).thenReturn(projectDocTestSubject$);
      when(mockActivatedBookChapterService.activatedBookChapter$).thenReturn(bookChapterTestSubject$);
      when(mockDestroyRef.onDestroy(anything())).thenCall((callback: () => void) => callback());

      when(mockWorkspace.diagnosticsChanged$).thenReturn(diagnosticsChangedTestSubject$);
      when(mockWorkspace.init()).thenReturn(Promise.resolve());
      when(mockWorkspace.changeLanguage(anything())).thenReturn(Promise.resolve());
      when(mockWorkspace.getOnTypeTriggerCharacters()).thenReturn(['.', ',']);
      when(mockWorkspace.getOnTypeEdits(anything(), anything(), anything())).thenReturn(
        Promise.resolve([{ retain: 5 }, { insert: ' ' }])
      );
      when(mockWorkspace.getDiagnosticFixes(anything(), anything())).thenReturn(
        Promise.resolve([
          {
            title: 'Fix issue',
            isPreferred: true,
            diagnostic: {
              code: 123,
              source: 'test',
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
              severity: DiagnosticSeverity.Warning,
              message: 'Test diagnostic'
            },
            edits: [{ retain: 0 }, { insert: 'corrected' }, { delete: 10 }]
          }
        ])
      );

      const mockDoc = this.createMockScriptureDeltaDoc();
      when(mockDocumentManager.get(anything())).thenReturn(Promise.resolve(mockDoc));
      when(mockDocumentManager.reset()).thenReturn(Promise.resolve());
      when(mockDocumentManager.fireOpened(anything(), anything())).thenReturn(Promise.resolve());
      when(mockDocumentManager.fireClosed(anything())).thenReturn(Promise.resolve());

      when(mockTextDocReader.keys()).thenReturn(Promise.resolve([]));
      when(mockTextDocReader.read(anything())).thenReturn(
        Promise.resolve({
          content: new Delta(),
          format: 'scripture-delta',
          version: 0
        })
      );
    }

    init(): void {
      this.realtimeService = TestBed.inject<TestRealtimeService>(RealtimeService as any);

      when(mockProjectService.getText(anything())).thenCall(textDocId => {
        const id = typeof textDocId === 'string' ? textDocId : textDocId.toString();
        const existingDoc = this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, id);
        return Promise.resolve(existingDoc || this.createTextDoc());
      });

      this.createTextDoc(CHAPTER_NUM);
      this.createTextDoc(CHAPTER_NUM + 1);

      this.service = TestBed.inject(LynxWorkspaceService);
      this.service.init();
      tick();

      // Reset mock call counters after initialization
      this.resetMocks();
    }

    resetMocks(): void {
      resetCalls(mockWorkspace);
      resetCalls(mockDocumentManager);
      resetCalls(mockProjectService);
    }

    createTextDoc(chapter: number = CHAPTER_NUM, content: Delta | string = TEST_CONTENT): TextDoc {
      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, chapter);
      const id = textDocId.toString();
      const delta = typeof content === 'string' ? new Delta().insert(content) : content;

      this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
        id,
        type: 'rich-text',
        data: delta
      });

      return this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, id);
    }

    createMockProjectDoc(id: string = PROJECT_ID): SFProjectProfileDoc {
      const projectData = createTestProjectProfile({
        texts: [
          {
            bookNum: BOOK_NUM,
            hasSource: true,
            chapters: [
              { number: CHAPTER_NUM, isValid: true, lastVerse: 25 },
              { number: CHAPTER_NUM + 1, isValid: true, lastVerse: 25 }
            ]
          }
        ]
      });

      this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
        id,
        type: 'project',
        data: projectData
      });

      return this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, id);
    }

    createMockScriptureDeltaDoc(): any {
      return {
        offsetAt: (pos: Position) => pos.character,
        positionAt: (offset: number) => ({ line: 0, character: offset })
      };
    }

    triggerDiagnostics(
      messages: string[] = ['Test diagnostic message'],
      severity: DiagnosticSeverity = DiagnosticSeverity.Warning
    ): void {
      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const diagnostics = messages.map((message, index) => ({
        code: index + 1,
        source: 'test',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity,
        message
      }));

      diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics
      });
    }

    setupActiveTextDocId(): void {
      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      this.service['textDocId'] = textDocId;
      this.service['projectId'] = PROJECT_ID;
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
    }

    /**
     * Create a subscription to capture emitted insights.
     */
    captureInsights(): { insights: LynxInsight[]; subscription: Subscription } {
      const insights: LynxInsight[] = [];
      const subscription = this.service.rawInsightSource$.subscribe(newInsights => {
        insights.length = 0;
        insights.push(...newInsights);
      });
      return { insights, subscription };
    }

    triggerBookChapterChange(chapter: number): void {
      bookChapterTestSubject$.next({
        bookId: Canon.bookNumberToId(BOOK_NUM),
        chapter
      });
    }

    triggerProjectChange(id: string): void {
      projectDocTestSubject$.next(this.createMockProjectDoc(id));
    }

    triggerLocaleChange(locale: Locale): void {
      localeTestSubject$.next(locale);
    }

    /**
     * Add an insight directly to the service for testing.
     */
    addInsightToService(insight: LynxInsight): void {
      const curInsights = this.service['curInsights'];
      const docUri = insight.textDocId.toString();
      const existingInsights = curInsights.get(docUri) || [];
      curInsights.set(docUri, [...existingInsights, insight]);
    }

    createTestInsight(options: Partial<LynxInsight> = {}): LynxInsight {
      return {
        id: 'test-id',
        type: 'warning',
        textDocId: new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM),
        range: { index: 0, length: 10 },
        code: '123',
        source: 'test',
        description: 'Test diagnostic',
        ...options
      };
    }
  }

  configureTestingModule(() => ({
    imports: [BrowserModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      LynxWorkspaceService,
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: ActivatedBookChapterService, useMock: mockActivatedBookChapterService },
      { provide: DestroyRef, useMock: mockDestroyRef },
      { provide: TextDocReader, useMock: mockTextDocReader },
      { provide: DocumentManager, useMock: mockDocumentManager },
      { provide: Workspace, useMock: mockWorkspace }
    ]
  }));

  afterEach(() => {
    expect(1).toBe(1); // Avoids 'SPEC HAS NO EXPECTATIONS'
  });

  describe('Initialization', () => {
    it('should update language when locale changes', fakeAsync(() => {
      const env = new TestEnvironment();

      const frenchLocale: Locale = {
        canonicalTag: 'fr',
        localName: 'Français',
        englishName: 'French',
        direction: 'ltr',
        tags: ['fr'],
        production: true
      };
      env.triggerLocaleChange(frenchLocale);
      tick();

      verify(mockWorkspace.changeLanguage('fr')).once();
    }));
  });

  describe('Project activation', () => {
    it('should reset document manager when project is activated', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['projectId'] = 'different-project-id';
      resetCalls(mockDocumentManager);

      env.triggerProjectChange(PROJECT_ID);
      tick();

      verify(mockDocumentManager.reset()).once();
    }));

    it('should not reset document manager when project id is unchanged', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['projectId'] = PROJECT_ID;
      resetCalls(mockDocumentManager);

      env.triggerProjectChange(PROJECT_ID);
      tick();

      verify(mockDocumentManager.reset()).never();
    }));

    it('should clear insights when project changes', fakeAsync(() => {
      const env = new TestEnvironment();

      const insight = env.createTestInsight();
      env.addInsightToService(insight);

      expect([...env.service.currentInsights.values()].flat().length).toBeGreaterThan(0);

      env.service['projectId'] = 'different-id';
      env.triggerProjectChange('new-project');
      tick();

      expect([...env.service.currentInsights.values()].flat().length).toBe(0);
    }));
  });

  describe('Book chapter activation', () => {
    it('should fire document closed event when chapter changes', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['projectId'] = PROJECT_ID;
      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      resetCalls(mockDocumentManager);

      env.triggerBookChapterChange(CHAPTER_NUM + 1);
      tick();

      verify(mockDocumentManager.fireClosed(anything())).once();
    }));

    it('should open document when chapter is activated', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['projectId'] = PROJECT_ID;
      env.service['textDocId'] = undefined;
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
      resetCalls(mockDocumentManager);

      env.triggerBookChapterChange(CHAPTER_NUM);
      tick();

      verify(mockDocumentManager.fireOpened(anything(), anything())).once();
    }));

    it('should update textDocId when chapter changes', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      // First activate chapter 1
      env.triggerBookChapterChange(CHAPTER_NUM);
      tick();

      // Verify initial state
      const initialTextDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      expect(env.service['textDocId']?.toString()).toEqual(initialTextDocId.toString());

      env.triggerBookChapterChange(CHAPTER_NUM + 1);
      tick();

      const expectedTextDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM + 1);
      expect(env.service['textDocId']?.toString()).toEqual(expectedTextDocId.toString());
    }));
  });

  describe('Insights processing', () => {
    it('should process diagnostics into insights', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupActiveTextDocId();
      const { insights, subscription } = env.captureInsights();

      env.triggerDiagnostics(['Test message']);
      tick();

      expect(insights.length).toBe(1);
      expect(insights[0].description).toBe('Test message');
      expect(insights[0].type).toBe('warning');
      expect(insights[0].textDocId.toString()).toBe(new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM).toString());

      subscription.unsubscribe();
    }));

    it('should convert diagnostic severity to appropriate insight type', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupActiveTextDocId();
      const { insights, subscription } = env.captureInsights();

      // Info severity
      env.triggerDiagnostics(['Info message'], DiagnosticSeverity.Information);
      tick();
      expect(insights[0].type).toBe('info');
      expect(insights[0].description).toBe('Info message');

      // Warning severity
      env.triggerDiagnostics(['Warning message'], DiagnosticSeverity.Warning);
      tick();
      expect(insights[0].type).toBe('warning');
      expect(insights[0].description).toBe('Warning message');

      // Error severity
      env.triggerDiagnostics(['Error message'], DiagnosticSeverity.Error);
      tick();
      expect(insights[0].type).toBe('error');
      expect(insights[0].description).toBe('Error message');

      subscription.unsubscribe();
    }));

    it('should maintain insight ids for matching insights', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupActiveTextDocId();
      const { insights, subscription } = env.captureInsights();

      env.triggerDiagnostics(['Test message']);
      tick();
      const firstId = insights[0].id;

      env.triggerDiagnostics(['Test message']);
      tick();

      expect(insights[0].id).toBe(firstId);
      subscription.unsubscribe();
    }));

    it('should remove insights when empty diagnostics are sent', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupActiveTextDocId();
      const { insights, subscription } = env.captureInsights();

      // Add initial insights
      env.triggerDiagnostics(['Test message']);
      tick();
      expect(insights.length).toBe(1);

      // Send empty diagnostics
      env.triggerDiagnostics([]);
      tick();

      expect(insights.length).toBe(0);
      subscription.unsubscribe();
    }));
  });

  describe('getOnTypeEdits', () => {
    it('should return edits for trigger characters', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const delta = new Delta().insert('Hello,');
      let result: Delta[] = [];

      when(mockWorkspace.getOnTypeEdits(anything(), anything(), anything())).thenResolve([
        { retain: 5 },
        { insert: ' ' }
      ]);

      env.service.getOnTypeEdits(delta).then(res => (result = res));
      tick();

      expect(result.length).toBe(1);
      expect(result[0] instanceof Delta).toBe(true);
      expect(result[0].ops).toEqual([{ retain: 5 }, { insert: ' ' }]);
    }));

    it('should handle multiple trigger characters', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const delta = new Delta().insert('Hello, world.');
      let result: Delta[] = [];

      when(mockWorkspace.getOnTypeEdits(anything(), anything(), ',')).thenResolve([{ retain: 6 }, { insert: ' ' }]);
      when(mockWorkspace.getOnTypeEdits(anything(), anything(), '.')).thenResolve([{ retain: 13 }, { insert: ' ' }]);

      env.service.getOnTypeEdits(delta).then(res => (result = res));
      tick();

      expect(result.length).toBe(2);
      expect(result[0].ops).toEqual([{ retain: 13 }, { insert: ' ' }]);
      expect(result[1].ops).toEqual([{ retain: 6 }, { insert: ' ' }]);
    }));

    it('should handle null document when getting on-type edits', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      when(mockDocumentManager.get(anything())).thenReturn(Promise.resolve(undefined));
      const delta = new Delta().insert('Hello,');
      let result: Delta[] = [];

      env.service.getOnTypeEdits(delta).then(res => (result = res));
      tick();

      expect(result).toEqual([]);
    }));
  });

  describe('getActions', () => {
    it('should get actions for an insight', fakeAsync(() => {
      const env = new TestEnvironment();
      const insight = env.createTestInsight();
      let actions: LynxInsightAction[] = [];

      env.service.getActions(insight).then(res => (actions = res));
      tick();

      expect(actions.length).toBe(1);
      expect(actions[0].label).toBe('Fix issue');
      expect(actions[0].isPrimary).toBe(true);
      expect(actions[0].ops).toEqual([{ retain: 0 }, { insert: 'corrected' }, { delete: 10 }]);
    }));

    it('should handle null document when getting actions', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockDocumentManager.get(anything())).thenReturn(Promise.resolve(undefined));
      const insight = env.createTestInsight();
      let actions: LynxInsightAction[] = [];

      env.service.getActions(insight).then(res => (actions = res));
      tick();

      expect(actions).toEqual([]);
    }));
  });
});
