import { DOCUMENT } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SFTabsModule } from '../../sf-tabs.module';
import { TabScrollButtonComponent } from './tab-scroll-button.component';

describe('TabScrollButtonComponent', () => {
  let component: TabScrollButtonComponent;
  let fixture: ComponentFixture<TabScrollButtonComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SFTabsModule]
    });
    fixture = TestBed.createComponent(TabScrollButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should have class binding equal to side', () => {
    component.side = 'start';
    fixture.detectChanges();
    const el: HTMLElement = fixture.debugElement.nativeElement as HTMLElement;
    expect(el.className).toContain('start');
  });

  it('should emit scrollStart event when mouse is down', () => {
    spyOn(component.scrollStart, 'emit');
    component.isMouseDown = true;
    component.onMouseEnter();
    expect(component.scrollStart.emit).toHaveBeenCalled();
  });

  it('should not emit scrollStart event when mouse is not down', () => {
    spyOn(component.scrollStart, 'emit');
    component.isMouseDown = false;
    component.onMouseEnter();
    expect(component.scrollStart.emit).not.toHaveBeenCalled();
  });

  it('should emit scrollStop event on mouse up or mouse leave if scrolling', () => {
    spyOn(component.scrollStop, 'emit');
    const document = TestBed.inject(DOCUMENT);
    const mouseupEvent = new MouseEvent('mouseup');
    const mouseleaveEvent = new MouseEvent('mouseleave');
    component.scroll$.next(true);
    document.dispatchEvent(mouseupEvent);
    expect(component.scrollStop.emit).toHaveBeenCalled();
    document.dispatchEvent(mouseleaveEvent);
    expect(component.scrollStop.emit).toHaveBeenCalledTimes(1);
  });

  it('should emit scrollStart event on mouse enter if mouse is already down', () => {
    spyOn(component.scrollStart, 'emit');
    component.isMouseDown = true;
    component.scroll$.next(false);
    const button = fixture.debugElement.query(By.css('.tab-scroll-button'));
    button.triggerEventHandler('mouseenter', null);
    expect(component.scrollStart.emit).toHaveBeenCalled();
  });

  it('should not emit scrollStart event on mouse enter if mouse is not down', () => {
    spyOn(component.scrollStart, 'emit');
    component.isMouseDown = false;
    component.scroll$.next(false);
    const button = fixture.debugElement.query(By.css('.tab-scroll-button'));
    button.triggerEventHandler('mouseenter', null);
    expect(component.scrollStart.emit).not.toHaveBeenCalled();
  });

  it('should emit scrollStop event on mouse leave', () => {
    spyOn(component.scrollStop, 'emit');
    component.scroll$.next(true);
    const button = fixture.debugElement.query(By.css('.tab-scroll-button'));
    button.triggerEventHandler('mouseleave', null);
    expect(component.scrollStop.emit).toHaveBeenCalled();
  });
});
