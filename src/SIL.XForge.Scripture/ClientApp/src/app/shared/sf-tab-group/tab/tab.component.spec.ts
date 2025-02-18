import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabComponent } from './tab.component';

describe('TabComponent', () => {
  let component: TabComponent;
  let fixture: ComponentFixture<TabComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should have contentTemplate defined after view initialization', () => {
    fixture.detectChanges();
    expect(component.contentTemplate).toBeDefined();
  });

  it('should have tabHeaderTemplate undefined by default', () => {
    expect(component.tabHeaderTemplate).toBeUndefined();
  });
});
