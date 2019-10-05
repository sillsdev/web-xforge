import { Component, Input } from '@angular/core';
import { UserProfile } from 'realtime-server/lib/common/models/user';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html'
})
export class AvatarComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;

  get avatarUrl(): string {
    return this.user != null ? this.user.avatarUrl : '';
  }

  get name(): string {
    return this.user != null ? this.user.displayName : '';
  }
}
