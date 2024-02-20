import { Component, Input, OnChanges } from '@angular/core';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { Observable, of } from 'rxjs';
import { NewTabMenuItem, NewTabMenuManager } from 'src/app/shared/sf-tab-group';
import { TabInfo, TabStateService } from '../tab-state/tab-state.service';
import { SFTabsModule } from './sf-tabs.module';

@Component({
  selector: 'app-tab-group-stories',
  template: `
    <app-tab-group
      *ngIf="tabState.tabGroups$ | async as tabGroups"
      [selectedIndex]="tabGroups.get('test').selectedIndex"
      [showAddTab]="showAddTab"
      [showAddTabMenu]="showAddTabMenu"
      (newTabRequest)="addTab($event)"
      (closeTabRequest)="tabState.removeTab(tabGroup.key, $event.index)"
      (tabSelect)="tabState.selectTab(tabGroup.key, $event.index)"
    >
      <app-tab *ngFor="let tab of tabGroups.get('test').tabs; let i = index" [closeable]="tab.closeable">
        <ng-template sf-tab-header><div [innerHTML]="tab.headerText"></div></ng-template>
        <p>Tab {{ i + 1 }} content for a '{{ tab.type }}' tab</p>
      </app-tab>
    </app-tab-group>
  `
})
class SFTabGroupStoriesComponent implements OnChanges {
  @Input() tabs: TabInfo<string>[] = [];
  @Input() showAddTab: boolean = true;
  @Input() showAddTabMenu: boolean = true;

  constructor(private readonly tabState: TabStateService<string, TabInfo<string>>) {}

  ngOnChanges(): void {
    this.tabState.addTabGroup('test', this.tabs);
  }

  addTab(groupId: string, tabType: string | null): void {
    let tab: TabInfo<string>;

    switch (tabType) {
      case 'blank':
        tab = {
          type: 'blank',
          headerText: 'New tab',
          closeable: true
        };
        break;
      case 'type-a':
        tab = {
          type: 'type-a',
          headerText: 'Tab A',
          closeable: true
        };
        break;
      case 'type-b':
      default:
        tab = {
          type: 'type-b',
          headerText: 'Tab B',
          closeable: true
        };
        break;
    }

    this.tabState.addTab(groupId, tab);
  }
}

export default {
  title: 'Shared/Tab Group',
  component: SFTabGroupStoriesComponent,
  decorators: [
    moduleMetadata({
      imports: [SFTabsModule],
      declarations: [SFTabGroupStoriesComponent],
      providers: [
        TabStateService<string, TabInfo<string>>,
        {
          provide: NewTabMenuManager,
          useValue: {
            getMenuItems(): Observable<NewTabMenuItem[]> {
              return of([
                {
                  type: 'type-a',
                  text: 'Tab A',
                  icon: 'edit'
                },
                {
                  type: 'type-b',
                  text: 'Tab B',
                  icon: 'auto_stories'
                }
              ]);
            }
          }
        }
      ]
    })
  ]
} as Meta;

type Story = StoryObj<SFTabGroupStoriesComponent>;

const tabs: Partial<TabInfo<string>>[] = [
  { type: 'type-a', headerText: 'Tab 1 is great!' },
  { type: 'type-b', headerText: 'Tab 2 <em>wow!</em>' },
  { type: 'type-c', headerText: 'Tab 3' },
  { type: 'type-c', headerText: 'Tab 4' }
];

export const Default: Story = {
  args: {
    tabs: tabs.map((tab, i) => ({ ...tab, closeable: i !== 0 } as TabInfo<string>))
  }
};

export const NoAddTab: Story = {
  args: {
    ...Default.args,
    showAddTab: false
  }
};

export const AddTabWithoutMenu: Story = {
  args: {
    ...Default.args,
    showAddTabMenu: false
  }
};

export const EmptyAddTabMenu: Story = {
  ...Default,
  decorators: [
    moduleMetadata({
      providers: [{ provide: NewTabMenuManager, useValue: { getMenuItems: () => of([]) } }]
    })
  ]
};

export const Narrow: Story = {
  ...Default,
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};
