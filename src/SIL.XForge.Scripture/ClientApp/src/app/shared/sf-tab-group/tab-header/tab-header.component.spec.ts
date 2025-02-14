import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { SFTabsModule } from '../sf-tabs.module';
import { TabHeaderComponent } from './tab-header.component';

describe('TabHeaderComponent', () => {
  let component: TabHeaderComponent;
  let fixture: ComponentFixture<TabHeaderComponent>;
  let harnessLoader: HarnessLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SFTabsModule]
    });
    fixture = TestBed.createComponent(TabHeaderComponent);
    harnessLoader = TestbedHarnessEnvironment.loader(fixture);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('closeable class binding', () => {
    it('should have the "closeable" class when closeable is true', () => {
      component.closeable = true;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('closeable')).toBe(true);
    });

    it('should not have the "closeable" class when closeable is false', () => {
      component.closeable = false;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('closeable')).toBe(false);
    });
  });

  describe('movable class binding', () => {
    it('should have the "movable" class when movable is true', () => {
      component.movable = true;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('movable')).toBe(true);
    });

    it('should not have the "movable" class when movable is false', () => {
      component.movable = false;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('movable')).toBe(false);
    });
  });

  describe('active class binding', () => {
    it('should have the "active" class when active is true', () => {
      component.active = true;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('active')).toBe(true);
    });

    it('should not have the "active" class when active is false', () => {
      component.active = false;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('active')).toBe(false);
    });
  });

  describe('tooltip', () => {
    it('should set the tooltip', async () => {
      component.tooltip = 'tooltip';
      fixture.detectChanges();

      const tooltipHarness: MatTooltipHarness = await harnessLoader.getHarness(MatTooltipHarness);
      await tooltipHarness.show();
      expect(await tooltipHarness.getTooltipText()).toEqual('tooltip');
    });
  });

  it('should emit tabClick event on click', () => {
    spyOn(component.tabClick, 'emit');
    const event = new MouseEvent('click');
    component.onClick(event);
    expect(component.tabClick.emit).toHaveBeenCalledWith(event);
  });

  it('should emit closeClick event on close', () => {
    spyOn(component.closeClick, 'emit');
    const event = new MouseEvent('click');
    component.onCloseClick(event);
    expect(component.closeClick.emit).toHaveBeenCalled();
  });
});
