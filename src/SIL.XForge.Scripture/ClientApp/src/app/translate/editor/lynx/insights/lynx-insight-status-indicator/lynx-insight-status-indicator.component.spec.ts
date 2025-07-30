import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { By } from '@angular/platform-browser';
import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { BehaviorSubject } from 'rxjs';
import { mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { CustomIconModule } from '../../../../../shared/custom-icon.module';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxWorkspaceService } from '../lynx-workspace.service';
import { LynxInsightStatusIndicatorComponent } from './lynx-insight-status-indicator.component';

const mockLynxInsightStateService = mock(LynxInsightStateService);
const mockLynxWorkspaceService = mock(LynxWorkspaceService);

describe('LynxInsightStatusIndicatorComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent, LynxInsightStatusIndicatorComponent],
    imports: [MatIconModule, CustomIconModule],
    providers: [
      { provide: LynxInsightStateService, useMock: mockLynxInsightStateService },
      { provide: LynxWorkspaceService, useMock: mockLynxWorkspaceService }
    ]
  }));

  afterEach(() => {
    expect(1).toBe(1); // Avoids 'no expectations'
  });

  it('should toggle panel visibility when clicked', () => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();

    env.component.onClick();
    verify(mockLynxInsightStateService.togglePanelVisibility()).once();

    env.component.onClick();
    verify(mockLynxInsightStateService.togglePanelVisibility()).twice();
  });

  describe('Loading state', () => {
    it('should display loading indicator when task is running', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(true);
      env.fixture.detectChanges();

      expect(env.updateIcon).toBeTruthy();
      expect(env.updateIcon.nativeElement.textContent.trim()).toBe('update');
      expect(env.insightTypeCounts.length).toBe(0);
      expect(env.checkIcon).toBeFalsy();
    });

    it('should react to loading status changes', () => {
      const env = new TestEnvironment();

      // Start with loading
      env.setLoadingStatus(true);
      env.fixture.detectChanges();
      expect(env.updateIcon).toBeTruthy();

      // Change to not loading
      env.setLoadingStatus(false);
      env.setInsightCounts({});
      env.fixture.detectChanges();
      expect(env.updateIcon).toBeFalsy();
      expect(env.checkIcon).toBeTruthy();
    });
  });

  describe('Insight display', () => {
    it('should display check icon when no insights and not loading', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);
      env.setInsightCounts({});
      env.setFilterHidingInsights(false);
      env.fixture.detectChanges();

      expect(env.updateIcon).toBeFalsy();
      expect(env.checkIcon).toBeTruthy();
      expect(env.checkIcon.nativeElement.getAttribute('svgIcon')).toBe('lynx_checkmark');
      expect(env.hiddenIndicatorIcon).toBeFalsy();
      expect(env.insightTypeCounts.length).toBe(0);
    });

    it('should display insight counts by type in correct order', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);
      env.setInsightCounts({ error: 3, warning: 2, info: 1 });
      env.fixture.detectChanges();

      expect(env.updateIcon).toBeFalsy();
      expect(env.checkIcon).toBeFalsy();
      expect(env.insightTypeCounts.length).toBe(3);

      // Check order: info, warning, error
      const typeCountElements = env.insightTypeCounts;
      env.verifyInsightCount(typeCountElements[0], 'info', 1);
      env.verifyInsightCount(typeCountElements[1], 'warning', 2);
      env.verifyInsightCount(typeCountElements[2], 'error', 3);
    });

    it('should only display types with counts greater than zero', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);
      env.setInsightCounts({ error: 0, warning: 5, info: 0 });
      env.fixture.detectChanges();

      expect(env.insightTypeCounts.length).toBe(1);
      env.verifyInsightCount(env.insightTypeCounts[0], 'warning', 5);
    });

    it('should handle partial insight type counts', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);
      env.setInsightCounts({ error: 2, warning: 0, info: 3 });
      env.fixture.detectChanges();

      expect(env.insightTypeCounts.length).toBe(2);

      // Should display info first, then error (skipping warning with 0 count)
      const typeCountElements = env.insightTypeCounts;
      env.verifyInsightCount(typeCountElements[0], 'info', 3);
      env.verifyInsightCount(typeCountElements[1], 'error', 2);
    });

    it('should react to insight count changes', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);

      // Start with no insights
      env.setInsightCounts({});
      env.fixture.detectChanges();
      expect(env.checkIcon).toBeTruthy();
      expect(env.insightTypeCounts.length).toBe(0);

      // Add some insights
      env.setInsightCounts({ error: 1, warning: 2, info: 0 });
      env.fixture.detectChanges();
      expect(env.checkIcon).toBeFalsy();
      expect(env.insightTypeCounts.length).toBe(2);
    });

    it('should handle empty insight counts', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);
      env.setInsightCounts({});
      env.fixture.detectChanges();

      expect(env.checkIcon).toBeTruthy();
      expect(env.insightTypeCounts.length).toBe(0);
    });

    it('should display hidden indicator when filter is hiding insights', () => {
      const env = new TestEnvironment();
      env.setLoadingStatus(false);
      env.setInsightCounts({});
      env.setFilterHidingInsights(true);
      env.fixture.detectChanges();

      expect(env.checkIcon).toBeTruthy();
      expect(env.hiddenIndicatorIcon).toBeTruthy();
      expect(env.hiddenIndicatorIcon.nativeElement.textContent.trim()).toBe('visibility_off');
    });

    it('should handle filter observables correctly', () => {
      const env = new TestEnvironment();

      // Test when filter types array is empty (hiding insights)
      env.setFilterTypes([]);
      env.fixture.detectChanges();

      let isHiding: boolean | undefined;
      env.component.isFilterHidingInsights$.subscribe(value => {
        isHiding = value;
      });
      expect(isHiding).toBe(true);

      // Test when filter types array has values (not hiding insights)
      env.setFilterTypes(['error', 'warning']);
      env.fixture.detectChanges();

      env.component.isFilterHidingInsights$.subscribe(value => {
        isHiding = value;
      });
      expect(isHiding).toBe(false);
    });
  });
});

