import { Overlay, OverlayRef, ScrollDispatcher } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { LynxEditor } from './lynx-editor';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayRef, LynxInsightOverlayService } from './lynx-insight-overlay.service';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

const mockOverlay = mock(Overlay);
const mockScrollDispatcher = mock(ScrollDispatcher);

describe('LynxInsightOverlayService', () => {
  configureTestingModule(() => ({
    providers: [
      LynxInsightOverlayService,
      { provide: Overlay, useMock: mockOverlay },
      { provide: ScrollDispatcher, useMock: mockScrollDispatcher }
    ]
  }));

  it('should initially not have an open overlay', () => {
    const env = new TestEnvironment();
    expect(env.service.isOpen).toBeFalse();
  });

  describe('open()', () => {
    it('should not open overlay when insights array is empty', fakeAsync(() => {
      const env = new TestEnvironment();
      const { origin, editor } = env.createTestData();

      const result = env.service.open(origin, [], editor);
      tick();

      expect(result).toBeUndefined();
      expect(env.service.isOpen).toBeFalse();
      env.verifyOverlayNotCreated();
    }));

    it('should create and attach an overlay with valid insights', fakeAsync(() => {
      const env = new TestEnvironment();
      const { result } = env.openOverlay();

      expect(result).toBeDefined();
      expect(env.service.isOpen).toBeTrue();
      env.verifyOverlayCreated();
      env.verifyOverlayAttached();
    }));

    it('should close existing overlay before opening a new one', fakeAsync(() => {
      const env = new TestEnvironment(2);

      // Open first overlay
      env.openOverlay(0);
      expect(env.service.isOpen).toBeTrue();

      // Open second overlay
      env.openOverlay(1);

      // Verify first overlay was disposed and service remains open
      env.verifyOverlayDisposed(0);
      expect(env.service.isOpen).toBeTrue();
    }));

    it('should initialize overlay component with provided insights and editor', fakeAsync(() => {
      const env = new TestEnvironment();
      const { insights, editor } = env.openOverlay();

      const portal = env.captureAttachedPortal();
      const componentInstance = env.getComponentInstance();

      expect(portal instanceof ComponentPortal).toBeTrue();
      expect(portal.component).toBe(LynxInsightOverlayComponent);
      expect(componentInstance.insights).toBe(insights);
      expect(componentInstance.editor).toBe(editor);
    }));

    it('should ensure overlay is within editor bounds when overlay extends beyond bottom edge', fakeAsync(() => {
      const env = new TestEnvironment();

      // Configure container and overlay dimensions (overlay bottom extends past container bottom)
      const containerRect = { top: 0, right: 500, bottom: 400, left: 0, width: 500, height: 400 };
      const overlayRect = { top: 350, right: 450, bottom: 550, left: 50, width: 400, height: 200 };
      env.configureElementRects(containerRect, overlayRect);

      env.openOverlay();

      // Should scroll by (550 - 400 + 10) = 160 pixels (includes SCROLL_CUSHION)
      expect(env.getScrollContainer().scrollTop).toBe(160);
    }));

    it('should not scroll editor when overlay is already within editor bounds', fakeAsync(() => {
      const env = new TestEnvironment();

      // Configure container and overlay dimensions (overlay is fully visible)
      const containerRect = { top: 0, right: 500, bottom: 400, left: 0, width: 500, height: 400 };
      const overlayRect = { top: 100, right: 450, bottom: 300, left: 50, width: 400, height: 200 };
      env.configureElementRects(containerRect, overlayRect);

      env.openOverlay();

      // Scrolling should not occur
      expect(env.getScrollContainer().scrollTop).toBe(0);
    }));
  });

  describe('close()', () => {
    it('should do nothing if no overlay is open', () => {
      const env = new TestEnvironment();

      env.service.close();

      env.verifyOverlayNotDisposed();
      expect(env.service.isOpen).toBeFalse();
    });

    it('should dispose overlay and update isOpen state when called', fakeAsync(() => {
      const env = new TestEnvironment();
      env.openOverlay();
      expect(env.service.isOpen).toBeTrue();

      env.service.close();

      expect(env.service.isOpen).toBeFalse();
      env.verifyOverlayDisposed();
      tick();
    }));
  });

  describe('outside click handling', () => {
    it('should close overlay on outside clicks', fakeAsync(() => {
      const env = new TestEnvironment();
      env.openOverlay();

      env.simulateClick(null);

      expect(env.service.close).toHaveBeenCalled();
    }));

    it('should not close overlay when clicking on action prompt', fakeAsync(() => {
      const env = new TestEnvironment();
      env.openOverlay();

      env.simulateClick('app-lynx-insight-action-prompt');

      expect(env.service.close).not.toHaveBeenCalled();
    }));

    it('should not close overlay when clicking on action menu', fakeAsync(() => {
      const env = new TestEnvironment();
      env.openOverlay();

      env.simulateClick('.lynx-insight-action-menu');

      expect(env.service.close).not.toHaveBeenCalled();
    }));
  });
});

class TestEnvironment {
  readonly service: LynxInsightOverlayService;

  private readonly overlayRefs: Array<{
    mock: OverlayRef;
    instance: OverlayRef;
    clicks: Subject<MouseEvent>;
    componentInstance: any;
    overlayElement: HTMLElement;
  }> = [];

  private containerElement: HTMLElement;
  private containerRectConfig: DOMRect | null = null;
  private overlayRectConfig: DOMRect | null = null;

  constructor(numOverlayRefs = 1) {
    this.containerElement = this.createContainerElement();
    this.setupOverlayMocks(numOverlayRefs);
    this.configureMockRects();

    this.service = TestBed.inject(LynxInsightOverlayService);
  }

