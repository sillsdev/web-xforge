import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SFTabsModule } from '../sf-tabs.module';
import { TabHeaderComponent } from './tab-header.component';

describe('TabHeaderComponent', () => {
  let component: TabHeaderComponent;
  let fixture: ComponentFixture<TabHeaderComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SFTabsModule],
      declarations: [TabHeaderComponent]
    });
    fixture = TestBed.createComponent(TabHeaderComponent);
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
