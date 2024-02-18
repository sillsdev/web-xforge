import { QueryList } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { NewTabMenuManager } from 'src/app/shared/sf-tab-group';
import { SFTabsModule } from './sf-tabs.module';
import { TabGroupComponent } from './tab-group.component';
import { TabComponent } from './tab/tab.component';

describe('TabGroupComponent', () => {
  let component: TabGroupComponent;
  let fixture: ComponentFixture<TabGroupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SFTabsModule],
      declarations: [TabGroupComponent, TabComponent],
      providers: [{ provide: NewTabMenuManager, useValue: { getMenuItems: () => of([]) } }]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabGroupComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();

    // Override with 2 tabs
    component.tabs = new QueryList<TabComponent>();
    component.tabs.reset([new TabComponent(), new TabComponent()]);
  });

  it('should emit "tabSelect" event when a tab is selected', () => {
    spyOn(component.tabSelect, 'emit');
    const tabIndex = 1;
    component.selectTab(tabIndex);
    expect(component.tabSelect.emit).toHaveBeenCalledWith(tabIndex);
  });

  it('should emit "closeTabRequest" event when a removable tab is closed', () => {
    spyOn(component.closeTabRequest, 'emit');
    const tabIndex = 1;
    component.removeTab(tabIndex);
    expect(component.closeTabRequest.emit).toHaveBeenCalledWith(tabIndex);
  });

  it('should not emit "closeTabRequest" event when a non-removable tab is closed', () => {
    spyOn(component.closeTabRequest, 'emit');
    const tabIndex = 0;
    component.removeTab(tabIndex);
    expect(component.closeTabRequest.emit).not.toHaveBeenCalled();
  });
});