  private createContainerElement(): HTMLElement {
    const element = document.createElement('div');
    Object.defineProperty(element, 'scrollTop', {
      value: 0,
      writable: true
    });
    return element;
  }

  private setupOverlayMocks(numOverlayRefs: number): void {
    // Configure overlay instance
    const overlayInstance = instance(mockOverlay);
    overlayInstance.scrollStrategies = {
      reposition: () => ({
        enabled: true,
        autoClose: true,
        scrollThrottle: 0
      })
    } as any;

    when(mockOverlay.position()).thenReturn({
      flexibleConnectedTo: () => ({
        withPositions: () => ({
          withGrowAfterOpen: () => ({})
        })
      })
    } as any);

    // Create overlay refs
    for (let i = 0; i < numOverlayRefs; i++) {
      this.createOverlayRef();
    }

    // Configure default overlay ref
    if (this.overlayRefs.length > 0) {
      when(mockOverlay.create(anything())).thenReturn(this.overlayRefs[0].instance);
    }
  }

  /**
   * Creates a single overlay reference with mocks.
   */
  private createOverlayRef(): void {
    const clicksSubject = new Subject<MouseEvent>();
    const componentInstance = {
      insightDismiss: new Subject(),
      insightHover: new Subject(),
      insightFocus: new Subject()
    };

    const overlayElement = document.createElement('div');
    const ref = mock(OverlayRef);

    when(ref.outsidePointerEvents()).thenReturn(clicksSubject);
    when(ref.attach(anything())).thenReturn({ instance: componentInstance } as any);
    when(ref.overlayElement).thenReturn(overlayElement);

    this.overlayRefs.push({
      mock: ref,
      instance: instance(ref),
      clicks: clicksSubject,
      componentInstance,
      overlayElement
    });
  }

  createTestData(): { origin: HTMLElement; editor: LynxEditor; editorMock: LynxEditor; insights: LynxInsight[] } {
    const origin = document.createElement('div');
    const editorMock = mock<LynxEditor>();
    when(editorMock.getScrollingContainer()).thenReturn(this.containerElement);
    const editor = instance(editorMock);
    const insights = [{ id: 'insight1' } as LynxInsight];
    return { origin, editor, editorMock, insights };
  }

  /**
   * Configures mock element dimensions for container and overlay.
   */
  configureElementRects(containerRect: DOMRect | object, overlayRect: DOMRect | object): void {
    this.containerRectConfig = containerRect as DOMRect;
    this.overlayRectConfig = overlayRect as DOMRect;
    this.configureMockRects();
  }

  /**
   * Updates the getBoundingClientRect mock implementations.
   */
  private configureMockRects(): void {
    // Default dimensions
    const defaultContainerRect = { top: 0, right: 800, bottom: 600, left: 0, width: 800, height: 600 } as DOMRect;
    const defaultOverlayRect = { top: 100, right: 500, bottom: 300, left: 100, width: 400, height: 200 } as DOMRect;

    // Override getBoundingClientRect for container
    this.containerElement.getBoundingClientRect = () => this.containerRectConfig ?? defaultContainerRect;

    // Override getBoundingClientRect for overlay elements
    this.overlayRefs.forEach(ref => {
      ref.overlayElement.getBoundingClientRect = () => this.overlayRectConfig ?? defaultOverlayRect;
    });
  }

  getScrollContainer(): HTMLElement {
    return this.containerElement;
  }

  getComponentInstance(refIndex = 0): any {
    return this.overlayRefs[refIndex].componentInstance;
  }

  /**
   * Opens an overlay with the given ref index and processes setTimeout.
   */
  openOverlay(refIndex = 0): {
    origin: HTMLElement;
    editor: LynxEditor;
    insights: LynxInsight[];
    result: LynxInsightOverlayRef;
  } {
    if (refIndex >= this.overlayRefs.length) {
      throw new Error(`Overlay ref index ${refIndex} out of bounds`);
    }

    when(mockOverlay.create(anything())).thenReturn(this.overlayRefs[refIndex].instance);
    const testData = this.createTestData();
    const result = this.service.open(testData.origin, testData.insights, testData.editor)!;
    tick(); // Process setTimeout

    return { ...testData, result };
  }

  verifyOverlayCreated(): void {
    verify(mockOverlay.create(anything())).once();
  }

  verifyOverlayNotCreated(): void {
    verify(mockOverlay.create(anything())).never();
  }

  verifyOverlayAttached(): void {
    verify(this.overlayRefs[0].mock.attach(anything())).once();
  }

  verifyOverlayDisposed(refIndex = 0): void {
    verify(this.overlayRefs[refIndex].mock.dispose()).once();
  }

  verifyOverlayNotDisposed(): void {
    verify(this.overlayRefs[0].mock.dispose()).never();
  }

  captureAttachedPortal(): ComponentPortal<LynxInsightOverlayComponent> {
    const portalCaptor = capture<ComponentPortal<LynxInsightOverlayComponent>>(this.overlayRefs[0].mock.attach);
    return portalCaptor.last()[0];
  }

  /**
   * Simulates a click with optional element targeting.
   * @param selector If null, simulates a click outside. Otherwise, simulates a click on the given selector.
   */
  simulateClick(selector: string | null): void {
    spyOn(this.service, 'close');
    const clickEvent = new MouseEvent('click');
    const target = document.createElement('div');

    if (selector === null) {
      spyOn(target, 'closest').and.returnValue(null);
    } else {
      spyOn(target, 'closest').and.callFake(s => (s === selector ? document.createElement('div') : null));
    }

    Object.defineProperty(clickEvent, 'target', { value: target });
    this.overlayRefs[0].clicks.next(clickEvent);
  }
}
