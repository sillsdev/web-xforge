import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabBodyComponent } from './tab-body.component';

describe('TabBodyComponent', () => {
  let component: TabBodyComponent;
  let fixture: ComponentFixture<TabBodyComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TabBodyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('active class binding', () => {
    it('should have the active class when active is true', () => {
      component.active = true;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('active')).toBe(true);
    });

    it('should not have the active class when active is false', () => {
      component.active = false;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.classList.contains('active')).toBe(false);
    });
  });
});
