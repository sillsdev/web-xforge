import { Overlay, OverlayRef, ScrollDispatcher } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { LynxEditor } from './lynx-editor';
import { LynxInsight } from './lynx-insight';
import { LynxInsightOverlayRef, LynxInsightOverlayService } from './lynx-insight-overlay.service';
import { LynxInsightOverlayComponent } from './lynx-insight-overlay/lynx-insight-overlay.component';

describe('LynxInsightOverlayService', () => {
  it('should initially not have an open overlay', () => {
    const env = new TestEnvironment();
    expect(env.service.isOpen).toBeFalse();
  });

  describe('open()', () => {
    it('should not open overlay when insights array is empty', () => {
      const env = new TestEnvironment();
      const { origin, editor } = env.createTestData();

      const result = env.service.open(origin, [], editor);

      expect(result).toBeUndefined();
      expect(env.service.isOpen).toBeFalse();
      env.verifyOverlayNotCreated();
    });

    it('should create and attach an overlay with valid insights', () => {
      const env = new TestEnvironment();
      const { origin, editor, insights } = env.createTestData();

      const result = env.service.open(origin, insights, editor);

      expect(result).toBeDefined();
      expect(env.service.isOpen).toBeTrue();
      env.verifyOverlayCreated();
      env.verifyOverlayAttached();
    });

    it('should close existing overlay before opening a new one', () => {
      const env = new TestEnvironment(2);

      // Open first overlay
      env.openOverlay(0);
      expect(env.service.isOpen).toBeTrue();

      // Open second overlay
      env.openOverlay(1);

      // Verify first overlay was disposed and service remains open
      env.verifyOverlayDisposed(0);
      expect(env.service.isOpen).toBeTrue();
    });

    it('should initialize overlay component with provided insights and editor', () => {
      const env = new TestEnvironment();
      env.openOverlay();

      const portal = env.captureAttachedPortal();

      expect(portal instanceof ComponentPortal).toBeTrue();
      expect(portal.component).toBe(LynxInsightOverlayComponent);
    });
  });

  describe('close()', () => {
    it('should do nothing if no overlay is open', () => {
      const env = new TestEnvironment();

      env.service.close();

      env.verifyOverlayNotDisposed();
      expect(env.service.isOpen).toBeFalse();
    });

    it('should dispose overlay and update isOpen state when called', () => {
      const env = new TestEnvironment();
      env.openOverlay();

      expect(env.service.isOpen).toBeTrue();

      env.service.close();

      expect(env.service.isOpen).toBeFalse();
      env.verifyOverlayDisposed();
    });
  });

  describe('outside click handling', () => {
    it('should close overlay on outside clicks', () => {
      const env = new TestEnvironment();
      env.openOverlay();

      env.simulateClickOutside();

      expect(env.service.close).toHaveBeenCalled();
    });

    it('should not close overlay when clicking on action prompt', () => {
      const env = new TestEnvironment();
      env.openOverlay();

      env.simulateClickOn('app-lynx-insight-action-prompt');

      expect(env.service.close).not.toHaveBeenCalled();
    });

    it('should not close overlay when clicking on action menu', () => {
      const env = new TestEnvironment();
      env.openOverlay();

      env.simulateClickOn('.lynx-insight-action-menu');

      expect(env.service.close).not.toHaveBeenCalled();
    });
  });
});

class TestEnvironment {
  readonly service: LynxInsightOverlayService;

  private readonly mockOverlay = mock(Overlay);
  private readonly mockScrollDispatcher = mock(ScrollDispatcher);
  private readonly overlayRefs: Array<{
    mock: OverlayRef;
    instance: OverlayRef;
    clicks: Subject<MouseEvent>;
    componentInstance: any;
  }> = [];

  constructor(numOverlayRefs = 1) {
    // Create and configure overlay instance
    const overlayInstance = instance(this.mockOverlay);
    overlayInstance.scrollStrategies = {
      reposition: () => ({
        enabled: true,
        autoClose: true,
        scrollThrottle: 0
      })
    } as any;

    when(this.mockOverlay.position()).thenReturn({
      flexibleConnectedTo: () => ({
        withPositions: () => ({
          withGrowAfterOpen: () => ({})
        })
      })
    } as any);

    // Create overlay refs
    for (let i = 0; i < numOverlayRefs; i++) {
      const clicksSubject = new Subject<MouseEvent>();
      const componentInstance = {
        insightDismiss: new Subject(),
        insightHover: new Subject(),
        insightFocus: new Subject()
      };

      const ref = mock(OverlayRef);
      when(ref.outsidePointerEvents()).thenReturn(clicksSubject);
      when(ref.attach(anything())).thenReturn({ instance: componentInstance } as any);

      this.overlayRefs.push({
        mock: ref,
        instance: instance(ref),
        clicks: clicksSubject,
        componentInstance
      });
    }

    // Configure default overlay ref
    if (this.overlayRefs.length > 0) {
      when(this.mockOverlay.create(anything())).thenReturn(this.overlayRefs[0].instance);
    }

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        LynxInsightOverlayService,
        { provide: Overlay, useValue: overlayInstance },
        { provide: ScrollDispatcher, useValue: instance(this.mockScrollDispatcher) }
      ]
    });

    this.service = TestBed.inject(LynxInsightOverlayService);
  }

  createTestData(): { origin: HTMLElement; editor: LynxEditor; editorMock: LynxEditor; insights: LynxInsight[] } {
    const origin = document.createElement('div');
    const editorMock = mock<LynxEditor>();
    when(editorMock.getScrollingContainer()).thenReturn(document.createElement('div'));
    const editor = instance(editorMock);
    const insights = [{ id: 'insight1' } as LynxInsight];
    return { origin, editor, editorMock, insights };
  }

  openOverlay(refIndex = 0): {
    origin: HTMLElement;
    editor: LynxEditor;
    insights: LynxInsight[];
    result: LynxInsightOverlayRef;
  } {
    if (refIndex >= this.overlayRefs.length) {
      throw new Error(`Overlay ref index ${refIndex} out of bounds`);
    }

    when(this.mockOverlay.create(anything())).thenReturn(this.overlayRefs[refIndex].instance);
    const testData = this.createTestData();
    const result = this.service.open(testData.origin, testData.insights, testData.editor)!;

    return { ...testData, result };
  }

  verifyOverlayCreated(): void {
    verify(this.mockOverlay.create(anything())).once();
  }

  verifyOverlayNotCreated(): void {
    verify(this.mockOverlay.create(anything())).never();
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

  simulateClickOutside(): void {
    spyOn(this.service, 'close');
    const clickEvent = new MouseEvent('click');
    const target = document.createElement('div');
    spyOn(target, 'closest').and.returnValue(null);
    Object.defineProperty(clickEvent, 'target', { value: target });
    this.overlayRefs[0].clicks.next(clickEvent);
  }

  simulateClickOn(selector: string): void {
    spyOn(this.service, 'close');
    const clickEvent = new MouseEvent('click');
    const target = document.createElement('div');
    spyOn(target, 'closest').and.callFake(s => (s === selector ? document.createElement('div') : null));
    Object.defineProperty(clickEvent, 'target', { value: target });
    this.overlayRefs[0].clicks.next(clickEvent);
  }
}
