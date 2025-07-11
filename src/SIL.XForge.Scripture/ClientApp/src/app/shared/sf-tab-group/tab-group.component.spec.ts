import { QueryList } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { TabMenuService } from '../../shared/sf-tab-group';
import { TabAddRequestService } from './base-services/tab-add-request.service';
import { TabFactoryService } from './base-services/tab-factory.service';
import { SFTabsModule } from './sf-tabs.module';
import { TabGroupComponent } from './tab-group.component';
import { TabInfo, TabStateService } from './tab-state/tab-state.service';
import { TabComponent } from './tab/tab.component';

describe('TabGroupComponent', () => {
  let component: TabGroupComponent;
  let fixture: ComponentFixture<TabGroupComponent>;
  let tabAddRequestService: TabAddRequestService<string, any>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SFTabsModule, TestTranslocoModule],
      declarations: [TabGroupComponent, TabComponent],
      providers: [
        { provide: TabFactoryService, useValue: { createTab: () => {} } },
        { provide: TabMenuService, useValue: { getMenuItems: () => of([]) } },
        { provide: TabAddRequestService, useValue: { handleTabAddRequest: () => of({}) } },
        TabStateService
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabGroupComponent);
    component = fixture.componentInstance;
    tabAddRequestService = TestBed.inject(TabAddRequestService);

    fixture.detectChanges();

    // Override with 2 tabs
    const tab1 = new TabComponent();
    const tab2 = new TabComponent();
    tab1.closeable = true;
    tab2.closeable = false;
    component.tabs = new QueryList<TabComponent>();
    component.tabs.reset([tab1, tab2]);
  });

  it('should call handleTabAddRequest and addTab when onTabAddRequest is called', () => {
    const newTabType = 'project-resource';
    const tabOptions = { projectId: 'projectId', headerText: 'Tab Header' };

    spyOn(tabAddRequestService, 'handleTabAddRequest').and.returnValue(of(tabOptions));
    spyOn(component, 'addTab');

    component.onTabAddRequest(newTabType);

    expect(tabAddRequestService.handleTabAddRequest).toHaveBeenCalledWith(newTabType);
    expect(component.addTab).toHaveBeenCalledWith(newTabType, tabOptions);
  });

  it('should add tab using TabFactory and TabStateService when addTab is called', () => {
    const newTabType = 'test';
    const tab: TabInfo<string> = {
      id: uuid(),
      type: 'test',
      headerText$: of('Tab Header'),
      closeable: false,
      movable: true
    };

    const tabFactory = TestBed.inject(TabFactoryService);
    const tabStateService = TestBed.inject(TabStateService);

    spyOn(tabFactory, 'createTab').and.returnValue(tab);
    spyOn(tabStateService, 'addTab');

    component.addTab(newTabType);

    expect(tabFactory.createTab).toHaveBeenCalledWith(newTabType, {});
    expect(tabStateService.addTab).toHaveBeenCalledWith(component.groupId, tab);
  });

  it('should select tab using TabStateService when selectTab is called', () => {
    const tabIndex = 1;
    const tabStateService = TestBed.inject(TabStateService);
    spyOn(tabStateService, 'selectTab');
    component.selectTab(tabIndex);
    expect(tabStateService.selectTab).toHaveBeenCalledWith(component.groupId, tabIndex);
  });

  it('should remove tab using TabStateService when removeTab is called on a removable tab', () => {
    const tabIndex = 0;
    const tabStateService = TestBed.inject(TabStateService);
    spyOn(tabStateService, 'removeTab');
    component.tabs.reset([new TabComponent(), new TabComponent(), new TabComponent()]);
    component.removeTab(tabIndex);
    expect(tabStateService.removeTab).toHaveBeenCalledWith(component.groupId, tabIndex);
  });

  it('should not remove tab using TabStateService when removeTab is called on a non-removable tab', () => {
    const tabIndex = 1;
    const tabStateService = TestBed.inject(TabStateService);
    spyOn(tabStateService, 'removeTab');
    component.removeTab(tabIndex);
    expect(tabStateService.removeTab).not.toHaveBeenCalled();
  });
});
