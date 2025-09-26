import { DestroyRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BrowserModule } from '@angular/platform-browser';
import { DiagnosticsChanged, DiagnosticSeverity, DocumentManager, Position, Workspace } from '@sillsdev/lynx';
import { ScriptureDeltaDocument } from '@sillsdev/lynx-delta';
import { Canon } from '@sillsdev/scripture';
import Delta, { Op } from 'quill-delta';
import { LynxConfig } from 'realtime-server/lib/esm/scriptureforge/models/lynx-config';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { RealtimeService } from 'xforge-common/realtime.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../../../core/models/text-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { LynxInsight, LynxInsightAction } from './lynx-insight';
import { LynxWorkspaceFactory } from './lynx-workspace-factory.service';
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
  const mockWorkspaceFactory = mock<LynxWorkspaceFactory>();

  class TestEnvironment {
    service!: LynxWorkspaceService;
    realtimeService!: TestRealtimeService;
    private customWorkspaceMockSetup?: (workspaceMock: any) => void;

    readonly projectDocTestSubject$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);
    readonly bookChapterTestSubject$ = new BehaviorSubject<RouteBookChapter | undefined>(undefined);
    readonly localeTestSubject$ = new BehaviorSubject<Locale>(defaultLocale);
    readonly diagnosticsChangedTestSubject$ = new Subject<DiagnosticsChanged>();

    constructor(autoInit = true) {
      this.setupMocks();

      if (autoInit) {
        this.init();
      }
    }

    setupMocks(): void {
      when(mockI18nService.localeCode).thenReturn(defaultLocale.canonicalTag);
      when(mockI18nService.locale$).thenReturn(this.localeTestSubject$);
      when(mockActivatedProjectService.projectDoc$).thenReturn(this.projectDocTestSubject$);
      when(mockActivatedBookChapterService.activatedBookChapter$).thenReturn(this.bookChapterTestSubject$);
      when(mockDestroyRef.onDestroy(anything())).thenCall((callback: () => void) => callback());

      when(mockWorkspace.diagnosticsChanged$).thenReturn(this.diagnosticsChangedTestSubject$);
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

      // These mock setups create a fresh workspace mock for each factory call
      when(mockWorkspaceFactory.createWorkspace(anything(), anything())).thenCall(() => {
        const workspaceMock = mock<Workspace<Op>>();
        const changeLanguageSpy = jasmine.createSpy('changeLanguage').and.returnValue(Promise.resolve());
        workspaceMock.changeLanguage = changeLanguageSpy;

        when(workspaceMock.diagnosticsChanged$).thenReturn(this.diagnosticsChangedTestSubject$.asObservable());
        when(workspaceMock.init()).thenReturn(Promise.resolve());
        when(workspaceMock.getOnTypeTriggerCharacters()).thenReturn(['.', ',']);
        when(workspaceMock.getOnTypeEdits(anything(), anything(), anything())).thenReturn(
          Promise.resolve([{ retain: 5 }, { insert: ' ' }])
        );
        when(workspaceMock.getDiagnosticFixes(anything(), anything())).thenReturn(
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

        // Apply any custom mock setup provided by the test
        if (this.customWorkspaceMockSetup) {
          this.customWorkspaceMockSetup(workspaceMock);
        }
        return instance(workspaceMock);
      });
    }

    init(): void {
      this.realtimeService = TestBed.inject<TestRealtimeService>(RealtimeService as any);

      when(mockProjectService.getText(anything(), anything())).thenCall(async textDocId => {
        const id = typeof textDocId === 'string' ? textDocId : textDocId.toString();
        const existingDoc = await this.realtimeService.get<TextDoc>(
          TextDoc.COLLECTION,
          id,
          new DocSubscription('spec')
        );
        return Promise.resolve(existingDoc || this.createTextDoc());
      });

      this.createTextDoc(CHAPTER_NUM);
      this.createTextDoc(CHAPTER_NUM + 1);

      this.service = TestBed.inject(LynxWorkspaceService);
      this.service.init();
      tick();
    }

    resetMockCalls(): void {
      resetCalls(mockWorkspace);
      resetCalls(mockWorkspaceFactory);
      resetCalls(mockDocumentManager);
      resetCalls(mockProjectService);
    }

    async createTextDoc(chapter: number = CHAPTER_NUM, content: Delta | string = TEST_CONTENT): Promise<TextDoc> {
      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, chapter);
      const id = textDocId.toString();
      const delta = typeof content === 'string' ? new Delta().insert(content) : content;

      this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
        id,
        type: 'rich-text',
        data: delta
      });

      return await this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, id, new DocSubscription('spec'));
    }

    createMockProjectDoc(id: string = PROJECT_ID, lynxConfig?: LynxConfig): Promise<SFProjectProfileDoc> {
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
        ],
        ...(lynxConfig && { lynxConfig })
      });

      this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
        id,
        type: 'project',
        data: projectData
      });

      return await this.realtimeService.get<SFProjectProfileDoc>(
        SFProjectProfileDoc.COLLECTION,
        id,
        new DocSubscription('spec')
      );
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

      this.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics
      });
      tick(10); // 10ms debounce time
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
      this.bookChapterTestSubject$.next({
        bookId: Canon.bookNumberToId(BOOK_NUM),
        chapter
      });
      tick();
    }

    async triggerProjectChange(id: string, lynxConfig?: LynxConfig): Promise<void> {
      this.projectDocTestSubject$.next(this.createMockProjectDoc(id, lynxConfig));
      tick();
    }

    setCustomWorkspaceMock(setupFn: (workspaceMock: any) => void): void {
      this.customWorkspaceMockSetup = setupFn;
    }

    triggerLocaleChange(locale: Locale): void {
      this.localeTestSubject$.next(locale);
      tick();
    }

    /**
     * Add an insight directly to the service for testing.
     */
    addInsightToService(insight: LynxInsight): void {
      const curInsightsByEventUriAndSource = this.service['curInsightsByEventUriAndSource'];
      const docUri = insight.textDocId.toString();

      if (!curInsightsByEventUriAndSource.has(docUri)) {
        curInsightsByEventUriAndSource.set(docUri, new Map<string, LynxInsight[]>());
      }

      const uriMap = curInsightsByEventUriAndSource.get(docUri)!;
      const existingInsights = uriMap.get(insight.source) || [];
      uriMap.set(insight.source, [...existingInsights, insight]);

      // Update the flattened cache
      this.service['curInsightsFlattened'] = this.flattenAllInsights(curInsightsByEventUriAndSource);
    }

    /**
     * Flattens the 2D map structure of insights into a single array.
     */
    private flattenAllInsights(insightsByEventUriAndSource: Map<string, Map<string, LynxInsight[]>>): LynxInsight[] {
      const allInsights: LynxInsight[] = [];
      for (const uriMap of insightsByEventUriAndSource.values()) {
        for (const sourceInsights of uriMap.values()) {
          allInsights.push(...sourceInsights);
        }
      }
      return allInsights;
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
      { provide: LynxWorkspaceFactory, useMock: mockWorkspaceFactory }
    ]
  }));

  afterEach(() => {
    expect(1).toBe(1); // Avoids 'SPEC HAS NO EXPECTATIONS'
  });

  describe('Initialization', () => {
    it('should update language when locale changes', fakeAsync(() => {
      const env = new TestEnvironment();

      // Override the workspace factory for this test to use a plain object with a spy
      const changeLanguageSpy = jasmine.createSpy('changeLanguage').and.returnValue(Promise.resolve());
      const workspaceMock = {
        diagnosticsChanged$: env.diagnosticsChangedTestSubject$.asObservable(),
        init: () => Promise.resolve(),
        changeLanguage: changeLanguageSpy,
        getOnTypeTriggerCharacters: () => ['.', ','],
        getOnTypeEdits: () => Promise.resolve([{ retain: 5 }, { insert: ' ' }]),
        getDiagnosticFixes: () =>
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
      };
      when(mockWorkspaceFactory.createWorkspace(anything(), anything())).thenReturn(workspaceMock as any);

      // Set up project and workspace
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
      tick(); // Allow workspace setup to complete

      const frenchLocale: Locale = {
        canonicalTag: 'fr',
        localName: 'Français',
        englishName: 'French',
        direction: 'ltr',
        tags: ['fr'],
        production: true
      };
      env.triggerLocaleChange(frenchLocale);

      expect(changeLanguageSpy.calls.count()).toBe(2);
      expect(changeLanguageSpy.calls.argsFor(0)).toEqual(['en']);
      expect(changeLanguageSpy.calls.argsFor(1)).toEqual(['fr']);
    }));
  });

  describe('Project activation', () => {
    it('should reset document manager when project is activated', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['projectId'] = 'different-project-id';
      resetCalls(mockDocumentManager);

      env.triggerProjectChange(PROJECT_ID);

      verify(mockDocumentManager.reset()).once();
    }));

    it('should not reset document manager when project id is unchanged', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['projectId'] = PROJECT_ID;
      resetCalls(mockDocumentManager);

      env.triggerProjectChange(PROJECT_ID);

      verify(mockDocumentManager.reset()).never();
    }));

    it('should clear insights when project changes', fakeAsync(() => {
      const env = new TestEnvironment();

      const insight = env.createTestInsight();
      env.addInsightToService(insight);

      expect(env.service.currentInsights.length).toBeGreaterThan(0);

      env.service['projectId'] = 'different-id';
      env.triggerProjectChange('new-project');

      expect(env.service.currentInsights.length).toBe(0);
    }));
  });

  describe('Task running status', () => {
    it('should emit false when no project is active', fakeAsync(() => {
      const env = new TestEnvironment();
      let taskRunning: boolean | undefined;

      env.service.taskRunningStatus$.subscribe(status => {
        taskRunning = status;
      });
      tick();

      expect(taskRunning).toBe(false);
    }));

    it('should emit true when project is activated, then false after insights arrive', fakeAsync(() => {
      const env = new TestEnvironment();
      const statusValues: boolean[] = [];

      env.service.taskRunningStatus$.subscribe(status => {
        statusValues.push(status);
      });

      // Initially should be false (no project)
      tick();
      expect(statusValues).toEqual([false]);

      // When project is activated, should emit true (task running)
      env.triggerProjectChange(PROJECT_ID);
      expect(statusValues).toEqual([false, true, false]);
    }));

    it('should restart loading cycle when different project is activated', fakeAsync(() => {
      const env = new TestEnvironment();
      const statusValues: boolean[] = [];

      env.service.taskRunningStatus$.subscribe(status => {
        statusValues.push(status);
      });

      // Initial state and first project
      tick();
      env.triggerProjectChange(PROJECT_ID);
      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete
      expect(statusValues).toEqual([false, true, false]);

      // Switch to different project - should restart loading cycle
      const differentProjectId = 'project02';
      env.triggerProjectChange(differentProjectId);
      env.service['projectId'] = differentProjectId;
      env.service['textDocId'] = new TextDocId(differentProjectId, BOOK_NUM, CHAPTER_NUM);
      tick(); // Allow workspace setup to complete
      expect(statusValues).toEqual([false, true, false, true]);
    }));

    it('should handle empty insights correctly', fakeAsync(() => {
      const env = new TestEnvironment();
      const statusValues: boolean[] = [];

      env.service.taskRunningStatus$.subscribe(status => {
        statusValues.push(status);
      });

      tick();
      env.triggerProjectChange(PROJECT_ID);
      expect(statusValues).toEqual([false, true, false]);
    }));

    it('should use shareReplay to avoid multiple subscriptions triggering multiple emissions', fakeAsync(() => {
      const env = new TestEnvironment();
      const statusValues1: boolean[] = [];
      const statusValues2: boolean[] = [];

      // Create multiple subscriptions
      env.service.taskRunningStatus$.subscribe(status => statusValues1.push(status));
      env.service.taskRunningStatus$.subscribe(status => statusValues2.push(status));

      tick();
      env.triggerProjectChange(PROJECT_ID);
      env.setupActiveTextDocId();
      env.triggerDiagnostics(['Test insight']);

      // Both subscriptions should receive the same values
      expect(statusValues1).toEqual([false, true, false]);
      expect(statusValues2).toEqual([false, true, false]);
    }));
  });

  describe('Book chapter activation', () => {
    it('should fire document closed event when chapter changes', fakeAsync(() => {
      const env = new TestEnvironment();

      // Create project with lynx features enabled so documents will be opened
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      // First, open a document by activating a chapter
      env.triggerBookChapterChange(CHAPTER_NUM);
      tick();

      // Verify document was opened
      verify(mockDocumentManager.fireOpened(anything(), anything())).once();

      // Reset the mock to focus on the close operation
      resetCalls(mockDocumentManager);

      // Now change to a different chapter - this should close the current document
      env.triggerBookChapterChange(CHAPTER_NUM + 1);

      verify(mockDocumentManager.fireClosed(anything())).once();
    }));

    it('should handle book chapters with undefined chapter number', fakeAsync(() => {
      const env = new TestEnvironment();

      // Create project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      // First establish a valid document state
      env.triggerBookChapterChange(CHAPTER_NUM);
      tick();

      // Verify document was opened initially
      verify(mockDocumentManager.fireOpened(anything(), anything())).once();
      expect(env.service['textDocId']).toBeDefined();

      env.resetMockCalls();

      // Now navigate to a book chapter with an undefined chapter number.
      // This can happen when navigating to a book that doesn't have a first chapter.
      // With the null check, this should return early and not perform any operations.
      env.bookChapterTestSubject$.next({
        bookId: Canon.bookNumberToId(BOOK_NUM),
        chapter: undefined
      });
      tick();

      // With the null check, no document operations should occur.
      // The method returns early when textDocId is undefined.
      verify(mockDocumentManager.fireOpened(anything(), anything())).never();
      verify(mockDocumentManager.fireClosed(anything())).never();
      verify(mockDocumentManager.fireChanged(anything(), anything())).never();

      // Verify that the service handled the undefined chapter gracefully
      expect(() => env.service['textDocId']).not.toThrow();
    }));

    it('should open document when chapter is activated', fakeAsync(() => {
      const env = new TestEnvironment();

      // Create project with lynx features enabled so documents will be opened
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);

      env.service['projectId'] = PROJECT_ID;
      env.service['textDocId'] = undefined;
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
      resetCalls(mockDocumentManager);

      env.triggerBookChapterChange(CHAPTER_NUM);

      verify(mockDocumentManager.fireOpened(anything(), anything())).once();
    }));

    it('should update textDocId when chapter changes', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled so documents will be opened
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);

      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      // First activate chapter 1
      env.triggerBookChapterChange(CHAPTER_NUM);

      // Verify initial state
      const initialTextDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      expect(env.service['textDocId']?.toString()).toEqual(initialTextDocId.toString());

      env.triggerBookChapterChange(CHAPTER_NUM + 1);

      const expectedTextDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM + 1);
      expect(env.service['textDocId']?.toString()).toEqual(expectedTextDocId.toString());
    }));
  });

  describe('Insights processing', () => {
    it('should process diagnostics into insights', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const { insights, subscription } = env.captureInsights();

      env.triggerDiagnostics(['Test message']);

      expect(insights.length).toBe(1);
      expect(insights[0].description).toBe('Test message');
      expect(insights[0].type).toBe('warning');
      expect(insights[0].textDocId.toString()).toBe(new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM).toString());

      subscription.unsubscribe();
    }));

    it('should convert diagnostic severity to appropriate insight type', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const { insights, subscription } = env.captureInsights();

      // Info severity
      env.triggerDiagnostics(['Info message'], DiagnosticSeverity.Information);
      expect(insights[0].type).toBe('info');
      expect(insights[0].description).toBe('Info message');

      // Warning severity
      env.triggerDiagnostics(['Warning message'], DiagnosticSeverity.Warning);
      expect(insights[0].type).toBe('warning');
      expect(insights[0].description).toBe('Warning message');

      // Error severity
      env.triggerDiagnostics(['Error message'], DiagnosticSeverity.Error);
      expect(insights[0].type).toBe('error');
      expect(insights[0].description).toBe('Error message');

      subscription.unsubscribe();
    }));

    it('should maintain insight ids for matching insights', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const { insights, subscription } = env.captureInsights();

      env.triggerDiagnostics(['Test message']);
      const firstId = insights[0].id;

      env.triggerDiagnostics(['Test message']);

      expect(insights[0].id).toBe(firstId);
      subscription.unsubscribe();
    }));

    it('should remove insights when empty diagnostics are sent', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const { insights, subscription } = env.captureInsights();

      // Add initial insights
      env.triggerDiagnostics(['Test message']);
      expect(insights.length).toBe(1);

      // Send empty diagnostics
      env.triggerDiagnostics([]);

      expect(insights.length).toBe(0);
      subscription.unsubscribe();
    }));
  });

  describe('getOnTypeEdits', () => {
    it('should return edits for trigger characters', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with auto-corrections enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: false,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      tick(); // Allow workspace setup to complete

      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const delta = new Delta().insert('Hello,');
      let result: Delta[] = [];

      env.service.getOnTypeEdits(delta).then(res => (result = res));
      tick();

      expect(result.length).toBe(1);
      expect(result[0] instanceof Delta).toBe(true);
      expect(result[0].ops).toEqual([{ retain: 5 }, { insert: ' ' }]);
    }));

    it('should handle multiple trigger characters', fakeAsync(() => {
      const env = new TestEnvironment();

      env.setCustomWorkspaceMock((workspaceMock: any) => {
        when(workspaceMock.getOnTypeEdits(anything(), anything(), ',')).thenReturn(
          Promise.resolve([{ retain: 6 }, { insert: ' ' }])
        );
        when(workspaceMock.getOnTypeEdits(anything(), anything(), '.')).thenReturn(
          Promise.resolve([{ retain: 13 }, { insert: ' ' }])
        );
      });

      // Set up project with auto-corrections enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: false,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
      tick(); // Allow workspace setup to complete

      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const delta = new Delta().insert('Hello, world.');
      let result: Delta[] = [];

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

    it('should return empty array when auto-corrections are disabled', fakeAsync(() => {
      const env = new TestEnvironment();
      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);

      // Create project with auto-corrections disabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: false,
        punctuationCheckerEnabled: false,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);

      const delta = new Delta().insert('Hello,');
      let result: Delta[] = [];

      env.service.getOnTypeEdits(delta).then(res => (result = res));
      tick();

      expect(result).toEqual([]);
      // Verify workspace methods were not called since auto-corrections are disabled
      verify(mockWorkspace.getOnTypeEdits(anything(), anything(), anything())).never();
    }));

    it('should return edits when auto-corrections are enabled', fakeAsync(() => {
      const env = new TestEnvironment();

      env.setCustomWorkspaceMock((workspaceMock: any) => {
        when(workspaceMock.getOnTypeEdits(anything(), anything(), anything())).thenReturn(
          Promise.resolve([{ retain: 5 }, { insert: ' ' }])
        );
      });

      // Create project with auto-corrections enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: false,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
      tick(); // Allow workspace setup to complete

      env.service['textDocId'] = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const delta = new Delta().insert('Hello,');
      let result: Delta[] = [];

      env.service.getOnTypeEdits(delta).then(res => (result = res));
      tick();

      expect(result.length).toBe(1);
      expect(result[0].ops).toEqual([{ retain: 5 }, { insert: ' ' }]);
    }));
  });

  describe('getActions', () => {
    it('should get actions for an insight', fakeAsync(() => {
      const env = new TestEnvironment();

      env.setCustomWorkspaceMock((workspaceMock: any) => {
        when(workspaceMock.getDiagnosticFixes(anything(), anything())).thenReturn(
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
      });

      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: true,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);
      tick(); // Allow workspace setup to complete

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

  describe('2D Map Structure - Insights by URI and Source', () => {
    it('should organize insights by URI and diagnostic source', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const { insights, subscription } = env.captureInsights();

      // Create diagnostics from different sources
      const diagnosticsChangedEvent: DiagnosticsChanged = {
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '001',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Warning from source A'
          },
          {
            code: '002',
            source: 'source-b',
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
            severity: DiagnosticSeverity.Error,
            message: 'Error from source B'
          },
          {
            code: '003',
            source: 'source-a',
            range: { start: { line: 0, character: 11 }, end: { line: 0, character: 15 } },
            severity: DiagnosticSeverity.Information,
            message: 'Info from source A'
          }
        ]
      };

      env.diagnosticsChangedTestSubject$.next(diagnosticsChangedEvent);
      tick(10);

      // Should receive 3 insights total
      expect(insights.length).toBe(3);

      // Check that insights from source-a and source-b are properly stored
      const curInsightsByEventUriAndSource = env.service['curInsightsByEventUriAndSource'];
      expect(curInsightsByEventUriAndSource.has(textDocId.toString())).toBe(true);

      const uriMap = curInsightsByEventUriAndSource.get(textDocId.toString())!;
      expect(uriMap.has('source-a')).toBe(true);
      expect(uriMap.has('source-b')).toBe(true);

      const sourceAInsights = uriMap.get('source-a')!;
      const sourceBInsights = uriMap.get('source-b')!;

      expect(sourceAInsights.length).toBe(2); // Warning and Info from source-a
      expect(sourceBInsights.length).toBe(1); // Error from source-b

      subscription.unsubscribe();
    }));

    it('should preserve insights from different sources when one source is updated', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const { insights, subscription } = env.captureInsights();

      // Add insights from source-a
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '001',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Warning from source A'
          }
        ]
      });
      tick(10);

      // Add insights from source-b
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '002',
            source: 'source-b',
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
            severity: DiagnosticSeverity.Error,
            message: 'Error from source B'
          }
        ]
      });
      tick(10);

      expect(insights.length).toBe(2);

      // Update only source-a with new diagnostic
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '003',
            source: 'source-a',
            range: { start: { line: 0, character: 11 }, end: { line: 0, character: 15 } },
            severity: DiagnosticSeverity.Information,
            message: 'Updated insight from source A'
          }
        ]
      });
      tick(10);

      // Should now have insights from both sources
      expect(insights.length).toBe(2);

      const curInsightsByEventUriAndSource = env.service['curInsightsByEventUriAndSource'];
      const uriMap = curInsightsByEventUriAndSource.get(textDocId.toString())!;

      // Source-a should have new insight
      const sourceAInsights = uriMap.get('source-a')!;
      expect(sourceAInsights.length).toBe(1);
      expect(sourceAInsights[0].description).toBe('Updated insight from source A');

      // Source-b should still have original insight
      const sourceBInsights = uriMap.get('source-b')!;
      expect(sourceBInsights.length).toBe(1);
      expect(sourceBInsights[0].description).toBe('Error from source B');

      subscription.unsubscribe();
    }));

    it('should reuse insight ids for matching diagnostics within the same source', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const { insights, subscription } = env.captureInsights();

      // Send initial diagnostic
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '001',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Warning message'
          }
        ]
      });
      tick(10);

      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '002',
            source: 'source-b',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Warning message'
          }
        ]
      });
      tick(10);

      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '003',
            source: 'source-c',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Warning message'
          }
        ]
      });
      tick(10);

      const originalIdA = insights[0].id;
      const originalIdB = insights[1].id;
      const originalIdC = insights[2].id;

      // Send same diagnostic again (simulating re-analysis)
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '001',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Warning message'
          }
        ]
      });
      tick(10);

      // Id should be preserved
      expect(insights[0].id).toBe(originalIdA);
      expect(insights[1].id).toBe(originalIdB);
      expect(insights[2].id).toBe(originalIdC);

      subscription.unsubscribe();
    }));

    it('should flatten 2D map correctly when returning insights', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const textDocId1 = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const textDocId2 = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM + 1);
      const { insights, subscription } = env.captureInsights();

      // Add insights for multiple URIs and sources
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId1.toString(),
        diagnostics: [
          {
            code: '001',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Doc1 Source A'
          },
          {
            code: '002',
            source: 'source-b',
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
            severity: DiagnosticSeverity.Error,
            message: 'Doc1 Source B'
          }
        ]
      });
      tick(10);

      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId2.toString(),
        diagnostics: [
          {
            code: '003',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Information,
            message: 'Doc2 Source A'
          }
        ]
      });
      tick(10);

      // Should receive all insights flattened
      expect(insights.length).toBe(3);

      const descriptions = insights.map(i => i.description).sort();
      expect(descriptions).toEqual(['Doc1 Source A', 'Doc1 Source B', 'Doc2 Source A']);

      subscription.unsubscribe();
    }));

    it('should clear all sources for a URI when empty diagnostics are received', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set up project with lynx features enabled
      const projectDoc = env.createMockProjectDoc(PROJECT_ID, {
        autoCorrectionsEnabled: false,
        assessmentsEnabled: true,
        punctuationCheckerEnabled: true,
        allowedCharacterCheckerEnabled: false
      });
      env.projectDocTestSubject$.next(projectDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectDoc);
      when(mockActivatedProjectService.projectId).thenReturn(PROJECT_ID);

      env.setupActiveTextDocId();
      tick(); // Allow workspace setup to complete

      const textDocId = new TextDocId(PROJECT_ID, BOOK_NUM, CHAPTER_NUM);
      const { insights, subscription } = env.captureInsights();

      // Add insights from multiple sources
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: [
          {
            code: '001',
            source: 'source-a',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: DiagnosticSeverity.Warning,
            message: 'Source A'
          },
          {
            code: '002',
            source: 'source-b',
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
            severity: DiagnosticSeverity.Error,
            message: 'Source B'
          }
        ]
      });
      tick(10);

      expect(insights.length).toBe(2);

      // Send empty diagnostics
      env.diagnosticsChangedTestSubject$.next({
        uri: textDocId.toString(),
        diagnostics: []
      });
      tick(10);

      // All insights should be cleared
      expect(insights.length).toBe(0);

      const curInsightsByEventUriAndSource = env.service['curInsightsByEventUriAndSource'];
      expect(curInsightsByEventUriAndSource.has(textDocId.toString())).toBe(false);

      subscription.unsubscribe();
    }));

    it('should maintain consistent currentInsights getter behavior', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupActiveTextDocId();

      // Add some insights using the internal 2D map structure
      const insight1 = env.createTestInsight({ id: 'test-1', source: 'source-a', description: 'Test 1' });
      const insight2 = env.createTestInsight({ id: 'test-2', source: 'source-b', description: 'Test 2' });

      env.addInsightToService(insight1);
      env.addInsightToService(insight2);

      // Test currentInsights getter
      const ids = env.service.currentInsights.map(i => i.id).sort();
      expect(ids).toEqual(['test-1', 'test-2']);
    }));
  });
});
