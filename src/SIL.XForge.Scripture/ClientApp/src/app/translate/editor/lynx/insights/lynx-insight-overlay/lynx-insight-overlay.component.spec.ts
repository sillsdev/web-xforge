import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TextDocId } from 'src/app/core/models/text-doc';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { LynxEditor, LynxTextModelConverter } from '../lynx-editor';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightAction, LynxInsightConfig } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxWorkspaceService } from '../lynx-workspace.service';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay.component';

const mockLynxInsightStateService = mock(LynxInsightStateService);
const mockLynxInsightOverlayService = mock(LynxInsightOverlayService);
const mockLynxWorkspaceService = mock(LynxWorkspaceService);
const mockLynxEditor = mock<LynxEditor>();
const mockTextModelConverter = mock<LynxTextModelConverter>();

// Default insight config
const defaultInsightConfig: LynxInsightConfig = {
  filter: { types: ['info', 'warning', 'error'], scope: 'chapter' },
  sortOrder: 'severity',
  queryParamName: 'insight',
  actionOverlayApplyPrimaryActionChord: { altKey: true, shiftKey: true, key: 'Enter' },
  panelLinkTextGoalLength: 30,
  panelOptimizationThreshold: 10
};

@Component({
  template: `<app-lynx-insight-overlay
    #overlay
    [insights]="insights"
    [editor]="editor"
    [textModelConverter]="textModelConverter"
  ></app-lynx-insight-overlay>`
})
class HostComponent {
  @ViewChild('overlay') component!: LynxInsightOverlayComponent;
  insights: LynxInsight[] = [];
  editor?: LynxEditor;
  textModelConverter?: LynxTextModelConverter;
}

describe('LynxInsightOverlayComponent', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule],
    declarations: [HostComponent, LynxInsightOverlayComponent],
    providers: [
      { provide: LynxInsightStateService, useMock: mockLynxInsightStateService },
      { provide: LynxInsightOverlayService, useMock: mockLynxInsightOverlayService },
      { provide: LynxWorkspaceService, useMock: mockLynxWorkspaceService },
      { provide: EDITOR_INSIGHT_DEFAULTS, useValue: defaultInsightConfig }
    ]
  }));

  it('should create', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component).toBeTruthy();
  }));

  it('should update contents when primary action clicked', fakeAsync(() => {
    const env = new TestEnvironment();

    env.clickPrimaryActionLink();

    verify(mockTextModelConverter.dataDeltaToEditorDelta(anything())).once();
    verify(mockLynxEditor.updateContents(anything(), 'user')).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;
  hostComponent: HostComponent;
  component: LynxInsightOverlayComponent;

  constructor() {
    // Setup the test environment
    this.fixture = TestBed.createComponent(HostComponent);
    this.hostComponent = this.fixture.componentInstance;
    this.setupEditor();
    this.component = this.hostComponent.component;
  }

  private setupEditor(): void {
    const editor = instance(mockLynxEditor);
    const textModelConverter = instance(mockTextModelConverter);

    const insight = this.createTestInsight();
    const action = this.createTestAction(insight, true);

    // Set up mocks for the editor root element
    const mockRoot = document.createElement('div');
    when(mockLynxEditor.getRoot()).thenReturn(mockRoot);
    when(mockLynxEditor.focus()).thenReturn();
    when(mockLynxEditor.updateContents(anything(), anything())).thenReturn();
    when(mockTextModelConverter.dataDeltaToEditorDelta(anything())).thenCall(delta => delta);
    when(mockLynxWorkspaceService.getActions(anything())).thenResolve([action]);

    this.hostComponent.insights = [insight];
    this.hostComponent.editor = editor;
    this.hostComponent.textModelConverter = textModelConverter;
    this.fixture.detectChanges();
    flush();
    this.fixture.detectChanges();
  }

  clickPrimaryActionLink(): void {
    const link = this.fixture.debugElement.query(By.css('.primary-action a'));
    link.triggerEventHandler('click');
    this.fixture.detectChanges();
  }

  private createTestInsight(props: Partial<LynxInsight> = {}): LynxInsight {
    return {
      id: props.id ?? 'test-insight-1',
      type: props.type ?? 'warning',
      textDocId: props.textDocId ?? new TextDocId('project01', 40, 1),
      range: props.range ?? { index: 5, length: 10 },
      code: props.code ?? 'TEST001',
      source: props.source ?? 'test-source',
      description: props.description ?? 'Test insight description',
      moreInfo: props.moreInfo,
      data: props.data,
      ...props
    };
  }

  private createTestAction(insight: LynxInsight, isPrimary: boolean = false): LynxInsightAction {
    return {
      id: `action-${insight.id}`,
      insight: insight,
      label: `Action for ${insight.description}`,
      description: 'Test action description',
      isPrimary: isPrimary,
      ops: [{ insert: 'test action text' }]
    };
  }
}
