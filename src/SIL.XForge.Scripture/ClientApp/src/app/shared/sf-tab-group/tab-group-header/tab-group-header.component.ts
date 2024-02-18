import {
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
  ViewChild,
  ViewChildren
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatMenuTrigger } from '@angular/material/menu';
import {
  BehaviorSubject,
  debounceTime,
  distinctUntilChanged,
  fromEvent,
  interval,
  Observable,
  Subscription
} from 'rxjs';
import { NewTabMenuItem, NewTabMenuManager } from 'src/app/shared/sf-tab-group';
import { TabHeaderMouseEvent } from '../sf-tabs.types';
import { TabHeaderComponent } from '../tab-header/tab-header.component';
import { TabComponent } from '../tab/tab.component';

type LocaleDirection = 'ltr' | 'rtl';

@Component({
  selector: 'app-tab-group-header',
  templateUrl: './tab-group-header.component.html',
  styleUrls: ['./tab-group-header.component.scss']
})
export class TabGroupHeaderComponent implements OnChanges, OnInit, OnDestroy {
  @Input() groupId: string = '';
  @Input() tabs: Iterable<TabComponent> = [];
  @Input() selectedIndex = 0;
  @Input() showAddTab = true;
  @Input() showAddTabMenu = true;
  @Output() tabClick = new EventEmitter<TabHeaderMouseEvent>();
  @Output() closeClick = new EventEmitter<number>();

  /** Emits `type` from menu selection, or null if `showAddTabMenu` is false */
  @Output() tabAddRequest = new EventEmitter<string | null>();

  @ViewChildren(TabHeaderComponent, { read: ElementRef }) private tabHeaders?: QueryList<ElementRef>;
  @ViewChild('menuTrigger') private menuTrigger?: MatMenuTrigger;

  menuItems$?: Observable<NewTabMenuItem[]>;

  isScrollBoundsStart = false;
  isScrollBoundsEnd = false;

  // Used to time scroll movements while scrolling via left/right scroll buttons
  private scrollTimer$ = interval(20).pipe(takeUntilDestroyed(this.destroyRef));

  private scrollButtonSubscription?: Subscription;
  private resizeObserver?: ResizeObserver;
  private dirMutObserver?: MutationObserver;
  private direction: LocaleDirection = 'ltr';
  private overflowing$ = new BehaviorSubject(false);
  private tabsWrapper!: HTMLElement;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly newTabMenuManager: NewTabMenuManager
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.groupId) {
      this.menuItems$ = this.newTabMenuManager.getMenuItems(changes.groupId.currentValue);
    }

    if (changes.selectedIndex) {
      this.scrollTabIntoView(changes.selectedIndex.currentValue);
    }
  }

  ngOnInit(): void {
    this.tabsWrapper = this.elementRef.nativeElement.querySelector('.tabs')!;

    if (this.tabsWrapper == null) {
      throw new Error('Could not find ".tabs" element');
    }

    // Monitor the ltr/rtl dir in order to correctly calculate scroll bounds
    this.initDirectionChangeDetection();

    // Check for horizontal overflow to display scroll buttons
    this.initResizeDetection();

    this.initOverflowHandler();

    // Check if scroll is at the start or end to enable/disable scroll buttons
    fromEvent(this.tabsWrapper, 'scroll')
      .pipe(takeUntilDestroyed(this.destroyRef), debounceTime(50))
      .subscribe(() => this.detectScrollLimit());

    // Check if scroll is at the start or end to enable/disable scroll buttons
    fromEvent(this.tabsWrapper, 'wheel')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e: Event) => this.scrollOnWheel(e as WheelEvent));
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.dirMutObserver?.disconnect();
  }

  onAddTabClicked(): void {
    this.scrollToEnd();

    if (!this.showAddTabMenu) {
      // Ensure menu is closed
      this.menuTrigger?.closeMenu();
      this.tabAddRequest.next(null);
    }
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

  private initResizeDetection(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.detectOverflow();
    });
    this.resizeObserver.observe(this.tabsWrapper);
  }

  private initOverflowHandler(): void {
    // Handle tab overflow
    this.overflowing$.pipe(takeUntilDestroyed(this.destroyRef), distinctUntilChanged()).subscribe(isOverflowing => {
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

    // Within 2px for rounding
    this.isScrollBoundsStart = scrollMagnitude < 2;
    this.isScrollBoundsEnd = overflowAmount - scrollMagnitude < 2;
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
    this.scrollButtonSubscription = this.scrollTimer$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
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
      if (this.showAddTab) {
        const lastNonAddTabIndex = this.tabHeaders.length - 2;
        if (tabIndex === lastNonAddTabIndex) {
          this.scrollToEnd();
          return;
        }
      }

      const tabHeaderEl: HTMLElement | undefined = Array.from(this.tabHeaders)[tabIndex]?.nativeElement;

      if (tabHeaderEl != null) {
        tabHeaderEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
      }
    });
  }
}
