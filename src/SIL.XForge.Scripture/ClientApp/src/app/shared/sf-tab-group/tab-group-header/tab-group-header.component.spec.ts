import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SFTabsModule } from '../sf-tabs.module';
import { TabGroupHeaderComponent } from './tab-group-header.component';

describe('TabGroupHeaderComponent', () => {
  let component: TabGroupHeaderComponent;
  let fixture: ComponentFixture<TabGroupHeaderComponent>;
  type ScrollBySpyFn = jasmine.Spy<{ (options?: ScrollToOptions | undefined): void }>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TabGroupHeaderComponent],
      imports: [SFTabsModule]
    });
    fixture = TestBed.createComponent(TabGroupHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('scroll', () => {
    it('should scroll to the left when called with "left"', () => {
      const spy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component.scroll('start');
      expect(spy).toHaveBeenCalledWith({ left: -5 });
    });

    it('should scroll to the right when called with "right"', () => {
      const spy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component.scroll('end');
      expect(spy).toHaveBeenCalledWith({ left: 5 });
    });
  });

  describe('startButtonScroll', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
      component.stopButtonScroll();
    });

    it('should start scrolling to the left repeatedly when called with "left"', () => {
      const spy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component.startButtonScroll('start');
      jasmine.clock().tick(21); // Simulate 21ms
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ left: -5 });
      jasmine.clock().tick(21); // Simulate another 21ms
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith({ left: -5 });
    });

    it('should start scrolling to the right repeatedly when called with "right"', () => {
      const spy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component.startButtonScroll('end');
      jasmine.clock().tick(21); // Simulate 21ms
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ left: 5 });
      jasmine.clock().tick(21); // Simulate another 21ms
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith({ left: 5 });
    });
  });
});
