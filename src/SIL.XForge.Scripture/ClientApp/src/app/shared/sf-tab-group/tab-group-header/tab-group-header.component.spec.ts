import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { TabMenuService } from '../base-services/tab-menu.service';
import { SFTabsModule } from '../sf-tabs.module';
import { TabGroupHeaderComponent } from './tab-group-header.component';

describe('TabGroupHeaderComponent', () => {
  let component: TabGroupHeaderComponent;
  let fixture: ComponentFixture<TabGroupHeaderComponent>;
  type ScrollBySpyFn = jasmine.Spy<{ (options?: ScrollToOptions | undefined): void }>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TabGroupHeaderComponent],
      imports: [SFTabsModule, TestTranslocoModule],
      providers: [{ provide: TabMenuService, useValue: { getMenuItems: () => of([]) } }]
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

  describe('initDirectionChangeDetection', () => {
    let closestDirEl: HTMLElement | null;

    beforeEach(() => {
      closestDirEl = document.createElement('div');
      closestDirEl.setAttribute('dir', 'ltr');
      spyOn(component['elementRef'].nativeElement, 'closest').and.callFake(() => closestDirEl);
    });

    it('should not initialize direction or dirMutObserver when closest dir element is null', () => {
      closestDirEl = null;
      component['dirMutObserver'] = undefined;
      component['initDirectionChangeDetection']();
      expect(component['direction']).toBe('ltr');
      expect(component['dirMutObserver']).toBeUndefined();
    });

    it('should initialize direction and dirMutObserver when closest dir element is not null', () => {
      const mutationObserverSpy = spyOn(window, 'MutationObserver').and.callThrough();
      component['dirMutObserver'] = undefined;
      component['initDirectionChangeDetection']();
      expect(component['direction']).toBe('ltr');
      expect(component['dirMutObserver']).toBeDefined();
      expect(mutationObserverSpy).toHaveBeenCalled();
    });

    it('should update direction and call detectScrollLimit when dir attribute changes', done => {
      const detectScrollLimitSpy = spyOn<any>(component, 'detectScrollLimit');
      component['initDirectionChangeDetection']();
      closestDirEl?.setAttribute('dir', 'rtl');
      fixture.detectChanges();

      setTimeout(() => {
        expect(component['direction']).toBe('rtl');
        expect(detectScrollLimitSpy).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('detectOverflow', () => {
    it('should emit true when tabsWrapper is overflowing', () => {
      component['tabsWrapper'] = {
        scrollWidth: 200,
        clientWidth: 100
      } as any;

      component['detectOverflow']();
      component['overflowing$'].subscribe(isOverflowing => {
        expect(isOverflowing).toBe(true);
      });
    });

    it('should emit false when tabsWrapper is not overflowing', () => {
      component['tabsWrapper'] = {
        scrollWidth: 100,
        clientWidth: 200
      } as any;

      component['detectOverflow']();
      component['overflowing$'].subscribe(isOverflowing => {
        expect(isOverflowing).toBe(false);
      });
    });
  });

  describe('detectScrollLimit', () => {
    it('should set up scroll event handler', fakeAsync(() => {
      const spy = spyOn<any>(component, 'detectScrollLimit');
      component['tabsWrapper'].dispatchEvent(new Event('scroll'));
      tick(100);
      expect(spy).toHaveBeenCalledTimes(1);
    }));

    it('should set isScrollBoundsStart to true when scrollMagnitude is less than threshold', () => {
      component['tabsWrapper'] = {
        scrollLeft: 1,
        scrollWidth: 200,
        clientWidth: 100
      } as any;

      component['detectScrollLimit']();
      expect(component.isScrollBoundsStart).toBe(true);
    });

    it('should set isScrollBoundsStart to false when scrollMagnitude is greater than or equal to threshold', () => {
      component['tabsWrapper'] = {
        scrollLeft: 2,
        scrollWidth: 200,
        clientWidth: 100
      } as any;

      component['detectScrollLimit']();
      expect(component.isScrollBoundsStart).toBe(false);
    });

    it('should set isScrollBoundsEnd to true when (overflowAmount - scrollMagnitude) is less than threshold', () => {
      component['tabsWrapper'] = {
        scrollLeft: 98.5,
        scrollWidth: 200,
        clientWidth: 100
      } as any;

      component['detectScrollLimit']();
      expect(component.isScrollBoundsEnd).toBe(true);
    });

    it('should set isScrollBoundsEnd to false when (overflowAmount - scrollMagnitude) is greater than or equal to threshold', () => {
      component['tabsWrapper'] = {
        scrollLeft: 97,
        scrollWidth: 200,
        clientWidth: 100
      } as any;

      component['detectScrollLimit']();
      expect(component.isScrollBoundsEnd).toBe(false);
    });
  });

  describe('scrollOnWheel', () => {
    it('should set up wheel event handler', () => {
      const spy = spyOn<any>(component, 'scrollOnWheel');
      component['tabsWrapper'].dispatchEvent(new Event('wheel'));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should not scroll when "overflowing$" is false', () => {
      const scrollBySpy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component['overflowing$'].next(false);
      component['scrollOnWheel'](new WheelEvent('wheel', { deltaY: 3 }));
      expect(scrollBySpy).not.toHaveBeenCalled();
    });

    it('should scroll left when "overflowing$" is true and direction is ltr', () => {
      const scrollBySpy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component['overflowing$'].next(true);
      component['direction'] = 'ltr';
      component['scrollOnWheel'](new WheelEvent('wheel', { deltaY: 3 }));
      expect(scrollBySpy).toHaveBeenCalledWith({ left: 1 });
    });

    it('should scroll right when "overflowing$" is true and direction is rtl', () => {
      const scrollBySpy = spyOn(component['tabsWrapper'], 'scrollBy') as ScrollBySpyFn;
      component['overflowing$'].next(true);
      component['direction'] = 'rtl';
      component['scrollOnWheel'](new WheelEvent('wheel', { deltaY: 3 }));
      expect(scrollBySpy).toHaveBeenCalledWith({ left: -1 });
    });
  });

  describe('scrollTabIntoView', () => {
    let scrollIntoViewSpy: jasmine.Spy;
    let scrollToEndSpy: jasmine.Spy;
    const tabHeaderMock = { nativeElement: { scrollIntoView: () => {} } } as any;

    beforeEach(() => {
      scrollIntoViewSpy = spyOn<any>(tabHeaderMock.nativeElement, 'scrollIntoView');
      scrollToEndSpy = spyOn(component, 'scrollToEnd');
    });

    it('should not scroll when tabHeaders is undefined', () => {
      component['tabHeaders'] = undefined;
      component['scrollTabIntoView'](0);
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
    });

    it('should scroll to end when tabIndex is the last non-add tab', fakeAsync(() => {
      component['tabHeaders'] = [tabHeaderMock, tabHeaderMock] as any;
      component['scrollTabIntoView'](0);
      tick();
      expect(scrollToEndSpy).toHaveBeenCalled();
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    }));

    it('should scroll tab into view when tabIndex is not the last non-add tab', fakeAsync(() => {
      component['tabHeaders'] = [tabHeaderMock, tabHeaderMock] as any;
      component['scrollTabIntoView'](1);
      tick();
      expect(scrollIntoViewSpy).toHaveBeenCalled();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
    }));
  });

  describe('movablePredicate', () => {
    let tabToMove: any;
    const cdkDraggingTab = {} as CdkDrag;
    let cdkDropList: CdkDropList;

    describe('move within same tab group', () => {
      beforeEach(() => {
        // Dragging tab is in the drop list (not group transfer)
        cdkDropList = { getSortedItems: () => [{ data: tabToMove } as CdkDrag, cdkDraggingTab] } as CdkDropList;
        tabToMove = {};
      });

      it('should return true when direction is ltr and the tab at index is an "add" tab', () => {
        const index = 0;
        tabToMove.isAddTab = true;
        component.direction = 'ltr';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return true when direction is rtl and the tab at index is an "add" tab', () => {
        const index = 1;
        tabToMove.isAddTab = true;
        component.direction = 'rtl';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return true when direction is ltr and the tab at index is movable', () => {
        const index = 0;
        tabToMove.movable = true;
        component.direction = 'ltr';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return true when direction is rtl and the tab at index is movable', () => {
        const index = 1;
        tabToMove.movable = true;
        component.direction = 'rtl';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return false when direction is ltr and the tab at index is not an "add" and not movable', () => {
        const index = 0;
        tabToMove.movable = false;
        component.direction = 'ltr';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(false);
      });

      it('should return false when direction is rtl and the tab at index is not an "add" and not movable', () => {
        const index = 1;
        tabToMove.movable = false;
        component.direction = 'rtl';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(false);
      });
    });

    describe('transfer to another tab group', () => {
      beforeEach(() => {
        // Dragging tab is not in the drop list (meaning group transfer)
        cdkDropList = {
          getSortedItems: () => [{ data: tabToMove } as CdkDrag, { data: {} } as CdkDrag]
        } as CdkDropList;
        tabToMove = {};
      });

      it('should return true when direction is ltr and the tab at index is an "add" tab', () => {
        const index = 0;
        tabToMove.isAddTab = true;
        component.direction = 'ltr';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return true when direction is rtl and the tab at index is an "add" tab', () => {
        // As of (v16), CDK drag and drop seems to have some issues transferring horizontally-oriented items in RTL.
        // The library passes an index that references the wrong item when transferring groups in RTL.
        const index = 2;
        tabToMove.isAddTab = true;
        component.direction = 'rtl';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return true when direction is ltr and the tab at index is movable', () => {
        const index = 0;
        tabToMove.movable = true;
        component.direction = 'ltr';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return true when direction is rtl and the tab at index is movable', () => {
        const index = 2;
        tabToMove.movable = true;
        component.direction = 'rtl';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(true);
      });

      it('should return false when direction is ltr and the tab at index is not an "add" and not movable', () => {
        const index = 0;
        tabToMove.movable = false;
        component.direction = 'ltr';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(false);
      });

      it('should return false when direction is rtl and the tab at index is not an "add" and not movable', () => {
        const index = 2;
        tabToMove.movable = false;
        component.direction = 'rtl';
        expect(component.movablePredicate(index, cdkDraggingTab, cdkDropList)).toBe(false);
      });
    });
  });
});
