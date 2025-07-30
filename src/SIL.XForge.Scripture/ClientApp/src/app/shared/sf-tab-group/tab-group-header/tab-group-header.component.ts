import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChildren
} from '@angular/core';
import {
  BehaviorSubject,
  debounceTime,
  distinctUntilChanged,
  fromEvent,
  interval,
  Observable,
  Subscription
} from 'rxjs';
import { LocaleDirection } from 'xforge-common/models/i18n-locale';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TabMenuItem, TabMenuService } from '../../sf-tab-group';
import { TabHeaderPointerEvent, TabLocation, TabMoveEvent } from '../sf-tabs.types';
import { TabHeaderComponent } from '../tab-header/tab-header.component';
import { TabComponent } from '../tab/tab.component';
@Component({
  selector: 'app-tab-group-header',
  templateUrl: './tab-group-header.component.html',
  styleUrls: ['./tab-group-header.component.scss'],
  standalone: false
})
export class TabGroupHeaderComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  @Input() groupId: string = '';
  @Input() tabs: Iterable<TabComponent> = [];
  @Input() selectedIndex = 0;
  @Input() allowDragDrop = true;
  @Input() connectedTo: string[] = [];
  @Output() tabPress = new EventEmitter<TabHeaderPointerEvent>();
  @Output() tabClick = new EventEmitter<TabHeaderPointerEvent>();
  @Output() closeClick = new EventEmitter<number>();
  @Output() tabMove = new EventEmitter<TabMoveEvent<string>>();

  /** Emits `type` from menu selection. */
  @Output() tabAddRequest = new EventEmitter<string>();

  @ViewChildren(TabHeaderComponent, { read: ElementRef }) private tabHeaders?: QueryList<ElementRef>;

  menuItems$?: Observable<TabMenuItem[]>;

  isScrollBoundsStart = false;
  isScrollBoundsEnd = false;
  direction: LocaleDirection = 'ltr';

  // Used to time scroll movements while scrolling via left/right scroll buttons
  private scrollTimer$ = interval(20).pipe(quietTakeUntilDestroyed(this.destroyRef));

  private scrollButtonSubscription?: Subscription;
  private intersectionObserver?: IntersectionObserver;
  private dirMutObserver?: MutationObserver;
  private overflowing$ = new BehaviorSubject(false);
  private tabsWrapper!: HTMLElement;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly tabMenuService: TabMenuService<string>
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.groupId) {
      this.menuItems$ = this.tabMenuService.getMenuItems(this.groupId);
    }

    if (changes.selectedIndex) {
      this.scrollTabIntoView(this.selectedIndex);
    }
  }

  ngOnInit(): void {
    this.tabsWrapper = this.elementRef.nativeElement.querySelector('.tabs')!;

    if (this.tabsWrapper == null) {
      throw new Error('Could not find ".tabs" element');
    }

    // Monitor the ltr/rtl dir in order to correctly calculate scroll bounds
    this.initDirectionChangeDetection();

    this.initOverflowHandler();

    // Check if scroll is at the start or end to enable/disable scroll buttons
    fromEvent(this.tabsWrapper, 'scroll')
      .pipe(quietTakeUntilDestroyed(this.destroyRef), debounceTime(50))
      .subscribe(() => this.detectScrollLimit());

    // Check if scroll is at the start or end to enable/disable scroll buttons
    fromEvent(this.tabsWrapper, 'wheel')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((e: Event) => this.scrollOnWheel(e as WheelEvent));
  }

  ngAfterViewInit(): void {
    // Check for horizontal overflow to display scroll buttons
    this.initOverflowDetection();
  }

  ngOnDestroy(): void {
    this.intersectionObserver?.disconnect();
    this.dirMutObserver?.disconnect();
  }

  movablePredicate(index: number, draggingTab: CdkDrag<TabComponent>, dropList: CdkDropList): boolean {
    const dropListItems = dropList.getSortedItems();
    const draggingTabIndex = dropListItems.indexOf(draggingTab);
    const isGroupTransfer = draggingTabIndex === -1;
    let dragIndex: number = index;

    // As of (v16), CDK drag and drop seems to have some issues transferring horizontally-oriented items in RTL
    if (this.direction === 'rtl') {
      // Reverse the index if RTL.  The sorted items are in DOM order.
      dragIndex = dropListItems.length - 1 - index;

      // Adjust for 1 less drop list item, as the index references the wrong item when transferring groups in RTL
      if (isGroupTransfer) {
        dragIndex += 1;
      }
    }

    const tabToMove: CdkDrag<any> = dropListItems[dragIndex];

    if (tabToMove == null) {
      return false;
    }

    // Can't move item from after immovable to before immovable within same group
    if (!isGroupTransfer && draggingTabIndex > dragIndex) {
      // Disallow move if any items between the drag index and the dragging tab are immovable
      for (let i = dragIndex; i < draggingTabIndex; i++) {
        if (!dropListItems[i].data.movable && !dropListItems[i].data.isAddTab) {
          return false;
        }
      }
    }

    return tabToMove.data.isAddTab || (tabToMove.data as TabComponent).movable;
  }

  onAddTabClicked(): void {
    this.scrollToEnd();
  }

  onTabDrop(event: CdkDragDrop<Iterable<TabComponent>>): void {
    // Convert CdkDragDrop event to TabMoveEvent
    const from: TabLocation<string> = { groupId: event.previousContainer.id, index: event.previousIndex };
    const to: TabLocation<string> = { groupId: event.container.id, index: event.currentIndex };
    this.tabMove.emit({ from, to });
  }

  scrollToEnd(): void {
    this.tabsWrapper.scroll({
      left: this.tabsWrapper.scrollWidth * (this.direction === 'ltr' ? 1 : -1),
      behavior: 'smooth'
    });
  }

  scroll(which: 'start' | 'end'): void {
    const aspect1 = this.direction === 'ltr' ? 1 : -1;
    const aspect2 = which === 'start' ? -1 : 1;
    const polarity = aspect1 * aspect2;

    this.tabsWrapper.scrollBy({
      left: 5 * polarity
    });
  }

  startButtonScroll(which: 'start' | 'end'): void {
    this.startButtonScrolling(which);
  }

  stopButtonScroll(): void {
    this.scrollButtonSubscription?.unsubscribe();
  }

  private initDirectionChangeDetection(): void {
    const closestDirEl: HTMLElement | null = this.elementRef.nativeElement.closest('[dir]');

    if (closestDirEl == null) {
      return;
    }

    this.direction = closestDirEl.dir as LocaleDirection;

    this.dirMutObserver = new MutationObserver(() => {
      this.direction = closestDirEl.dir as LocaleDirection;
      this.detectScrollLimit();
    });
    this.dirMutObserver.observe(closestDirEl, { attributeFilter: ['dir'] });
  }

  private initOverflowDetection(): void {
    this.intersectionObserver = new IntersectionObserver(() => this.detectOverflow(), {
      root: this.tabsWrapper,
      threshold: 1
    });
    this.intersectionObserver.observe(this.tabHeaders?.last.nativeElement);
  }

  private initOverflowHandler(): void {
    // Handle tab overflow
    this.overflowing$
      .pipe(quietTakeUntilDestroyed(this.destroyRef), distinctUntilChanged())
      .subscribe(isOverflowing => {
        const host = this.elementRef.nativeElement;

        if (isOverflowing) {
          host.classList.add('overflowing');
        } else {
          host.classList.remove('overflowing');
        }

        // Enable or disable scroll buttons
        this.detectScrollLimit();
      });
  }

  private detectOverflow(): void {
    // If the element has a scrollbar, it's overflowing
    const isOverflowing = this.tabsWrapper.scrollWidth > this.tabsWrapper.clientWidth;
    this.overflowing$.next(isOverflowing);
  }

  private detectScrollLimit(): void {
    const scrollBox = this.tabsWrapper;
    const overflowAmount = scrollBox.scrollWidth - scrollBox.clientWidth;
    const scrollMagnitude = Math.abs(scrollBox.scrollLeft); // 'scrollLeft' increases to the negative when 'rtl'
    const threshold = 2; // Within 2px for rounding

    this.isScrollBoundsStart = scrollMagnitude < threshold;
    this.isScrollBoundsEnd = overflowAmount - scrollMagnitude < threshold;
  }

  private scrollOnWheel(e: WheelEvent): void {
    if (this.overflowing$.value) {
      // Prevent scroll default to avoid scrolling the page
      e.preventDefault();

      const polarity = this.direction === 'ltr' ? 1 : -1;

      this.tabsWrapper.scrollBy({
        left: (e.deltaY / 3) * polarity
      });
    }
  }

  private startButtonScrolling(which: 'start' | 'end'): void {
    this.scrollButtonSubscription?.unsubscribe();
    this.scrollButtonSubscription = this.scrollTimer$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.scroll(which);
    });
  }

  private scrollTabIntoView(tabIndex: number): void {
    // Wait for repaint
    setTimeout(() => {
      if (this.tabHeaders == null) {
        return;
      }

      // If tab is the last 'non-add-tab', scroll to end to ensure the 'add tab' button is visible
      const lastNonAddTabIndex = this.tabHeaders.length - 2;
      if (tabIndex === lastNonAddTabIndex) {
        this.scrollToEnd();
        return;
      }

      const tabHeaderEl: HTMLElement | undefined = Array.from(this.tabHeaders)[tabIndex]?.nativeElement;

      if (tabHeaderEl != null) {
        tabHeaderEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
      }
    });
  }
}
