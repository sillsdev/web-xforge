import { Component, Input, OnInit } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { translate } from '@ngneat/transloco';
import { slice } from 'lodash-es';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { filter, map } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

export interface MultiCursorViewer extends UserProfile {
  cursorColor: string;
}

@Component({
  selector: 'app-multi-viewer',
  templateUrl: './multi-viewer.component.html',
  styleUrls: ['./multi-viewer.component.scss']
})
export class MultiViewerComponent extends SubscriptionDisposable implements OnInit {
  @Input() viewers: MultiCursorViewer[] = [];
  maxAvatars: number = 3;
  isMenuOpen: boolean = false;

  constructor(private readonly media: MediaObserver) {
    super();
  }

  get avatarViewers(): MultiCursorViewer[] {
    if (this.isMenuOpen) return [];

    return this.viewers.length > this.maxAvatars ? slice(this.viewers, 0, this.maxAvatars - 1) : this.viewers;
  }

  get otherViewersLabel(): string {
    return translate('editor.other_viewers', { count: this.viewers.length });
  }

  ngOnInit(): void {
    this.subscribe(
      this.media.asObservable().pipe(
        filter((changes: MediaChange[]) => changes.length > 0),
        map((changes: MediaChange[]) => changes[0])
      ),
      (change: MediaChange) => {
        const isViewportBigger = ['xl', 'lt-xl', 'lg', 'lt-lg', 'md', 'lt-md'].includes(change.mqAlias);
        this.maxAvatars = isViewportBigger ? 6 : 3;
        const isViewportXS = ['xs'].includes(change.mqAlias);
        this.maxAvatars = isViewportXS ? 1 : this.maxAvatars;
      }
    );
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }
}
