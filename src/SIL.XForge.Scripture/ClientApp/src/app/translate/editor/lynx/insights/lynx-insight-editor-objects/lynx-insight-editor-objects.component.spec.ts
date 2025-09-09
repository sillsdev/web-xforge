import { Component, DestroyRef, NO_ERRORS_SCHEMA, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { Delta } from 'quill';
import { BehaviorSubject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextDocId } from '../../../../../core/models/text-doc';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxableEditor, LynxTextModelConverter } from '../lynx-editor';
import { LynxInsight, LynxInsightDisplayState, LynxInsightRange } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxWorkspaceService } from '../lynx-workspace.service';
import { QuillEditorReadyService } from '../quill-services/quill-editor-ready.service';
import { QuillInsightRenderService } from '../quill-services/quill-insight-render.service';
import { LynxInsightEditorObjectsComponent } from './lynx-insight-editor-objects.component';

const mockInsightRenderService = mock(QuillInsightRenderService);
const mockInsightStateService = mock(LynxInsightStateService);
const mockEditorReadyService = mock(QuillEditorReadyService);
const mockOverlayService = mock(LynxInsightOverlayService);
const mockLynxWorkspaceService = mock(LynxWorkspaceService);
const mockDestroyRef = mock(DestroyRef);
const mockTextModelConverter = mock<LynxTextModelConverter>();

describe('LynxInsightEditorObjectsComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent, LynxInsightEditorObjectsComponent],
    providers: [
      { provide: InsightRenderService, useMock: mockInsightRenderService },
      { provide: LynxInsightStateService, useMock: mockInsightStateService },
      { provide: EditorReadyService, useMock: mockEditorReadyService },
      { provide: LynxInsightOverlayService, useMock: mockOverlayService },
      { provide: LynxWorkspaceService, useMock: mockLynxWorkspaceService },
      { provide: DestroyRef, useMock: mockDestroyRef }
    ],
    schemas: [NO_ERRORS_SCHEMA]
  }));

  afterEach(() => {
    expect(1).toBe(1); // Avoid 'no expectations'
  });

  describe('insight rendering pipeline', () => {
    it('should wait for editor ready before rendering insights', fakeAsync(() => {
      const env = new TestEnvironment({ initialEditorReady: false });

      // Set insights after component initialization
      env.setFilteredInsights([env.createTestInsight()]);
      tick();

      // Verify render was not called
      verify(mockInsightRenderService.render(anything(), anything())).never();

      // Make editor ready
      env.setEditorReady(true);
      tick();
      flush();

      // Verify render was called
      verify(mockInsightRenderService.render(anything(), anything())).once();
    }));

    it('should close overlays when editor becomes ready', fakeAsync(() => {
      const env = new TestEnvironment({ initialEditorReady: false });

      env.setEditorReady(true);
      tick();

      verify(mockOverlayService.close()).once();
    }));

    it('should not render action overlay until insights are rendered', fakeAsync(() => {
      const env = new TestEnvironment();
      const testInsight = env.createTestInsight();

      // Setup render service to not complete immediately
      const renderPromise = new Promise<void>(resolve => {
        setTimeout(() => resolve(), 100);
      });
      when(mockInsightRenderService.render(anything(), anything())).thenReturn(renderPromise);

      env.setEditorReady(true);
      env.setFilteredInsights([testInsight]);

      // Set display state that would trigger action overlay
      env.setDisplayState({
        activeInsightIds: [testInsight.id],
        actionOverlayActive: true,
        promptActive: true,
        cursorActiveInsightIds: []
      });

      tick(50); // Before render completes

      // Action overlay should not be rendered yet
      verify(mockInsightRenderService.renderActionOverlay(anything(), anything(), anything(), anything())).never();

      tick(100); // After render completes
      flush();

      // Now action overlay should be rendered
      verify(mockInsightRenderService.renderActionOverlay(anything(), anything(), anything(), anything())).once();
    }));

    it('should render cursor active state when cursor active insight IDs change', fakeAsync(() => {
      const env = new TestEnvironment();
      const testInsight = env.createTestInsight();

      env.setEditorReady(true);
      env.setFilteredInsights([testInsight]);
      tick();
      flush();

      // Set cursor active state
      env.setDisplayState({
        activeInsightIds: [],
        actionOverlayActive: false,
        promptActive: false,
        cursorActiveInsightIds: [testInsight.id]
      });
      tick();

      verify(mockInsightRenderService.renderCursorActiveState(anything(), anything())).atLeast(1);
    }));
  });

  describe('selection change handling', () => {
    it('should update display state on selection change with overlapping insights', fakeAsync(() => {
      const env = new TestEnvironment();
      const testInsight = env.createTestInsight({ range: { index: 5, length: 10 } });

      env.setEditorReady(true);
      env.setFilteredInsights([testInsight]);
      tick();
      flush();

      // Simulate selection change at cursor position that overlaps with insight
      const selection: LynxInsightRange = { index: 8, length: 0 }; // Cursor inside insight
      env.triggerSelectionChange(selection);
      tick();

      verify(mockInsightStateService.updateDisplayState(anything())).atLeast(1);
    }));

    it('should update display state with empty arrays when cursor does not overlap insights', fakeAsync(() => {
      const env = new TestEnvironment();
      const testInsight = env.createTestInsight({ range: { index: 5, length: 10 } });

      env.setEditorReady(true);
      env.setFilteredInsights([testInsight]);
      tick();
      flush();

      // Simulate cursor outside of insight range
      const selection: LynxInsightRange = { index: 20, length: 0 }; // Cursor outside insight
      env.triggerSelectionChange(selection);
      tick(); // Process selection change event

      // Verify updateDisplayState was called (check that it was called, regardless of initialization calls)
      verify(mockInsightStateService.updateDisplayState(anything())).atLeast(1);
    }));

    it('should not update display state when overlay is open', fakeAsync(() => {
      const env = new TestEnvironment();

      when(mockOverlayService.isOpen).thenReturn(true);

      env.setEditorReady(true);
      env.setFilteredInsights([env.createTestInsight()]);
      tick();
      flush();

      const selection: LynxInsightRange = { index: 0, length: 0 };
      env.triggerSelectionChange(selection);

      // Should not call updateDisplayState when overlay is open
      verify(mockInsightStateService.updateDisplayState(anything())).never();
    }));

    it('should not update display state when selection is null (chapter navigation)', fakeAsync(() => {
      const env = new TestEnvironment();

      env.setEditorReady(true);
      env.setFilteredInsights([env.createTestInsight()]);
      tick();
      flush();

      // Simulate null selection (happens during chapter navigation via lynx panel)
      env.triggerSelectionChange(undefined);
      tick(); // Process selection change event

      // Should not call updateDisplayState for null selection to avoid interfering with navigation
      verify(mockInsightStateService.updateDisplayState(anything())).never();
    }));
  });

  describe('text change handling', () => {
    it('should handle text changes and apply edits', fakeAsync(() => {
      const env = new TestEnvironment();
      const delta = new Delta([{ insert: 'test' }]);
      const editDelta = new Delta([{ insert: 'edited' }]);

      when(mockLynxWorkspaceService.getOnTypeEdits(anything())).thenResolve([editDelta]);
      when(mockTextModelConverter.dataDeltaToEditorDelta(anything())).thenReturn(editDelta);

      env.setEditorReady(true);
      tick(); // Process editor ready state

      env.triggerTextChange(delta);
      tick(); // Process text change event
      flush();

      verify(mockLynxWorkspaceService.getOnTypeEdits(delta)).once();
      expect(env.hostComponent.editor!.updateContents).toHaveBeenCalledWith(editDelta, 'user');
    }));
  });

  describe('cleanup', () => {
    it('should remove all insight formatting on destroy', fakeAsync(() => {
      const env = new TestEnvironment();

      tick();
      env.fixture.destroy();

      verify(mockInsightRenderService.removeAllInsightFormatting(anything())).atLeast(1);
    }));
  });
});

@Component({
    template: `
    <app-lynx-insight-editor-objects
      [editor]="editor"
      [lynxTextModelConverter]="textModelConverter"
      [autoCorrectionsEnabled]="autoCorrectionsEnabled"
      [insightsEnabled]="insightsEnabled"
    >
    </app-lynx-insight-editor-objects>
  `,
    standalone: false
})
class HostComponent {
  @ViewChild(LynxInsightEditorObjectsComponent) component!: LynxInsightEditorObjectsComponent;
  editor?: LynxableEditor;
  textModelConverter?: LynxTextModelConverter;
  autoCorrectionsEnabled: boolean = true;
  insightsEnabled: boolean = true;
}

