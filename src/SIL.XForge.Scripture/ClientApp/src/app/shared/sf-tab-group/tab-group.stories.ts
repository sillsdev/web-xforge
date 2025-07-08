import { Component, Input, OnChanges } from '@angular/core';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { Observable, of } from 'rxjs';
import { v4 as uuid } from 'uuid';
import {
  SFTabsModule,
  TabFactoryService,
  TabGroup,
  TabInfo,
  TabMenuItem,
  TabMenuService,
  TabStateService
} from '../sf-tab-group';

@Component({
  selector: 'app-tab-group-stories',
  styles: [
    `
      :host {
        display: grid;
        column-gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
      }

      span {
        font-weight: 500;
      }
    `
  ],
  template: `
    @for (tabGroup of tabState.tabGroups$ | async | keyvalue; track tabGroup.key) {
      <app-tab-group
        [groupId]="tabGroup.key"
        [selectedIndex]="tabGroup.value.selectedIndex"
        [connectedTo]="tabState.groupIds$ | async"
      >
        @for (tab of tabGroup.value.tabs; track tab.id) {
          <app-tab [closeable]="tab.closeable" [movable]="tab.movable">
            <ng-template sf-tab-header><div [innerHTML]="tab.headerText"></div></ng-template>
            <p><span [innerHTML]="tab.headerText"></span> in {{ tabGroup.key }}</p>
          </app-tab>
        }
      </app-tab-group>
    }
  `
})
class SFTabGroupStoriesComponent implements OnChanges {
  @Input() tabGroups: TabGroup<string, TabInfo<string>>[] = [];

  constructor(private readonly tabState: TabStateService<string, TabInfo<string>>) {}

  ngOnChanges(): void {
    this.tabGroups.forEach(tabGroup => {
      this.tabState.addTabGroup(tabGroup);
    });
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
            getMenuItems(): Observable<TabMenuItem[]> {
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
            createTab(tabType: string): Promise<TabInfo<string>> {
              let tab: TabInfo<string>;

              switch (tabType) {
                case 'blank':
                  tab = {
                    id: uuid(),
                    type: 'blank',
                    headerText$: 'New tab',
                    closeable: true,
                    movable: true
                  };
                  break;
                case 'type-a':
                  tab = {
                    id: uuid(),
                    type: 'type-a',
                    headerText$: 'Tab A',
                    closeable: true,
                    movable: true
                  };
                  break;
                case 'type-b':
                default:
                  tab = {
                    id: uuid(),
                    type: 'type-b',
                    headerText$: 'Tab B',
                    closeable: true,
                    movable: true
                  };
                  break;
              }

              return Promise.resolve(tab);
            }
          }
        }
      ]
    })
  ]
} as Meta;

type Story = StoryObj<SFTabGroupStoriesComponent>;

const tabGroups: TabGroup<string, TabInfo<string>>[] = [
  new TabGroup<string, TabInfo<string>>('group-1', [
    {
      id: uuid(),
      type: 'type-a',
      headerText$: 'Uncloseable, unmovable Tab 1 is great!',
      closeable: false,
      movable: false
    },
    {
      id: uuid(),
      type: 'type-b',
      headerText$: 'Tab 2 <em>wow!</em>',
      closeable: true,
      movable: true
    },
    {
      id: uuid(),
      type: 'type-c',
      headerText$: 'Tab 3',
      icon: 'book',
      closeable: true,
      movable: true
    }
  ])
];

export const Default: Story = {
  args: {
    tabGroups
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

export const TabReorderAndMove: Story = {
  args: {
    tabGroups: [
      ...tabGroups,
      new TabGroup<string, TabInfo<string>>('group-2', [
        {
          id: uuid(),
          type: 'type-a',
          headerText$: 'Uncloseable, unmovable Tab 1',
          closeable: false,
          movable: false
        },
        { id: uuid(), type: 'type-b', headerText$: 'Tab 2', closeable: true, movable: true },
        { id: uuid(), type: 'type-c', headerText$: 'Tab 3', closeable: true, movable: true },
        { id: uuid(), type: 'type-c', headerText$: 'Tab 4', closeable: true, movable: true }
      ])
    ]
  }
};