@Component({
  template: '<app-lynx-insight-status-indicator></app-lynx-insight-status-indicator>',
  standalone: false
})
class HostComponent {
  @ViewChild(LynxInsightStatusIndicatorComponent) component!: LynxInsightStatusIndicatorComponent;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;

  private readonly loadingStatusSubject = new BehaviorSubject<boolean>(false);
  private readonly insightCountsSubject = new BehaviorSubject<Record<LynxInsightType, number>>({
    error: 0,
    warning: 0,
    info: 0
  });
  private readonly filterSubject = new BehaviorSubject<{ types: LynxInsightType[] }>({
    types: ['error', 'warning', 'info']
  });
  constructor() {
    when(mockLynxWorkspaceService.taskRunningStatus$).thenReturn(this.loadingStatusSubject.asObservable());
    when(mockLynxInsightStateService.filteredInsightCountsByType$).thenReturn(this.insightCountsSubject.asObservable());
    when(mockLynxInsightStateService.filter$).thenReturn(this.filterSubject.asObservable());
    when(mockLynxInsightStateService.togglePanelVisibility()).thenReturn();

    this.fixture = TestBed.createComponent(HostComponent);
  }

  get component(): LynxInsightStatusIndicatorComponent {
    return this.fixture.componentInstance.component;
  }

  get hostElement(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-lynx-insight-status-indicator'));
  }

  get updateIcon(): DebugElement {
    return this.fixture.debugElement.query(By.css('.update-icon'));
  }

  get checkIcon(): DebugElement {
    return this.fixture.debugElement.query(By.css('.check-icon'));
  }

  get hiddenIndicatorIcon(): DebugElement {
    return this.fixture.debugElement.query(By.css('.hidden-indicator-icon'));
  }

  get insightTypeCounts(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.type-count'));
  }

  setLoadingStatus(isLoading: boolean): void {
    this.loadingStatusSubject.next(isLoading);
  }

  setInsightCounts(counts: Partial<Record<LynxInsightType, number>>): void {
    const fullCounts: Record<LynxInsightType, number> = {
      error: counts.error ?? 0,
      warning: counts.warning ?? 0,
      info: counts.info ?? 0
    };
    this.insightCountsSubject.next(fullCounts);
  }

  setFilterTypes(types: LynxInsightType[]): void {
    this.filterSubject.next({ types });
  }

  setFilterHidingInsights(isHiding: boolean): void {
    this.setFilterTypes(isHiding ? [] : ['error', 'warning', 'info']);
  }

  verifyInsightCount(element: DebugElement, type: LynxInsightType, expectedCount: number): void {
    const span = element.query(By.css('span'));
    expect(span.nativeElement.textContent.trim()).toBe(expectedCount.toString());
    expect(span.nativeElement.classList).toContain(type);
  }

  verifyNoInsightsDisplayed(): void {
    expect(this.checkIcon).toBeTruthy();
    expect(this.insightTypeCounts.length).toBe(0);
  }

  verifyLoadingState(): void {
    expect(this.updateIcon).toBeTruthy();
    expect(this.updateIcon.nativeElement.textContent.trim()).toBe('update');
    expect(this.insightTypeCounts.length).toBe(0);
    expect(this.checkIcon).toBeFalsy();
  }
}