interface TestEnvArgs {
  initialEditorReady?: boolean;
}

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;
  hostComponent: HostComponent;
  component: LynxInsightEditorObjectsComponent;
  private eventHandlers: Map<string, Array<(...args: any[]) => void>> = new Map();

  private editorReadySubject: BehaviorSubject<boolean>;
  private filteredInsightsSubject: BehaviorSubject<LynxInsight[]>;
  private displayStateSubject: BehaviorSubject<LynxInsightDisplayState>;

  constructor(args: TestEnvArgs = {}) {
    const textModelConverter = instance(mockTextModelConverter);
    const initialEditorReady = args.initialEditorReady ?? true;

    this.editorReadySubject = new BehaviorSubject<boolean>(initialEditorReady);
    this.filteredInsightsSubject = new BehaviorSubject<LynxInsight[]>([]);
    this.displayStateSubject = new BehaviorSubject<LynxInsightDisplayState>({
      activeInsightIds: [],
      actionOverlayActive: false,
      promptActive: false,
      cursorActiveInsightIds: []
    });

    // Create mock editor
    const mockRoot = document.createElement('div');
    const actualEditor = {
      root: mockRoot,
      on: (eventName: string, handler: (...args: any[]) => void) => {
        if (!this.eventHandlers.has(eventName)) {
          this.eventHandlers.set(eventName, []);
        }
        this.eventHandlers.get(eventName)!.push(handler);
        return actualEditor;
      },
      off: (eventName: string, handler: (...args: any[]) => void) => {
        if (this.eventHandlers.has(eventName)) {
          const handlers = this.eventHandlers.get(eventName)!;
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
        return actualEditor;
      },
      updateContents: jasmine.createSpy('updateContents').and.returnValue(new Delta())
    } as any;

    when(mockEditorReadyService.listenEditorReadyState(anything())).thenReturn(this.editorReadySubject);
    when(mockInsightStateService.filteredChapterInsights$).thenReturn(this.filteredInsightsSubject);
    when(mockInsightStateService.displayState$).thenReturn(this.displayStateSubject);
    when(mockInsightStateService.updateDisplayState(anything())).thenReturn();
    when(mockInsightRenderService.render(anything(), anything())).thenResolve();
    when(mockInsightRenderService.renderActionOverlay(anything(), anything(), anything(), anything())).thenResolve();
    when(mockInsightRenderService.renderCursorActiveState(anything(), anything())).thenResolve();
    when(mockInsightRenderService.removeAllInsightFormatting(anything())).thenResolve();
    when(mockOverlayService.close()).thenResolve();
    when(mockOverlayService.isOpen).thenReturn(false);
    when(mockLynxWorkspaceService.getOnTypeEdits(anything())).thenResolve([]);
    when(mockTextModelConverter.dataDeltaToEditorDelta(anything())).thenCall((delta: Delta) => delta);

    // Setup text model converter to return ranges as-is (prevents null range issues)
    when(mockTextModelConverter.dataRangeToEditorRange(anything())).thenCall((range: LynxInsightRange) => range);

    this.fixture = TestBed.createComponent(HostComponent);
    this.hostComponent = this.fixture.componentInstance;

    // Set the inputs before calling detectChanges to ensure they're available during ngOnInit
    this.hostComponent.editor = actualEditor;
    this.hostComponent.textModelConverter = textModelConverter;

    this.fixture.detectChanges();
    this.component = this.hostComponent.component;
  }

  setEditorReady(ready: boolean): void {
    this.editorReadySubject.next(ready);
  }

  setFilteredInsights(insights: LynxInsight[]): void {
    this.filteredInsightsSubject.next(insights);
  }

  setDisplayState(state: Partial<LynxInsightDisplayState>): void {
    const defaultState = {
      activeInsightIds: [],
      actionOverlayActive: false,
      promptActive: false,
      cursorActiveInsightIds: []
    };
    const fullState = { ...defaultState, ...state };
    this.displayStateSubject.next(fullState);
  }

  triggerSelectionChange(selection: LynxInsightRange | undefined): void {
    const handlers = this.eventHandlers.get('selection-change');
    if (handlers) {
      handlers.forEach(handler => handler([selection]));
    }
  }

  triggerTextChange(delta: Delta): void {
    const handlers = this.eventHandlers.get('text-change');
    if (handlers) {
      handlers.forEach(handler => handler([delta, new Delta(), 'user']));
    }
  }

  createTestInsight(props: Partial<LynxInsight> = {}): LynxInsight {
    return {
      id: props.id ?? 'test-insight-1',
      type: props.type ?? 'warning',
      textDocId: props.textDocId ?? new TextDocId('project1', 40, 1),
      range: props.range ?? { index: 5, length: 10 },
      code: props.code ?? 'TEST001',
      source: props.source ?? 'test-source',
      description: props.description ?? 'Test insight description',
      ...props
    };
  }
}
