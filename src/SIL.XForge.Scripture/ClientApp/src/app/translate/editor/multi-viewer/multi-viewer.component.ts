import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { slice } from 'lodash-es';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { combineLatest } from 'rxjs';
import { Breakpoint, MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
export interface MultiCursorViewer extends UserProfile {
  cursorColor: string;
  activeInEditor: boolean;
}

@Component({
    selector: 'app-multi-viewer',
    templateUrl: './multi-viewer.component.html',
    styleUrls: ['./multi-viewer.component.scss'],
    standalone: false
})
export class MultiViewerComponent implements OnInit {
  @Input() viewers: MultiCursorViewer[] = [];
  @Output() viewerClick: EventEmitter<MultiCursorViewer> = new EventEmitter<MultiCursorViewer>();
  maxAvatars: number = 3;
  isMenuOpen: boolean = false;

  constructor(
    private readonly breakpointObserver: BreakpointObserver,
    private readonly breakpointService: MediaBreakpointService,
    private destroyRef: DestroyRef
  ) {}

  get avatarViewers(): MultiCursorViewer[] {
    if (this.isMenuOpen) return [];

    return this.viewers.length > this.maxAvatars ? slice(this.viewers, 0, this.maxAvatars - 1) : this.viewers;
  }

  get otherViewersLabel(): string {
    return translate('multi_viewer.other_viewers', { count: this.viewers.length });
  }

  ngOnInit(): void {
    combineLatest([
      this.breakpointObserver.observe(this.breakpointService.width('>', Breakpoint.SM)),
      this.breakpointObserver.observe(this.breakpointService.width('<=', Breakpoint.XS))
    ])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([bigger, xs]) => {
        // initialize to 3, but if > SM then set to 6, else if <= XS then set to 1
        this.maxAvatars = bigger.matches ? 6 : xs.matches ? 1 : 3;
      });
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  clickAvatar(viewer: MultiCursorViewer): void {
    this.viewerClick.emit(viewer);
  }
}
