import { Component, Input } from '@angular/core';
import { UserProfile } from 'realtime-server/lib/cjs/common/models/user';
import { PwaService } from 'xforge-common/pwa.service';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss']
})
export class AvatarComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() showOnlineStatus: boolean = false;

  constructor(readonly pwaService: PwaService) {}

  get avatarUrl(): string {
    return this.user != null ? this.user.avatarUrl : '';
  }

  get name(): string {
    return this.user != null ? this.user.displayName : '';
  }
}
