import { Component, Input } from '@angular/core';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { OnlineStatusService } from 'xforge-common/online-status.service';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss']
})
export class AvatarComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() borderColor?: string;
  @Input() showOnlineStatus: boolean = false;

  constructor(readonly onlineStatusService: OnlineStatusService) {}

  get avatarUrl(): string {
    return this.user != null ? this.user.avatarUrl : '';
  }

  get name(): string {
    return this.user != null ? this.user.displayName : '';
  }
}
