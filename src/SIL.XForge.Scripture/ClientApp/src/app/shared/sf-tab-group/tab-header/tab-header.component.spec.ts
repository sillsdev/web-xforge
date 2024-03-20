import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SFTabsModule } from '../sf-tabs.module';
import { TabHeaderComponent } from './tab-header.component';

describe('SfTabHeaderComponent', () => {
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

  it('should emit tabClick event on click', () => {
    spyOn(component.tabClick, 'emit');
    const event = new MouseEvent('click');
    component.onClick(event);
    expect(component.tabClick.emit).toHaveBeenCalledWith(event);
  });

  it('should emit closeClick event on close', () => {
    spyOn(component.closeClick, 'emit');
    const event = new MouseEvent('click');
    component.close(event);
    expect(component.closeClick.emit).toHaveBeenCalled();
  });
});
