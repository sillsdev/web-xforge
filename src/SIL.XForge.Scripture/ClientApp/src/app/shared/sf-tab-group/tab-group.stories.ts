import { Component, Input, OnChanges } from '@angular/core';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { Observable, of } from 'rxjs';
import {
  NewTabMenuItem,
  SFTabsModule,
  TabFactoryService,
  TabInfo,
  TabMenuService,
  TabStateService
} from 'src/app/shared/sf-tab-group';

@Component({
  selector: 'app-tab-group-stories',
  template: `
    <app-tab-group
      *ngIf="tabState.tabGroups$ | async as tabGroups"
      [groupId]="groupId"
      [selectedIndex]="tabGroups.get(groupId).selectedIndex"
      (newTabRequest)="addTab(groupId, $event)"
    >
      <app-tab *ngFor="let tab of tabGroups.get(groupId).tabs; let i = index" [closeable]="tab.closeable">
        <ng-template sf-tab-header><div [innerHTML]="tab.headerText"></div></ng-template>
        <p>Tab {{ i + 1 }} content for a '{{ tab.type }}' tab</p>
      </app-tab>
    </app-tab-group>
  `
})
class SFTabGroupStoriesComponent implements OnChanges {
  @Input() tabs: TabInfo<string>[] = [];
  groupId = 'test';

  constructor(private readonly tabState: TabStateService<string, TabInfo<string>>) {}

  ngOnChanges(): void {
    this.tabState.addTabGroup(this.groupId, this.tabs);
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
          provide: TabMenuService,
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
        },
        {
          provide: TabFactoryService,
          useValue: {
            createTab(tabType: string): TabInfo<string> {
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

              return tab;
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

export const EmptyAddTabMenu: Story = {
  ...Default,
  decorators: [
    moduleMetadata({
      providers: [{ provide: TabMenuService, useValue: { getMenuItems: () => of([]) } }]
    })
  ]
};

export const Narrow: Story = {
  ...Default,
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};
