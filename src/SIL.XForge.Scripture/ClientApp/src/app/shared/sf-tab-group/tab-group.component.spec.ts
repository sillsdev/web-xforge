import { QueryList } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { NewTabMenuManager } from 'src/app/shared/sf-tab-group';
import { TabStateService } from '../tab-state/tab-state.service';
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

  it('should emit "newTabRequest" event when onTabAddRequest is called', () => {
    spyOn(component.newTabRequest, 'emit');
    const newTabType = 'test';
    component.onTabAddRequest(newTabType);
    expect(component.newTabRequest.emit).toHaveBeenCalledWith(newTabType);
  });

  it('should select tab using TabStateService when selectTab is called', () => {
    const tabIndex = 1;
    const tabStateService = TestBed.inject(TabStateService);
    spyOn(tabStateService, 'selectTab');
    component.selectTab(tabIndex);
    expect(tabStateService.selectTab).toHaveBeenCalledWith(component.groupId, tabIndex);
  });

  it('should remove tab using TabStateService when removeTab is called on a removable tab', () => {
    const tabIndex = 1;
    const tabStateService = TestBed.inject(TabStateService);
    spyOn(tabStateService, 'removeTab');
    component.tabs.reset([new TabComponent(), new TabComponent(), new TabComponent()]);
    component.removeTab(tabIndex);
    expect(tabStateService.removeTab).toHaveBeenCalledWith(component.groupId, tabIndex);
  });

  it('should not remove tab using TabStateService when removeTab is called on a non-removable tab', () => {
    const tabIndex = 0;
    const tabStateService = TestBed.inject(TabStateService);
    spyOn(tabStateService, 'removeTab');
    component.removeTab(tabIndex);
    expect(tabStateService.removeTab).not.toHaveBeenCalled();
  });
});
