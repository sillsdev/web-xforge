import { Component, Input } from '@angular/core';
import { UserProfile } from 'realtime-server/lib/common/models/user';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss']
})
export class AvatarComponent extends SubscriptionDisposable {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() showOnlineStatus: boolean = false;

  isAppOnline: boolean = false;

  constructor(private readonly pwaService: PwaService) {
    super();
    this.subscribe(pwaService.onlineStatus, status => {
      this.isAppOnline = status;
    });
  }

  get avatarUrl(): string {
    return this.user != null ? this.user.avatarUrl : '';
  }

  get name(): string {
    return this.user != null ? this.user.displayName : '';
  }
}
